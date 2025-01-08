/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  DBHandlerServer,
  DboBuilder,
  PRGLIOSocket,
  TableInfo,
  TableOrViewInfo,
} from "../DboBuilder/DboBuilder";
import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { DB } from "../Prostgles";
import { addSync } from "./addSync";
import { addTrigger } from "./addTrigger";
import { initialiseEventTriggers } from "./initialiseEventTriggers";
import { initPubSubManager } from "./initPubSubManager";
import { refreshTriggers } from "./refreshTriggers";
import { deleteOrphanedTriggers } from "./deleteOrphanedTriggers";

import * as pgPromise from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";

import {
  AnyObject,
  CHANNELS,
  FieldFilter,
  SelectParams,
  SubscribeParams,
  WAL,
} from "prostgles-types";

import { find, pickKeys } from "prostgles-types/dist/util";
import { LocalFuncs, getOnDataFunc, matchesLocalFuncs } from "../DboBuilder/ViewHandler/subscribe";
import { EventTypes } from "../Logging";
import { TableRule } from "../PublishParser/PublishParser";
import { syncData } from "../SyncReplication";
import { addSub } from "./addSub";
import { notifListener } from "./notifListener";
import { pushSubData } from "./pushSubData";

type PGP = pgPromise.IMain<{}, pg.IClient>;
export const pgp: PGP = pgPromise({});
export const asValue = (v: any) => pgp.as.format("$1", [v]);
export const DEFAULT_SYNC_BATCH_SIZE = 50;

export const log = (...args: any[]) => {
  if (process.env.TEST_TYPE) {
    console.log(...args);
  }
};

export type BasicCallback = (err?: any, res?: any) => void;

export type SyncParams = {
  socket_id: string;
  sid: string | undefined;
  channel_name: string;
  table_name: string;
  table_rules?: TableRule;
  synced_field: string;
  id_fields: string[];
  batch_size: number;
  filter: object;
  params: {
    select: FieldFilter;
  };
  condition: string;
  wal?: WAL;
  throttle?: number;
  lr?: AnyObject;
  last_synced: number;
  is_syncing: boolean;
};

export type AddSyncParams = {
  socket: PRGLIOSocket;
  table_info: TableInfo;
  table_rules: TableRule;
  synced_field: string;
  allow_delete?: boolean;
  id_fields: string[];
  filter: object;
  params: {
    select: FieldFilter;
  };
  condition: string;
  throttle?: number;
};

export type ViewSubscriptionOptions = (
  | {
      type: "view";
      viewName: string;
      definition: string;
    }
  | {
      type: "table";
      viewName?: undefined;
      definition?: undefined;
    }
) & {
  relatedTables: {
    tableName: string;
    tableNameEscaped: string;
    condition: string;
  }[];
};

export type SubscriptionParams = Pick<SubscribeParams, "throttle" | "throttleOpts"> & {
  socket_id?: string;
  channel_name: string;

  /**
   * If this is a view then an array with all related tables will be
   * */
  viewOptions?: ViewSubscriptionOptions;
  parentSubParams: Omit<SubscriptionParams, "parentSubParams"> | undefined;

  table_info: TableOrViewInfo;

  /* Used as input */
  table_rules?: TableRule;
  filter: object;
  params: SelectParams;

  localFuncs?: LocalFuncs;
  socket: PRGLIOSocket | undefined;

  last_throttled: number;
  is_throttling?: any;
  is_ready?: boolean;
};

export type Subscription = Pick<
  SubscriptionParams,
  | "throttle"
  | "is_throttling"
  | "last_throttled"
  | "throttleOpts"
  | "channel_name"
  | "is_ready"
  | "localFuncs"
  | "socket"
  | "socket_id"
  | "table_info"
  | "filter"
  | "params"
  | "table_rules"
> & {
  triggers: {
    table_name: string;
    condition: string;
    is_related: boolean;
  }[];
};

export type PubSubManagerTriggers = Record<string, { condition: string; hash: string }[]>;

/**
 * Used to facilitate table subscribe and sync
 */
export class PubSubManager {
  static DELIMITER = "|$prstgls$|" as const;

  static EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID =
    "prostgles internal query that should be excluded from schema watch " as const;

  public static create = async (dboBuilder: DboBuilder) => {
    const instance = new PubSubManager(dboBuilder);
    const result = await initPubSubManager.bind(instance)();
    return result;
  };

  appInfoWasInserted = false;
  get appId() {
    return this.dboBuilder.prostgles.appId;
  }
  get db(): DB {
    return this.dboBuilder.db;
  }
  get dbo(): DBHandlerServer {
    return this.dboBuilder.dbo;
  }

  dboBuilder: DboBuilder;
  _triggers: PubSubManagerTriggers | undefined;
  sockets: AnyObject = {};

  subs: Subscription[] = [];
  syncs: SyncParams[] = [];
  readonly socketChannelPreffix = CHANNELS._preffix;
  postgresNotifListenManager?: PostgresNotifListenManager;

  private constructor(dboBuilder: DboBuilder) {
    this.dboBuilder = dboBuilder;

    void this._log({
      type: "syncOrSub",
      command: "postgresNotifListenManager.create",
      duration: 0,
      connectedSocketIds: this.connectedSocketIds,
      triggers: this._triggers,
    });
    log("Created PubSubManager");
  }
  appCheckFrequencyMS = 10 * 1000;
  appCheck?: ReturnType<typeof setInterval>;

  destroyed = false;
  destroy = async () => {
    this.destroyed = true;
    if (this.appCheck) {
      clearInterval(this.appCheck);
    }
    await this.postgresNotifListenManager?.destroy();
    await this._log({
      type: "syncOrSub",
      command: "postgresNotifListenManager.destroy",
      duration: 0,
      connectedSocketIds: this.connectedSocketIds,
      triggers: this._triggers,
    });
  };

  getIsDestroyed = () => {
    if (this.destroyed) {
      console.trace("Could not start destroyed instance");
      return false;
    }
    return true;
  };

  appChecking = false;
  checkedListenerTableCond?: string[];
  initialiseEventTriggers = initialiseEventTriggers.bind(this);

  getClientSubs({
    channel_name,
    localFuncs,
    socket_id,
  }: Pick<Subscription, "localFuncs" | "socket_id" | "channel_name">): Subscription[] {
    return this.subs.filter((s) => {
      return (
        s.channel_name === channel_name &&
        (matchesLocalFuncs(localFuncs, s.localFuncs) || (socket_id && s.socket_id === socket_id))
      );
    });
  }

  getTriggerSubs(table_name: string, condition: string): Subscription[] {
    const subs = this.subs.filter((s) => find(s.triggers, { table_name, condition }));
    return subs;
  }

  removeLocalSub(channelName: string, localFuncs: LocalFuncs) {
    const matchingSubIdx = this.subs.findIndex(
      (s) =>
        s.channel_name === channelName && getOnDataFunc(localFuncs) === getOnDataFunc(s.localFuncs)
    );
    if (matchingSubIdx > -1) {
      this.subs.splice(matchingSubIdx, 1);
    } else {
      console.error("Could not unsubscribe. Subscription might not have initialised yet", {
        channelName,
      });
    }
  }

  getSyncs(table_name: string, condition: string) {
    return this.syncs.filter(
      (s: SyncParams) => s.table_name === table_name && s.condition === condition
    );
  }

  notifListener = notifListener.bind(this);

  getSubData = async (
    sub: Subscription
  ): Promise<{ data: any[]; err?: undefined } | { data?: undefined; err: any }> => {
    const { table_info, filter, params, table_rules } = sub; //, subOne = false
    const { name: table_name } = table_info;

    if (!this.dbo[table_name]?.find) {
      throw new Error(`this.dbo.${table_name}.find undefined`);
    }

    try {
      const data = await this.dbo[table_name]!.find!(filter, params, undefined, table_rules);
      return { data };
    } catch (err) {
      return { err };
    }
  };

  pushSubData = pushSubData.bind(this);

  upsertSocket(socket: PRGLIOSocket | undefined) {
    if (socket && !this.sockets[socket.id]) {
      this.sockets[socket.id] = socket;
      socket.on("disconnect", () => {
        this.subs = this.subs.filter((s) => {
          return !(s.socket && s.socket.id === socket.id);
        });

        this.syncs = this.syncs.filter((s) => {
          return !(s.socket_id && s.socket_id === socket.id);
        });

        delete this.sockets[socket.id];

        void this._log({
          type: "sync",
          command: "upsertSocket.disconnect",
          tableName: "",
          duration: 0,
          sid: this.dboBuilder.prostgles.authHandler?.getSIDNoError({ socket }),
          socketId: socket.id,
          connectedSocketIds: this.connectedSocketIds,
          remainingSubs: JSON.stringify(
            this.subs.map((s) => ({
              tableName: s.table_info.name,
              triggers: s.triggers,
            }))
          ),
          remainingSyncs: JSON.stringify(
            this.syncs.map((s) => pickKeys(s, ["table_name", "condition"]))
          ),
        });

        return "ok";
      });
    }
  }

  get connectedSocketIds() {
    return this.dboBuilder.prostgles.connectedSockets.map((s) => s.id);
  }
  _log = (params: EventTypes.Sync | EventTypes.SyncOrSub) => {
    return this.dboBuilder.prostgles.opts.onLog?.({
      ...params,
      connectedSocketIds: this.connectedSocketIds,
    });
  };

  syncTimeout?: ReturnType<typeof setTimeout>;
  syncData = syncData.bind(this);

  addSync = addSync.bind(this);

  addSub = addSub.bind(this);

  getActiveListeners = (): { table_name: string; condition: string }[] => {
    const activeListeners: { table_name: string; condition: string }[] = [];
    const upsert = (t: string, c: string) => {
      if (!activeListeners.find((r) => r.table_name === t && r.condition === c)) {
        activeListeners.push({ table_name: t, condition: c });
      }
    };
    this.syncs.map((s) => {
      upsert(s.table_name, s.condition);
    });

    this.subs.forEach((s) => {
      s.triggers.forEach((trg) => {
        upsert(trg.table_name, trg.condition);
      });
    });

    return activeListeners;
  };

  /**
   * Sync triggers with database
   *  */
  refreshTriggers = refreshTriggers.bind(this);

  deleteOrphanedTriggers = debounce(deleteOrphanedTriggers.bind(this), 1000);

  addingTrigger: any;
  addTriggerPool?: Record<string, string[]> = undefined;
  addTrigger = addTrigger.bind(this);
}

export const NOTIF_TYPE = {
  data: "data_has_changed",
  data_trigger_change: "data_watch_triggers_have_changed",
  schema: "schema_has_changed",
} as const;

export type NotifTypeName = (typeof NOTIF_TYPE)[keyof typeof NOTIF_TYPE];
export const NOTIF_CHANNEL = {
  preffix: "prostgles_" as const,
  getFull: (appID: string | undefined) => {
    if (!appID) throw "No appID";
    return NOTIF_CHANNEL.preffix + appID;
  },
};

function debounce<Params extends any[]>(
  func: (...args: Params) => any,
  timeout: number
): (...args: Params) => void {
  let timer: NodeJS.Timeout;
  return (...args: Params) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
}

export const parseCondition = (condition: string): string =>
  condition && condition.trim().length ? condition : "TRUE";

export { omitKeys, pickKeys } from "prostgles-types";

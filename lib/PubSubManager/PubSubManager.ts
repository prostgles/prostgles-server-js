/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
  DBHandlerServer,
  DboBuilder,
  PRGLIOSocket,
  TableInfo,
  TableOrViewInfo,
} from "../DboBuilder/DboBuilder";
import type { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import type { DB } from "../Prostgles";
import { addSync } from "./addSync";
import { addTrigger, type AddTriggerParams } from "./addTrigger";
import { deleteOrphanedTriggers } from "./deleteOrphanedTriggers";
import { initPubSubManager } from "./init/initPubSubManager";
import { initialiseEventTriggers } from "./initialiseEventTriggers";
import { refreshTriggers } from "./refreshTriggers";

import type { AnyObject, FieldFilter, SelectParams, WAL } from "prostgles-types";
import { CHANNELS, getSerialisableError, type SubscribeOptions } from "prostgles-types";

import { find, pickKeys } from "prostgles-types";
import type { OnData } from "../DboBuilder/ViewHandler/subscribe";
import { matchesLocalFuncs } from "../DboBuilder/ViewHandler/subscribe";
import type { EventTypes } from "../Logging";
import type { ParsedTableRule } from "../PublishParser/PublishParser";
import { syncData } from "../SyncReplication";
import { addSub } from "./addSub";
import { notifListener } from "./notifListener";
import { log } from "./PubSubManagerUtils";
import { pushSubData } from "./pushSubData";

export type BasicCallback = (err?: any, res?: any) => void;

export type SyncParams = {
  socket_id: string;
  sid: string | undefined;
  channel_name: string;
  table_name: string;
  table_rules?: ParsedTableRule;
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
  table_rules: ParsedTableRule;
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

export type SubscriptionParams = {
  socket_id?: string;
  channel_name: string;

  /**
   * If this is a view then all related tables will be added triggers
   * */
  viewOptions?: ViewSubscriptionOptions;
  parentSubParams: Omit<SubscriptionParams, "parentSubParams"> | undefined;

  table_info: TableOrViewInfo;

  /* Used as input */
  table_rules?: ParsedTableRule;
  filter: object;
  selectParams: SelectParams;
  subscribeOptions: SubscribeOptions;
  tracked_columns: string[] | undefined;

  onData?: OnData;
  socket: PRGLIOSocket | undefined;

  lastPushed: number;
  is_throttling?: any;
  is_ready?: boolean;
};

export type Subscription = Pick<
  SubscriptionParams,
  | "selectParams"
  | "subscribeOptions"
  | "is_throttling"
  | "lastPushed"
  | "channel_name"
  | "is_ready"
  | "onData"
  | "socket"
  | "socket_id"
  | "table_info"
  | "filter"
  | "table_rules"
  | "tracked_columns"
> & {
  triggers: AddTriggerParams[];
};

export type PubSubManagerTriggers = Map<string, { condition: string; hash: string }[]>;

/**
 * Used to facilitate table subscribe and sync
 */
export class PubSubManager {
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

  /**
   * Triggers used for sync/sub that reflect prostgles.app_triggers.
   * Updated through refreshTriggers()
   */
  _triggers: PubSubManagerTriggers = new Map();
  sockets: Record<string, PRGLIOSocket> = {};

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
    onData,
    socket_id,
  }: Pick<Subscription, "onData" | "socket_id" | "channel_name">): Subscription[] {
    return this.subs.filter((s) => {
      return (
        s.channel_name === channel_name &&
        (matchesLocalFuncs(onData, s.onData) || (socket_id && s.socket_id === socket_id))
      );
    });
  }

  getTriggerSubs(table_name: string, condition: string): Subscription[] {
    const subs = this.subs.filter((s) => find(s.triggers, { table_name, condition }));
    return subs;
  }

  removeSubscription = (
    channelName: string,
    subInfo: { type: "local"; onData: OnData } | { type: "ws"; socket: PRGLIOSocket },
  ) => {
    const matchingSubIdx = this.subs.findIndex(
      (s) =>
        s.channel_name === channelName &&
        (subInfo.type === "local" ?
          subInfo.onData === s.onData
        : subInfo.socket.id === s.socket?.id),
    );
    const matchingSub = this.subs[matchingSubIdx];
    if (matchingSub) {
      /** Ensure we check and refresh related table/view triggers as well */
      const oldActiveTriggers = this.getAllActiveTriggers();
      this.subs.splice(matchingSubIdx, 1);
      const newActiveTriggers = this.getAllActiveTriggers();
      const tableNames = new Set(
        [...oldActiveTriggers, ...newActiveTriggers].map((t) => t.tableName),
      );
      if (newActiveTriggers.length < oldActiveTriggers.length) {
        this.deleteOrphanedTriggers(tableNames);
      }
    } else {
      console.error("Could not unsubscribe. Subscription might not have initialised yet", {
        channelName,
      });
    }
  };

  getSyncs(table_name: string, condition: string) {
    return this.syncs.filter(
      (s: SyncParams) => s.table_name === table_name && s.condition === condition,
    );
  }

  notifListener = notifListener.bind(this);

  getTriggerInfo = (tableName: string) => {
    const tableTriggerConditions = this._triggers.get(tableName)?.map((triggerInfo, idx) => ({
      idx,
      ...triggerInfo,
      subs: this.getTriggerSubs(tableName, triggerInfo.condition),
      syncs: this.getSyncs(tableName, triggerInfo.condition),
    }));
    return tableTriggerConditions;
  };
  getActiveTriggers = (tableName: string) => {
    const activeTriggers = (this.getTriggerInfo(tableName) ?? []).filter(
      (c) => c.subs.length || c.syncs.length,
    );
    return activeTriggers;
  };

  getAllActiveTriggers = () => {
    return Array.from(this._triggers.keys()).flatMap((tableName) => {
      return this.getActiveTriggers(tableName).map((triggerInfo) => ({
        ...triggerInfo,
        tableName,
      }));
    });
  };

  getSubData = async (sub: Subscription) => {
    const { table_info, filter, selectParams: params, table_rules, socket, onData } = sub; //, subOne = false
    const { name: table_name } = table_info;
    const tableHandler = this.dbo[table_name];
    if (!onData && !socket) {
      throw new Error("Subscription must have either localFuncs or socket");
    }
    if (!tableHandler?.find) {
      throw new Error(`this.dbo.${table_name}.find undefined`);
    }

    try {
      const data = (await tableHandler.find(
        filter,
        params,
        undefined,
        table_rules,
        socket && {
          clientReq: { socket },
        },
      )) as AnyObject[];
      return { data };
    } catch (err) {
      return { err: getSerialisableError(err) || "Unknown error fetching subscription data" };
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
          sid: this.dboBuilder.prostgles.authHandler.getSIDNoError({ socket }),
          socketId: socket.id,
          connectedSocketIds: this.connectedSocketIds,
          remainingSubs: JSON.stringify(
            this.subs.map((s) => ({
              tableName: s.table_info.name,
              triggers: s.triggers,
            })),
          ),
          remainingSyncs: JSON.stringify(
            this.syncs.map((s) => pickKeys(s, ["table_name", "condition"])),
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

  /** Throttle trigger deletes */
  deletingOrphanedTriggers:
    | {
        tableNames: Set<string>;
        timeout: NodeJS.Timeout;
      }
    | undefined;
  deleteOrphanedTriggers = (latestTableNames: Set<string>) => {
    this.deletingOrphanedTriggers ??= {
      tableNames: latestTableNames,
      timeout: setTimeout(() => {
        const tableNames = this.deletingOrphanedTriggers!.tableNames;
        this.deletingOrphanedTriggers = undefined;
        void deleteOrphanedTriggers.bind(this)(Array.from(tableNames));
      }, 1000),
    };

    latestTableNames.forEach((latestTableName) => {
      this.deletingOrphanedTriggers?.tableNames.add(latestTableName);
    });
  };

  addingTrigger: any;
  addTriggerPool?: Record<string, string[]> = undefined;
  addTrigger = addTrigger.bind(this);
}

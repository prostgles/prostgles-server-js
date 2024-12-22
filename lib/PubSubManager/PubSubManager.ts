/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from "crypto";
import {
  DBHandlerServer,
  DboBuilder,
  PRGLIOSocket,
  TableInfo,
  TableOrViewInfo,
} from "../DboBuilder/DboBuilder";
import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { DB, getIsSuperUser } from "../Prostgles";
import { addSync } from "./addSync";
import { initPubSubManager } from "./initPubSubManager";

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

import { find, pickKeys, tryCatch, tryCatchV2 } from "prostgles-types/dist/util";
import { LocalFuncs, getOnDataFunc, matchesLocalFuncs } from "../DboBuilder/ViewHandler/subscribe";
import { EVENT_TRIGGER_TAGS } from "../Event_Trigger_Tags";
import { EventTypes } from "../Logging";
import { TableRule } from "../PublishParser/PublishParser";
import { syncData } from "../SyncReplication";
import { addSub } from "./addSub";
import { DB_OBJ_NAMES } from "./getPubSubManagerInitQuery";
import { notifListener } from "./notifListener";
import { DELETE_DISCONNECTED_APPS_QUERY } from "./orphanTriggerCheck";
import { pushSubData } from "./pushSubData";

type PGP = pgPromise.IMain<{}, pg.IClient>;
const pgp: PGP = pgPromise({});
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
  _triggers: Record<string, string[]> | undefined;
  sockets: AnyObject = {};

  subs: Subscription[] = [];
  syncs: SyncParams[] = [];
  readonly socketChannelPreffix = CHANNELS._preffix;
  postgresNotifListenManager?: PostgresNotifListenManager;

  private constructor(dboBuilder: DboBuilder) {
    this.dboBuilder = dboBuilder;

    this._log({
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
  destroy = () => {
    this.destroyed = true;
    if (this.appCheck) {
      clearInterval(this.appCheck);
    }
    this.postgresNotifListenManager?.destroy();
    this._log({
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

  initialiseEventTriggers = async () => {
    const { watchSchema } = this.dboBuilder.prostgles.opts;
    if (watchSchema && !(await getIsSuperUser(this.db))) {
      console.warn(
        "prostgles watchSchema requires superuser db user. Will not watch using event triggers"
      );
    }

    try {
      /** We use these names because they include schema where necessary */
      const allTableNames = Object.keys(this.dbo).filter((k) => this.dbo[k]?.tableOrViewInfo);
      const tableFilterQuery =
        allTableNames.length ?
          `OR table_name NOT IN (${allTableNames.map((tblName) => asValue(tblName)).join(", ")})`
        : "";
      const query = pgp.as.format(
        `
        BEGIN;--  ISOLATION LEVEL SERIALIZABLE;
        
        /**                                 
         * ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
         *  Drop stale triggers
         * */
        DO
        $do$
          DECLARE trg RECORD;
            q   TEXT;
            ev_trg_needed BOOLEAN := FALSE;
            ev_trg_exists BOOLEAN := FALSE;
            is_super_user BOOLEAN := FALSE;
        BEGIN

            /**
             *  Delete disconnected app records, this will delete related triggers
             * */
            ${DELETE_DISCONNECTED_APPS_QUERY};

            DELETE FROM prostgles.app_triggers
            WHERE app_id NOT IN (SELECT id FROM prostgles.apps)
            ${tableFilterQuery}
            ;
            
            /** IS THIS STILL NEEDED? Delete existing triggers without locking 
            */
              LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;
              EXECUTE format(
                $q$

                  CREATE TEMP TABLE %1$I AS --ON COMMIT DROP AS
                  SELECT * FROM prostgles.app_triggers;

                  DELETE FROM prostgles.app_triggers;

                  INSERT INTO prostgles.app_triggers
                  SELECT * FROM %1$I;

                  DROP TABLE IF EXISTS %1$I;
                $q$, 
                ${asValue("triggers_" + this.appId)}
              );
            
            ${SCHEMA_WATCH_EVENT_TRIGGER_QUERY}
            
        END
        $do$; 


        COMMIT;
      `,
        { EVENT_TRIGGER_TAGS }
      );

      await this.db
        .tx((t) => t.any(query))
        .catch((e: any) => {
          console.error("prepareTriggers failed: ", e);
          throw e;
        });

      return true;
    } catch (e) {
      console.error("prepareTriggers failed: ", e);
      throw e;
    }
  };

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

        this._log({
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
  refreshTriggers = async () => {
    const triggers: {
      table_name: string;
      condition: string;
    }[] = await this.db.any(
      `
        SELECT *
        FROM prostgles.v_triggers
        WHERE app_id = $1
        ORDER BY table_name, condition
      `,
      [this.dboBuilder.prostgles.appId]
    );

    this._triggers = {};
    triggers.map((t) => {
      this._triggers ??= {};
      this._triggers[t.table_name] ??= [];
      if (!this._triggers[t.table_name]?.includes(t.condition)) {
        this._triggers[t.table_name]?.push(t.condition);
      }
    });
  };

  addingTrigger: any;
  addTriggerPool?: Record<string, string[]> = undefined;
  async addTrigger(
    params: { table_name: string; condition: string },
    viewOptions: ViewSubscriptionOptions | undefined,
    socket: PRGLIOSocket | undefined
  ) {
    const addedTrigger = await tryCatchV2(async () => {
      const { table_name } = { ...params };
      let { condition } = { ...params };
      if (!table_name) throw "MISSING table_name";

      if (!condition || !condition.trim().length) {
        condition = "TRUE";
      }

      if (this.dbo[table_name]?.tableOrViewInfo?.isHyperTable) {
        throw "Triggers do not work on timescaledb hypertables due to bug:\nhttps://github.com/timescale/timescaledb/issues/1084";
      }

      const trgVals = {
        tbl: asValue(table_name),
        cond: asValue(condition),
        condHash: asValue(crypto.createHash("md5").update(condition).digest("hex")),
      };

      await this.db.tx((t) =>
        t.any(`
        BEGIN WORK;
        /* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        /* why is this lock level needed? */
        --LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

        /** app_triggers is not refreshed when tables are dropped */
        DELETE FROM prostgles.app_triggers at
        WHERE app_id = ${asValue(this.appId)} 
        AND NOT EXISTS (
          SELECT 1  
          FROM pg_catalog.pg_trigger t
          WHERE tgname like format('prostgles_triggers_%s_', at.table_name) || '%'
          AND tgenabled = 'O'
        );

        INSERT INTO prostgles.app_triggers (
          table_name, 
          condition, 
          condition_hash, 
          app_id, 
          related_view_name, 
          related_view_def
        ) 
        VALUES (
          ${trgVals.tbl}, 
          ${trgVals.cond},
          ${trgVals.condHash},
          ${asValue(this.appId)}, 
          ${asValue(viewOptions?.viewName ?? null)}, 
          ${asValue(viewOptions?.definition ?? null)}
        )
        ON CONFLICT DO NOTHING;

        COMMIT WORK;
      `)
      );

      /** This might be redundant due to trigger on app_triggers */
      await this.refreshTriggers();

      return trgVals;
    });

    await this._log({
      type: "syncOrSub",
      command: "addTrigger",
      condition: addedTrigger.data?.cond ?? params.condition,
      duration: addedTrigger.duration,
      socketId: socket?.id,
      state: !addedTrigger.data?.tbl ? "fail" : "ok",
      error: addedTrigger.error,
      sid: socket && this.dboBuilder.prostgles.authHandler?.getSIDNoError({ socket }),
      tableName: addedTrigger.data?.tbl ?? params.table_name,
      connectedSocketIds: this.dboBuilder.prostgles.connectedSockets.map((s) => s.id),
      localParams: socket && { clientReq: { socket } },
      triggers: this._triggers,
    });

    if (addedTrigger.error) throw addedTrigger.error;

    return addedTrigger;
  }
}

const SCHEMA_WATCH_EVENT_TRIGGER_QUERY = `

  is_super_user := EXISTS (select 1 from pg_user where usename = CURRENT_USER AND usesuper IS TRUE);

  /* DROP the old buggy schema watch trigger */
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_event_trigger
    WHERE evtname = 'prostgles_schema_watch_trigger'
  ) AND is_super_user IS TRUE 
  THEN
    DROP EVENT TRIGGER IF EXISTS prostgles_schema_watch_trigger;
  END IF;

  ev_trg_needed := EXISTS (
    SELECT 1 FROM prostgles.apps 
    WHERE watching_schema_tag_names IS NOT NULL
  );
  ev_trg_exists := EXISTS (
    SELECT 1 FROM pg_catalog.pg_event_trigger
    WHERE evtname = ${asValue(DB_OBJ_NAMES.schema_watch_trigger)}
  );

  /* DROP stale event trigger */
  IF 
    is_super_user IS TRUE 
    AND ev_trg_needed IS FALSE 
    AND ev_trg_exists IS TRUE 
  THEN

      SELECT format(
        $$ 
          DROP EVENT TRIGGER IF EXISTS %I ; 
          DROP EVENT TRIGGER IF EXISTS %I ; 
        $$
        , ${asValue(DB_OBJ_NAMES.schema_watch_trigger)}
        , ${asValue(DB_OBJ_NAMES.schema_watch_trigger_drop)}
      )
      INTO q;
      EXECUTE q;

  /* CREATE event trigger */
  ELSIF 
      is_super_user IS TRUE 
      AND ev_trg_needed IS TRUE 
      AND ev_trg_exists IS FALSE 
  THEN

      DROP EVENT TRIGGER IF EXISTS ${DB_OBJ_NAMES.schema_watch_trigger};
      CREATE EVENT TRIGGER ${DB_OBJ_NAMES.schema_watch_trigger} 
      ON ddl_command_end
      WHEN TAG IN (\${EVENT_TRIGGER_TAGS:csv})
      EXECUTE PROCEDURE ${DB_OBJ_NAMES.schema_watch_func}();

      DROP EVENT TRIGGER IF EXISTS ${DB_OBJ_NAMES.schema_watch_trigger_drop};
      CREATE EVENT TRIGGER ${DB_OBJ_NAMES.schema_watch_trigger_drop} 
      ON sql_drop
      --WHEN TAG IN (\${EVENT_TRIGGER_TAGS:csv})
      EXECUTE PROCEDURE ${DB_OBJ_NAMES.schema_watch_func}();

  END IF;
`;

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

export const parseCondition = (condition: string): string =>
  condition && condition.trim().length ? condition : "TRUE";

export { omitKeys, pickKeys } from "prostgles-types";

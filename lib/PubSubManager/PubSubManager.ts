/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { addSync } from "./addSync";
import { TableOrViewInfo, TableInfo, DBHandlerServer, DboBuilder, PRGLIOSocket, canEXECUTE } from "../DboBuilder";
import { DB, isSuperUser } from "../Prostgles";
import { initPubSubManager } from "./initPubSubManager";

import * as Bluebird from "bluebird";
import * as pgPromise from 'pg-promise';
import pg from 'pg-promise/typescript/pg-subset';

import { SelectParams, FieldFilter, asName, WAL, AnyObject, SubscribeParams } from "prostgles-types";

import { ClientExpressData, syncData } from "../SyncReplication";
import { TableRule } from "../PublishParser";
import { find } from "prostgles-types/dist/util";
import { DB_OBJ_NAMES } from "./getInitQuery";
import { addSub } from "./addSub";
import { notifListener } from "./notifListener";
import { pushSubData } from "./pushSubData";
import { getOnDataFunc, LocalFuncs, matchesLocalFuncs } from "../DboBuilder/subscribe";

type PGP = pgPromise.IMain<{}, pg.IClient>;
const pgp: PGP = pgPromise({
  promiseLib: Bluebird
});
export const asValue = (v: any) => pgp.as.format("$1", [v]);
export const DEFAULT_SYNC_BATCH_SIZE = 50;

export const log = (...args: any[]) => {
  if (process.env.TEST_TYPE) {
    console.log(...args)
  }
}

export type BasicCallback = (err?: any, res?: any) => void

export type SyncParams = {
  socket_id: string;
  channel_name: string;
  table_name: string;
  table_rules?: TableRule;
  synced_field: string;
  allow_delete: boolean;
  id_fields: string[];
  batch_size: number;
  filter: object;
  params: {
    select: FieldFilter
  };
  condition: string;
  wal?: WAL,
  throttle?: number;
  lr?: AnyObject;
  last_synced: number;
  is_syncing: boolean;
}

export type AddSyncParams = {
  socket: any;
  table_info: TableInfo;
  table_rules: TableRule;
  synced_field: string;
  allow_delete?: boolean;
  id_fields: string[];
  filter: object;
  params: {
    select: FieldFilter
  };
  condition: string;
  throttle?: number;
}

export type ViewSubscriptionOptions = ({
  type: "view";
  viewName: string;
  definition: string;
} | {
  type: "table";
  viewName?: undefined;
  definition?: undefined;
}) & {
  relatedTables: {
    tableName: string;
    tableNameEscaped: string;
    condition: string;
  }[];
}

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
}

export type PubSubManagerOptions = {
  dboBuilder: DboBuilder; 
  wsChannelNamePrefix?: string;
  pgChannelName?: string;
  onSchemaChange?: (event: { command: string; query: string }) => void;
}

export type Subscription = Pick<SubscriptionParams, 
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
}

export class PubSubManager {
  static DELIMITER = '|$prstgls$|';

  dboBuilder: DboBuilder;
  get db(): DB  {
    return this.dboBuilder.db;
  }
  get dbo(): DBHandlerServer  {
    return this.dboBuilder.dbo;
  }
  
  _triggers?: Record<string, string[]>;
  sockets: AnyObject = {};
  // subs: { [ke: string]: { [ke: string]: { subs: SubscriptionParams[] } } };
  subs: Subscription[] = [];
  syncs: SyncParams[] = [];
  socketChannelPreffix: string;
  onSchemaChange?: ((event: { command: string; query: string }) => void) = undefined;

  postgresNotifListenManager?: PostgresNotifListenManager;

  private constructor(options: PubSubManagerOptions) {
    const { wsChannelNamePrefix, onSchemaChange, dboBuilder } = options;
    if (!dboBuilder.db || !dboBuilder.dbo) {
      throw 'MISSING: db_pg, db';
    }
    
    this.onSchemaChange = onSchemaChange;
    this.dboBuilder = dboBuilder;
  
    this.socketChannelPreffix = wsChannelNamePrefix || "_psqlWS_";

    log("Created PubSubManager");
  }

  NOTIF_TYPE = {
    data: "data_has_changed",
    schema: "schema_has_changed"
  }
  NOTIF_CHANNEL = {
    preffix: 'prostgles_' as const,
    getFull: (appID?: string) => {
      const finalAppId = appID ?? this.appID;
      if (!finalAppId) throw "No appID";
      return this.NOTIF_CHANNEL.preffix + finalAppId;
    }
  }

  /**
   * Used facilitate concurrent prostgles connections to the same database
   */
  appID?: string;

  appCheckFrequencyMS = 10 * 1000;
  appCheck?: ReturnType<typeof setInterval>;



  //     ,datname
  //     ,usename
  //     ,client_hostname
  //     ,client_port
  //     ,backend_start
  //     ,query_start
  //     ,query
  //     ,state

  //     console.log(await _db.any(`
  //         SELECT pid, application_name, state
  //         FROM pg_stat_activity
  //         WHERE application_name IS NOT NULL AND application_name != '' -- state = 'active';
  //     `))

  public static canCreate = async (db: DB) => {

    const canExecute = await canEXECUTE(db);
    const isSuperUs = await isSuperUser(db);
    return { canExecute, isSuperUs, yes: canExecute && isSuperUs };
  }

  public static create = async (options: PubSubManagerOptions) => {
    const res = new PubSubManager(options);
    return await res.init();
  }

  destroyed = false;
  destroy = () => {
    this.destroyed = true;
    if (this.appCheck) {
      clearInterval(this.appCheck);
    }
    this.subs = [];
    this.syncs = [];
    if (!this.postgresNotifListenManager) {
      throw "this.postgresNotifListenManager missing"
    }
    this.postgresNotifListenManager.destroy();
  }

  canContinue = () => {
    if (this.destroyed) {
      console.trace("Could not start destroyed instance");
      return false
    }
    return true
  }

  appChecking = false;
  checkedListenerTableCond?: string[];
  init = initPubSubManager.bind(this);


  static SCHEMA_ALTERING_QUERIES = ['CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO'];

  static EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID = "prostgles internal query that should be excluded from schema watch "
  prepareTriggers = async () => {
    // SELECT * FROM pg_catalog.pg_event_trigger WHERE evtname
    if (!this.appID) throw "prepareTriggers failed: this.appID missing";
    if (this.dboBuilder.prostgles.opts.watchSchema && !(await isSuperUser(this.db))) {
      console.warn("prostgles watchSchema requires superuser db user. Will not watch using event triggers")
    }

    try {

      await this.db.any(`
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
            --SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
            
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
              ${asValue('triggers_' + this.appID)}
            );

            is_super_user := EXISTS (select 1 from pg_user where usename = CURRENT_USER AND usesuper IS TRUE);

            /**
             *  Delete stale app records, this will delete related triggers
             * */
            DELETE FROM prostgles.apps
            WHERE last_check < NOW() - 8 * check_frequency_ms * interval '1 millisecond';

            DELETE FROM prostgles.app_triggers
            WHERE app_id NOT IN (SELECT id FROM prostgles.apps);
            
            /* DROP the old buggy schema watch trigger */
            IF EXISTS (
              SELECT 1 FROM pg_catalog.pg_event_trigger
              WHERE evtname = 'prostgles_schema_watch_trigger'
            ) AND is_super_user IS TRUE 
            THEN
                DROP EVENT TRIGGER IF EXISTS prostgles_schema_watch_trigger;
            END IF;

            ev_trg_needed := EXISTS (SELECT 1 FROM prostgles.apps WHERE watching_schema IS TRUE);
            ev_trg_exists := EXISTS (
                SELECT 1 FROM pg_catalog.pg_event_trigger
                WHERE evtname = ${asValue(DB_OBJ_NAMES.schema_watch_trigger)}
            );

              -- RAISE NOTICE ' ev_trg_needed %, ev_trg_exists %', ev_trg_needed, ev_trg_exists;

            /**
             *  DROP stale event trigger
             * */
            IF is_super_user IS TRUE AND ev_trg_needed IS FALSE AND ev_trg_exists IS TRUE THEN

                SELECT format(
                  $$ DROP EVENT TRIGGER IF EXISTS %I ; $$
                  , ${asValue(DB_OBJ_NAMES.schema_watch_trigger)}
                )
                INTO q;

                --RAISE NOTICE ' DROP EVENT TRIGGER %', q;

                EXECUTE q;

            /**
             *  CREATE event trigger
             * */
            ELSIF 
                is_super_user IS TRUE 
                AND ev_trg_needed IS TRUE 
                AND ev_trg_exists IS FALSE 
            THEN

                DROP EVENT TRIGGER IF EXISTS ${DB_OBJ_NAMES.schema_watch_trigger};
                CREATE EVENT TRIGGER ${DB_OBJ_NAMES.schema_watch_trigger} ON ddl_command_end
                WHEN TAG IN ('COMMENT', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO')
                --WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE TRIGGER', 'DROP TRIGGER')
                EXECUTE PROCEDURE ${DB_OBJ_NAMES.schema_watch_func}();

                --RAISE NOTICE ' CREATED EVENT TRIGGER %', q;
            END IF;

            
        END
        $do$; 


        COMMIT;
      `).catch(e => {
        console.error("prepareTriggers failed: ", e);
        throw e;
      });

      return true;

    } catch (e) {
      console.error("prepareTriggers failed: ", e);
      throw e;
    }
  }

  isReady() {
    if (!this.postgresNotifListenManager) throw "this.postgresNotifListenManager missing";
    return this.postgresNotifListenManager.isListening();
  } 

  getClientSubs(client: Pick<Subscription, "localFuncs" | "socket_id" | "channel_name">): Subscription[] { 
    return this.subs.filter(s => {
      return s.channel_name === client.channel_name && (matchesLocalFuncs(client.localFuncs, s.localFuncs) || client.socket_id && s.socket_id === client.socket_id)
    });
  }

  getTriggerSubs(table_name: string, condition: string): Subscription[] {  
    const subs = this.subs.filter(s => find(s.triggers, { table_name, condition }));
    return subs;
  }

  removeLocalSub(channelName: string, localFuncs: LocalFuncs) {
    const matchingSubIdx = this.subs.findIndex(s => 
      s.channel_name === channelName && 
      getOnDataFunc(localFuncs) === getOnDataFunc(s.localFuncs)
    );
    if (matchingSubIdx > -1) {
      this.subs.splice(matchingSubIdx, 1);
    } else {
      console.error("Could not unsubscribe. Subscription might not have initialised yet", { channelName })
    }
  }

  getSyncs(table_name: string, condition: string) {
    return (this.syncs || [])
      .filter((s: SyncParams) => s.table_name === table_name && s.condition === condition);
  }

  notifListener = notifListener.bind(this);

  getSubData = async (sub: Subscription): Promise<
    { data: any[]; err?: undefined; } | 
    { data?: undefined; err: any; }
  > => {
    const { table_info, filter, params, table_rules } = sub;  //, subOne = false 
    const { name: table_name } = table_info;
    
    if (!this.dbo?.[table_name]?.find) {
      throw new Error(`1107 this.dbo.${table_name}.find`);
    }

    try {
      const data = await this.dbo?.[table_name]!.find!(filter, params, undefined, table_rules)
      return { data };
    } catch(err){
      return { err };
    }
  } 

  pushSubData = pushSubData.bind(this);

  upsertSocket(socket: any) {
    if (socket && !this.sockets[socket.id]) {
      this.sockets[socket.id] = socket;
      socket.on("disconnect", () => {

        this.subs = this.subs.filter(s => {
          return !(s.socket && s.socket.id === socket.id);
        });    

        this.syncs = this.syncs.filter(s => {
          return !(s.socket_id && s.socket_id === socket.id);
        });

        delete this.sockets[socket.id];

        return "ok";
      });
    }
  }

  syncTimeout?: ReturnType<typeof setTimeout>;
  async syncData(sync: SyncParams, clientData: ClientExpressData | undefined, source: "trigger" | "client") {
    return await syncData(this, sync, clientData, source);
  }

  addSync = addSync.bind(this);
  
  addSub = addSub.bind(this);


  getActiveListeners = (): { table_name: string; condition: string }[] => {
    const result: { table_name: string; condition: string }[] = [];
    const upsert = (t: string, c: string) => {
      if (!result.find(r => r.table_name === t && r.condition === c)) {
        result.push({ table_name: t, condition: c });
      }
    }
    (this.syncs || []).map(s => {
      upsert(s.table_name, s.condition)
    });

    this.subs.forEach(s => {
      s.triggers.forEach(trg => {
        upsert(trg.table_name, trg.condition);
      });
    });

    return result;
  }


  checkIfTimescaleBug = async (table_name: string) => {
    const schema = "_timescaledb_catalog",
      res = await this.db.oneOrNone("SELECT EXISTS( \
            SELECT * \
            FROM information_schema.tables \
            WHERE 1 = 1 \
                AND table_schema = ${schema} \
                AND table_name = 'hypertable' \
        );", { schema });
    if (res.exists) {
      const isHyperTable = await this.db.any("SELECT * FROM " + asName(schema) + ".hypertable WHERE table_name = ${table_name};", { table_name, schema });
      if (isHyperTable && isHyperTable.length) {
        throw "Triggers do not work on timescaledb hypertables due to bug:\nhttps://github.com/timescale/timescaledb/issues/1084"
      }
    }
    return true;
  }

  /* 
      A table will only have a trigger with all conditions (for different subs) 
          conditions = ["user_id = 1"]
          fields = ["user_id"]
  */

  getMyTriggerQuery = async () => {
    return pgp.as.format(` 
      SELECT * --, ROW_NUMBER() OVER(PARTITION BY table_name ORDER BY table_name, condition ) - 1 as id
      FROM prostgles.v_triggers
      WHERE app_id = $1
      ORDER BY table_name, condition
    `, [this.appID]
    )
  }

  // waitingTriggers: { [key: string]: string[] } = undefined;
  addingTrigger: any;
  addTriggerPool?: Record<string, string[]> = undefined;
  async addTrigger(params: { table_name: string; condition: string; }, viewOptions?: ViewSubscriptionOptions) {
    try {

      const { table_name } = { ...params }
      let { condition } = { ...params }
      if (!table_name) throw "MISSING table_name";
      if (!this.appID) throw "MISSING appID";

      if (!condition || !condition.trim().length) {
        condition = "TRUE";
      }

      // console.log(1623, { app_id, addTrigger: { table_name, condition } });

      await this.checkIfTimescaleBug(table_name);

      const trgVals = {
        tbl: asValue(table_name),
        cond: asValue(condition),
      };
      
      await this.db.any(`
        BEGIN WORK;
        /* ${ PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

        INSERT INTO prostgles.app_triggers (table_name, condition, app_id, related_view_name, related_view_def) 
          VALUES (${trgVals.tbl}, ${trgVals.cond}, ${asValue(this.appID)}, ${asValue(viewOptions?.viewName ?? null)}, ${asValue(viewOptions?.definition ?? null)})
        ON CONFLICT DO NOTHING;
              
        COMMIT WORK;
      `);

      log("addTrigger.. ", { table_name, condition });

      const triggers: {
        table_name: string;
        condition: string;
      }[] = await this.db.any(await this.getMyTriggerQuery());


      this._triggers = {};
      triggers.map(t => {
        this._triggers = this._triggers || {};
        this._triggers[t.table_name] = this._triggers[t.table_name] || [];
        if (!this._triggers[t.table_name]?.includes(t.condition)) {
          this._triggers[t.table_name]?.push(t.condition)
        }
      });
      log("trigger added.. ", { table_name, condition });

      return true;
      // console.log("1612", JSON.stringify(triggers, null, 2))
      // console.log("1613",JSON.stringify(this._triggers, null, 2))


    } catch (e) {
      console.trace("Failed adding trigger", e);
      // throw e
    }

  }
}


export const parseCondition = (condition: string): string => condition && condition.trim().length ? condition : "TRUE"

export { pickKeys, omitKeys } from "prostgles-types"
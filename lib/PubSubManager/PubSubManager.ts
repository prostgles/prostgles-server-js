/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { get } from "../utils";
import { TableOrViewInfo, TableInfo, DBHandlerServer, DboBuilder, PRGLIOSocket, canEXECUTE } from "../DboBuilder";
import { DB, isSuperUser } from "../Prostgles";
import { initPubSubManager } from "./initPubSubManager";

import * as Bluebird from "bluebird";
import * as pgPromise from 'pg-promise';
import pg from 'pg-promise/typescript/pg-subset';

import { SelectParams, FieldFilter, asName, WAL, isEmpty, AnyObject, getKeys } from "prostgles-types";

import { ClientExpressData, syncData } from "../SyncReplication";
import { TableRule } from "../PublishParser";


type PGP = pgPromise.IMain<{}, pg.IClient>;
let pgp: PGP = pgPromise({
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

type AddSyncParams = {
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

export type ViewSubscriptionOptions = {
  viewName: string;
  definition: string;
  relatedTables: {
    tableName: string;
    tableNameEscaped: string;
    condition: string;
  }[];
}

type SubscriptionParams = {
  socket_id?: string;
  channel_name: string;
  table_name: string;
  socket: PRGLIOSocket | undefined;

  /** 
   * If this is a view then an array with all related tables will be  
   * */
  viewOptions?: ViewSubscriptionOptions;
  parentSubParams: Omit<SubscriptionParams, "parentSubParams"> | undefined;

  table_info: TableOrViewInfo;
  table_rules?: TableRule;
  filter: object;
  params: SelectParams;
  func?: (data: any) => any;
  throttle?: number;
  last_throttled: number;
  is_throttling?: any;
  is_ready?: boolean;
  // subOne?: boolean;
}
type AddSubscriptionParams = SubscriptionParams & {
  condition: string;
}

export type PubSubManagerOptions = {
  dboBuilder: DboBuilder;
  // db: DB;
  // dbo: DBHandlerServer;
  wsChannelNamePrefix?: string;
  pgChannelName?: string;
  onSchemaChange?: (event: { command: string; query: string }) => void;
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
  sockets: any;
  subs: { [ke: string]: { [ke: string]: { subs: SubscriptionParams[] } } };
  syncs: SyncParams[];
  socketChannelPreffix: string;
  onSchemaChange?: ((event: { command: string; query: string }) => void) = undefined;

  postgresNotifListenManager?: PostgresNotifListenManager;

  private constructor(options: PubSubManagerOptions) {
    const { wsChannelNamePrefix, pgChannelName, onSchemaChange, dboBuilder } = options;
    if (!dboBuilder.db || !dboBuilder.dbo) {
      throw 'MISSING: db_pg, db';
    }
    
    this.onSchemaChange = onSchemaChange;
    this.dboBuilder = dboBuilder;

    this.sockets = {};
    this.subs = {};
    this.syncs = [];
    this.socketChannelPreffix = wsChannelNamePrefix || "_psqlWS_";

    log("Created PubSubManager");
  }

  NOTIF_TYPE = {
    data: "data_has_changed",
    schema: "schema_has_changed"
  }
  NOTIF_CHANNEL = {
    preffix: 'prostgles_',
    getFull: (appID?: string) => {
      const finalAppId = appID ?? this.appID;
      if (!finalAppId) throw "No appID";
      return this.NOTIF_CHANNEL.preffix + finalAppId;
    }
  }

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
    this.onSocketDisconnected();
    // if(this.postgresNotifListenManager){
    //     this.postgresNotifListenManager.stopListening();
    // }
    if (!this.postgresNotifListenManager) throw "this.postgresNotifListenManager missing"
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
  init = initPubSubManager.bind(this);

  DB_OBJ_NAMES = {
    trigger_add_remove_func: "prostgles.trigger_add_remove_func",
    data_watch_func: "prostgles.prostgles_trigger_function",
    schema_watch_func: "prostgles.schema_watch_func",
    schema_watch_trigger: "prostgles_schema_watch_trigger_new"
  }

  static SCHEMA_ALTERING_QUERIES = ['CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO'];

  static EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID = "prostgles internal query that should be excluded from "
  prepareTriggers = async () => {
    // SELECT * FROM pg_catalog.pg_event_trigger WHERE evtname
    if (!this.appID) throw "prepareTriggers failed: this.appID missing";
    if (this.dboBuilder.prostgles.opts.watchSchema && !(await isSuperUser(this.db))) {
      console.warn("prostgles watchSchema requires superuser db user. Will not watch using event triggers")
    }

    try {

      await this.db.any(`
                BEGIN;--  ISOLATION LEVEL SERIALIZABLE;
                
                /**                                 ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID}
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
                     *  Delete stale app records
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
                        WHERE evtname = ${asValue(this.DB_OBJ_NAMES.schema_watch_trigger)}
                    );

                     -- RAISE NOTICE ' ev_trg_needed %, ev_trg_exists %', ev_trg_needed, ev_trg_exists;

                    /**
                     *  DROP stale event trigger
                     * */
                    IF is_super_user IS TRUE AND ev_trg_needed IS FALSE AND ev_trg_exists IS TRUE THEN

                        SELECT format(
                            $$ DROP EVENT TRIGGER IF EXISTS %I ; $$
                            , ${asValue(this.DB_OBJ_NAMES.schema_watch_trigger)}
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

                        DROP EVENT TRIGGER IF EXISTS ${this.DB_OBJ_NAMES.schema_watch_trigger};
                        CREATE EVENT TRIGGER ${this.DB_OBJ_NAMES.schema_watch_trigger} ON ddl_command_end
                        WHEN TAG IN ('COMMENT', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO')
                        --WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE TRIGGER', 'DROP TRIGGER')
                        EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.schema_watch_func}();

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

  getSubs(table_name: string, condition: string): SubscriptionParams[] {
    return this.subs?.[table_name]?.[condition]?.subs
  }

  getSyncs(table_name: string, condition: string) {
    return (this.syncs || [])
      .filter((s: SyncParams) => s.table_name === table_name && s.condition === condition);
  }

  /* Relay relevant data to relevant subscriptions */
  notifListener = async (data: { payload: string }) => {
    const str = data.payload;

    if (!str) {
      console.error("Empty notif?")
      return;
    }
    const dataArr = str.split(PubSubManager.DELIMITER),
      notifType = dataArr[0];

    log(str);

    if (notifType === this.NOTIF_TYPE.schema) {
      if (this.onSchemaChange) {
        const command = dataArr[1],
          event_type = dataArr[2],
          query = dataArr[3];

        if (query) {
          this.onSchemaChange({ command, query })
        }
      }

      return;
    }

    if (notifType !== this.NOTIF_TYPE.data) {
      console.error("Unexpected notif type: ", notifType);
      return;
    }

    const table_name = dataArr[1],
      op_name = dataArr[2],
      condition_ids_str = dataArr[3];

    // const triggers = await this.db.any("SELECT * FROM prostgles.triggers WHERE table_name = $1 AND id IN ($2:csv)", [table_name, condition_ids_str.split(",").map(v => +v)]);
    // const conditions: string[] = triggers.map(t => t.condition);

    log("PG Trigger ->", dataArr.join("__"))
    if (
      condition_ids_str && condition_ids_str.startsWith("error") &&
      this._triggers && this._triggers[table_name] && this._triggers[table_name].length
    ) {
      const pref = "INTERNAL ERROR. Schema might have changed";
      console.error(`${pref}: ${condition_ids_str}`)
      this._triggers[table_name].map(c => {
        const subs = this.getSubs(table_name, c);
        subs.map(s => {
          this.pushSubData(s, pref + ". Check server logs");
        })
      });
    } else if (
      condition_ids_str?.split(",").length &&
      condition_ids_str?.split(",").every((c: string) => Number.isInteger(+c)) &&
      this._triggers?.[table_name]?.length
    ) {


      const idxs = condition_ids_str.split(",").map(v => +v);
      const conditions = this._triggers[table_name].filter((c, i) => idxs.includes(i))

      log("PG Trigger -> ", { table_name, op_name, condition_ids_str, conditions }, this._triggers[table_name]);

      conditions.map(condition => {

        const subs = this.getSubs(table_name, condition);
        const syncs = this.getSyncs(table_name, condition);


        syncs.map((s) => {
          this.syncData(s, undefined, "trigger");
        });

        if (!subs) {

          // console.error(`sub missing for ${table_name} ${condition}`, this.triggers);
          // console.log(this.subs)
          return;
        }

        /* Throttle the subscriptions */
        for (var i = 0; i < subs.length; i++) {
          var sub = subs[i];
          if (
            this.dbo[sub.table_name] &&
            sub.is_ready &&
            (sub.socket_id && this.sockets[sub.socket_id]) || sub.func
          ) {
            const throttle = sub.throttle || 0;
            if (sub.last_throttled <= Date.now() - throttle) {

              /* It is assumed the policy was checked before this point */
              this.pushSubData(sub);
              // sub.last_throttled = Date.now();
            } else if (!sub.is_throttling) {


              log("throttling sub")
              sub.is_throttling = setTimeout(() => {
                log("throttling finished. pushSubData...")
                sub.is_throttling = null;
                this.pushSubData(sub);
              }, throttle);// sub.throttle);
            }
          }
        }
      });

    } else {

      // if(!this._triggers || !this._triggers[table_name] || !this._triggers[table_name].length){
      //     console.warn(190, "Trigger sub not found. DROPPING TRIGGER", table_name, condition_ids_str, this._triggers);
      //     this.dropTrigger(table_name);
      // } else {
      // }
      console.warn(190, "Trigger sub issue: ", table_name, condition_ids_str, this._triggers);
    }
  }


  pushSubData(sub: SubscriptionParams, err?: any) {
    if (!sub) throw "pushSubData: invalid sub";
    const { table_name, filter, params, table_rules, socket_id, channel_name, func } = sub;  //, subOne = false 

    sub.last_throttled = Date.now();

    if (err) {
      if (socket_id) {
        this.sockets[socket_id].emit(channel_name, { err });
      }
      return true;
    }

    return new Promise(async (resolve, reject) => {
      /* TODO: Retire subOne -> it's redundant */
      // this.dbo[table_name][subOne? "findOne" : "find"](filter, params, null, table_rules)
      if (!this.dbo?.[table_name]?.find) {
        throw new Error(`1107 this.dbo.${table_name}.find`);
      }

      this.dbo?.[table_name]?.find?.(filter, params, undefined, table_rules)
        .then(data => {

          if (socket_id && this.sockets[socket_id]) {
            log("Pushed " + data.length + " records to sub")
            this.sockets[socket_id].emit(channel_name, { data }, () => {
              resolve(data);
            });
            /* TO DO: confirm receiving data or server will unsubscribe
              { data }, (cb)=> { console.log(cb) });
            */
          } else if (func) {
            func(data);
            resolve(data);
          }
          sub.last_throttled = Date.now();
        }).catch(err => {
          const errObj = { _err_msg: err.toString(), err };
          if (socket_id && this.sockets[socket_id]) {
            this.sockets[socket_id].emit(channel_name, { err: errObj });
          } else if (func) {
            func({ err: errObj });
          }
          reject(errObj)
        });
    });
  }

  upsertSocket(socket: any, channel_name: string) {
    if (socket && !this.sockets[socket.id]) {
      this.sockets[socket.id] = socket;
      socket.on("disconnect", () => this.onSocketDisconnected(socket));
    }
  }

  syncTimeout?: ReturnType<typeof setTimeout>;
  async syncData(sync: SyncParams, clientData: ClientExpressData | undefined, source: "trigger" | "client") {
    return await syncData(this, sync, clientData, source);
  }

  /**
   * Returns a sync channel
   * A sync channel is unique per socket for each filter
   */
  async addSync(syncParams: AddSyncParams) {
    const {
      socket = null, table_info = null, table_rules, synced_field = null,
      allow_delete = false, id_fields = [], filter = {},
      params, condition = "", throttle = 0
    } = syncParams || {};

    let conditionParsed = parseCondition(condition);
    if (!socket || !table_info) throw "socket or table_info missing";


    const { name: table_name } = table_info,
      channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.sync`;

    if (!synced_field) throw "synced_field missing from table_rules";

    this.upsertSocket(socket, channel_name);

    const upsertSync = () => {
      let newSync = {
        channel_name,
        table_name,
        filter,
        condition: conditionParsed,
        synced_field,
        id_fields,
        allow_delete,
        table_rules,
        throttle: Math.max(throttle || 0, table_rules?.sync?.throttle || 0),
        batch_size: get(table_rules, "sync.batch_size") || DEFAULT_SYNC_BATCH_SIZE,
        last_throttled: 0,
        socket_id: socket.id,
        is_sync: true,
        last_synced: 0,
        lr: undefined,
        table_info,
        is_syncing: false,
        wal: undefined,
        socket,
        params
      };

      /* Only a sync per socket per table per condition allowed */
      this.syncs = this.syncs || [];
      let existing = this.syncs.find(s => s.socket_id === socket.id && s.channel_name === channel_name);
      if (!existing) {
        this.syncs.push(newSync);
        // console.log("Added SYNC");

        socket.removeAllListeners(channel_name + "unsync");
        socket.once(channel_name + "unsync", (_data: any, cb: BasicCallback) => {
          this.onSocketDisconnected(socket, channel_name);
          cb(null, { res: "ok" })
        });

        socket.removeAllListeners(channel_name);
        socket.on(channel_name, (data: any, cb: BasicCallback) => {

          if (!data) {
            cb({ err: "Unexpected request. Need data or onSyncRequest" });
            return;
          }

          /*
          */

          /* Server will:
              1. Ask for last_synced  emit(onSyncRequest)
              2. Ask for data >= server_synced    emit(onPullRequest)
                  -> Upsert that data
              2. Push data >= last_synced     emit(data.data)

             Client will:
              1. Send last_synced     on(onSyncRequest)
              2. Send data >= server_synced   on(onPullRequest)
              3. Send data on CRUD    emit(data.data | data.deleted)
              4. Upsert data.data | deleted     on(data.data | data.deleted)
          */

          // if(data.data){
          //     console.error("THIS SHOUKD NEVER FIRE !! NEW DATA FROM SYNC");
          //     this.upsertClientData(newSync, data.data);
          // } else 
          if (data.onSyncRequest) {
            // console.log("syncData from socket")
            this.syncData(newSync, data.onSyncRequest, "client");

            // console.log("onSyncRequest ", socket._user)
          } else {
            console.error("Unexpected sync request data from client: ", data)
          }
        });

        // socket.emit(channel_name, { onSyncRequest: true }, (response) => {
        //     console.log(response)
        // });
      } else {
        console.error("UNCLOSED DUPLICATE SYNC FOUND");
      }

      return newSync;
    };


    // const { min_id, max_id, count, max_synced } = params;

    let sync = upsertSync();

    await this.addTrigger({ table_name, condition: conditionParsed });

    return channel_name;
  } 
  

  /* Must return a channel for socket */
  /* The distinct list of channel names must have a corresponding trigger in the database */
  async addSub(subscriptionParams: Omit<AddSubscriptionParams, "channel_name" | "parentSubParams">) {
    const {
      socket, func = null, table_info = null, table_rules, filter = {},
      params = {}, condition = "", throttle = 0,  //subOne = false, 
      viewOptions
    } = subscriptionParams || {};

    let validated_throttle = subscriptionParams.throttle || 10;
    if ((!socket && !func) || !table_info) throw "socket/func or table_info missing";

    const pubThrottle = get(table_rules, ["subscribe", "throttle"]) || 0;
    if (pubThrottle && Number.isInteger(pubThrottle) && pubThrottle > 0) {
      validated_throttle = pubThrottle;
    }
    if (throttle && Number.isInteger(throttle) && throttle >= pubThrottle) {
      validated_throttle = throttle;
    }

    const channel_name = `${this.socketChannelPreffix}.${table_info.name}.${JSON.stringify(filter)}.${JSON.stringify(params)}.${"m"}.sub`;

    this.upsertSocket(socket, channel_name);

    const upsertSub = (newSubData: { table_name: string; condition: string; is_ready: boolean; parentSubParams: SubscriptionParams["parentSubParams"] }) => {
      const { table_name, condition: _cond, is_ready = false, parentSubParams } = newSubData,
        condition = parseCondition(_cond),
        newSub: SubscriptionParams = {
          socket,
          table_name: table_info.name,
          table_info,
          filter,
          params,
          table_rules,
          channel_name,
          parentSubParams,
          func: func ?? undefined,
          socket_id: socket?.id,
          throttle: validated_throttle,
          is_throttling: null,
          last_throttled: 0,
          is_ready,
        };

      this.subs[table_name] = this.subs[table_name] ?? {};
      this.subs[table_name][condition] = this.subs[table_name][condition] ?? { subs: [] };
      this.subs[table_name][condition].subs = this.subs[table_name][condition].subs ?? [];

      // console.log("1034 upsertSub", this.subs)
      const sub_idx = this.subs[table_name][condition].subs.findIndex(s =>
        s.channel_name === channel_name &&
        (
          socket && s.socket_id === socket.id ||
          func && s.func === func
        )
      );
      if (sub_idx < 0) {
        this.subs[table_name][condition].subs.push(newSub);
        if (socket) {
          const chnUnsub = channel_name + "unsubscribe";
          socket.removeAllListeners(chnUnsub);
          socket.once(chnUnsub, (_data: any, cb: BasicCallback) => {
            const res = this.onSocketDisconnected(socket, channel_name);
            cb(null, { res });
          });
        }
      } else {
        this.subs[table_name][condition].subs[sub_idx] = newSub;
      }

      if (is_ready) {
        this.pushSubData(newSub);
      }
    };


    if (table_info.is_view) {
      if (viewOptions?.relatedTables.length) {
 
        viewOptions?.relatedTables.map(async relatedTable => {
          const params: Omit<Parameters<typeof upsertSub>[0], "is_ready"> = {
            table_name: relatedTable.tableName,
            condition: relatedTable.condition,
            parentSubParams: {
              ...subscriptionParams,
              channel_name
            },
          } 
          
          upsertSub({
            ...params,
            is_ready: false
          });

          await this.addTrigger(params);

          upsertSub({
            ...params,
            is_ready: true
          });
        });

        return channel_name
      } else {
        throw "PubSubManager: view parent_tables missing";
      }
      /*  */
    } else {
      /* Just a table, add table + condition trigger */
      // console.log(table_info, 202);

      upsertSub({
        table_name: table_info.name,
        condition: parseCondition(condition),
        parentSubParams: undefined,
        is_ready: false
      });
      await this.addTrigger({
        table_name: table_info.name,
        condition: parseCondition(condition),
      });
      upsertSub({
        table_name: table_info.name,
        condition: parseCondition(condition),
        parentSubParams: undefined,
        is_ready: true
      });

      return channel_name
    }
  }

  removeLocalSub(table_name: string, condition: string, func: (items: object[]) => any) {
    let cond = parseCondition(condition);
    if (get(this.subs, [table_name, cond, "subs"])) {
      this.subs[table_name][cond].subs.map((sub, i) => {
        if (
          sub.func && sub.func === func
        ) {
          this.subs[table_name][cond].subs.splice(i, 1);
        }
      });
    } else {
      console.error("Could not unsubscribe. Subscription might not have initialised yet")
    }
  }

  getActiveListeners = (): { table_name: string; condition: string }[] => {
    let result: { table_name: string; condition: string }[] = [];
    const upsert = (t: string, c: string) => {
      if (!result.find(r => r.table_name === t && r.condition === c)) {
        result.push({ table_name: t, condition: c });
      }
    }
    (this.syncs || []).map(s => {
      upsert(s.table_name, s.condition)
    });
    Object.keys(this.subs || {}).map(table_name => {
      Object.keys(this.subs[table_name] || {}).map(condition => {
        if (this.subs[table_name][condition].subs.length) {
          upsert(table_name, condition);
        }
      });
    });

    return result;
  }

  onSocketDisconnected(socket?: PRGLIOSocket, channel_name?: string) {
    // process.on('warning', e => {
    //     console.warn(e.stack)
    // });
    // console.log("onSocketDisconnected", channel_name, this.syncs)
    if (this.subs) {
      Object.keys(this.subs).map(table_name => {
        Object.keys(this.subs[table_name]).map(condition => {
          this.subs[table_name][condition].subs.map((sub, i) => {

            /**
             * If a channel name is specified then delete triggers 
             */
            if (
              (socket && sub.socket_id === socket.id) &&
              (!channel_name || sub.channel_name === channel_name)
            ) {
              this.subs[table_name][condition].subs.splice(i, 1);
              if (!this.subs[table_name][condition].subs.length) {
                delete this.subs[table_name][condition];

                if (isEmpty(this.subs[table_name])) {
                  delete this.subs[table_name];
                }
              }
            }
          });
        })
      });
    }

    if (this.syncs) {
      this.syncs = this.syncs.filter(s => {
        const matchesSocket = Boolean(socket && s.socket_id !== socket.id)
        if (channel_name) {
          return matchesSocket || s.channel_name !== channel_name
        }

        return matchesSocket;
      });
    }

    if (!socket) {

    } else if (!channel_name) {
      delete this.sockets[socket.id];
    } else {
      socket.removeAllListeners(channel_name);
      socket.removeAllListeners(channel_name + "unsync");
      socket.removeAllListeners(channel_name + "unsubscribe");
    }

    return "ok";
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
      let isHyperTable = await this.db.any("SELECT * FROM " + asName(schema) + ".hypertable WHERE table_name = ${table_name};", { table_name, schema });
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

      let { table_name, condition } = { ...params }
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
        LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

        INSERT INTO prostgles.app_triggers (table_name, condition, app_id, related_view_name, related_view_def) 
          VALUES (${trgVals.tbl}, ${trgVals.cond}, ${asValue(this.appID)}, ${viewOptions?.viewName ?? null}, ${viewOptions?.definition ?? null})
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
        if (!this._triggers[t.table_name].includes(t.condition)) {
          this._triggers[t.table_name].push(t.condition)
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


const parseCondition = (condition: string): string => Boolean(condition && condition.trim().length) ? condition : "TRUE"

export function omitKeys<T extends AnyObject, Exclude extends keyof T>(obj: T, exclude: Exclude[]): Omit<T, Exclude> {
  return pickKeys(obj, getKeys(obj).filter(k => !exclude.includes(k as any)))
}

export function pickKeys<T extends AnyObject, Include extends keyof T>(obj: T, include: Include[] = []): Pick<T, Include> {
  let keys = include;
  if (!keys.length) {
    return {} as any;
  }
  if (obj && keys.length) {
    let res: AnyObject = {};
    keys.forEach(k => {
      res[k] = obj[k];
    });
    return res as any;
  }

  return obj;
}

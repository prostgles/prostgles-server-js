"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.omitKeys = exports.pickKeys = exports.parseCondition = exports.PubSubManager = exports.log = exports.DEFAULT_SYNC_BATCH_SIZE = exports.asValue = void 0;
const addSync_1 = require("./addSync");
const DboBuilder_1 = require("../DboBuilder");
const Prostgles_1 = require("../Prostgles");
const initPubSubManager_1 = require("./initPubSubManager");
const Bluebird = __importStar(require("bluebird"));
const pgPromise = __importStar(require("pg-promise"));
const prostgles_types_1 = require("prostgles-types");
const SyncReplication_1 = require("../SyncReplication");
const util_1 = require("prostgles-types/dist/util");
const getInitQuery_1 = require("./getInitQuery");
const addSub_1 = require("./addSub");
const notifListener_1 = require("./notifListener");
const pushSubData_1 = require("./pushSubData");
const subscribe_1 = require("../DboBuilder/subscribe");
const pgp = pgPromise({
    promiseLib: Bluebird
});
const asValue = (v) => pgp.as.format("$1", [v]);
exports.asValue = asValue;
exports.DEFAULT_SYNC_BATCH_SIZE = 50;
const log = (...args) => {
    if (process.env.TEST_TYPE) {
        console.log(...args);
    }
};
exports.log = log;
class PubSubManager {
    static DELIMITER = '|$prstgls$|';
    dboBuilder;
    get db() {
        return this.dboBuilder.db;
    }
    get dbo() {
        return this.dboBuilder.dbo;
    }
    _triggers;
    sockets = {};
    // subs: { [ke: string]: { [ke: string]: { subs: SubscriptionParams[] } } };
    subs = [];
    syncs = [];
    socketChannelPreffix;
    onSchemaChange = undefined;
    postgresNotifListenManager;
    constructor(options) {
        const { wsChannelNamePrefix, onSchemaChange, dboBuilder } = options;
        if (!dboBuilder.db || !dboBuilder.dbo) {
            throw 'MISSING: db_pg, db';
        }
        this.onSchemaChange = onSchemaChange;
        this.dboBuilder = dboBuilder;
        this.socketChannelPreffix = wsChannelNamePrefix || "_psqlWS_";
        (0, exports.log)("Created PubSubManager");
    }
    NOTIF_TYPE = {
        data: "data_has_changed",
        schema: "schema_has_changed"
    };
    NOTIF_CHANNEL = {
        preffix: 'prostgles_',
        getFull: (appID) => {
            const finalAppId = appID ?? this.appID;
            if (!finalAppId)
                throw "No appID";
            return this.NOTIF_CHANNEL.preffix + finalAppId;
        }
    };
    /**
     * Used facilitate concurrent prostgles connections to the same database
     */
    appID;
    appCheckFrequencyMS = 10 * 1000;
    appCheck;
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
    static canCreate = async (db) => {
        const canExecute = await (0, DboBuilder_1.canEXECUTE)(db);
        const isSuperUs = await (0, Prostgles_1.isSuperUser)(db);
        return { canExecute, isSuperUs, yes: canExecute && isSuperUs };
    };
    static create = async (options) => {
        const res = new PubSubManager(options);
        return await res.init();
    };
    destroyed = false;
    destroy = () => {
        this.destroyed = true;
        if (this.appCheck) {
            clearInterval(this.appCheck);
        }
        this.subs = [];
        this.syncs = [];
        if (!this.postgresNotifListenManager) {
            throw "this.postgresNotifListenManager missing";
        }
        this.postgresNotifListenManager.destroy();
    };
    canContinue = () => {
        if (this.destroyed) {
            console.trace("Could not start destroyed instance");
            return false;
        }
        return true;
    };
    appChecking = false;
    checkedListenerTableCond;
    init = initPubSubManager_1.initPubSubManager.bind(this);
    static SCHEMA_ALTERING_QUERIES = ['CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO'];
    static EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID = "prostgles internal query that should be excluded from schema watch ";
    prepareTriggers = async () => {
        // SELECT * FROM pg_catalog.pg_event_trigger WHERE evtname
        if (!this.appID)
            throw "prepareTriggers failed: this.appID missing";
        if (this.dboBuilder.prostgles.opts.watchSchema && !(await (0, Prostgles_1.isSuperUser)(this.db))) {
            console.warn("prostgles watchSchema requires superuser db user. Will not watch using event triggers");
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
              ${(0, exports.asValue)('triggers_' + this.appID)}
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
                WHERE evtname = ${(0, exports.asValue)(getInitQuery_1.DB_OBJ_NAMES.schema_watch_trigger)}
            );

              -- RAISE NOTICE ' ev_trg_needed %, ev_trg_exists %', ev_trg_needed, ev_trg_exists;

            /**
             *  DROP stale event trigger
             * */
            IF is_super_user IS TRUE AND ev_trg_needed IS FALSE AND ev_trg_exists IS TRUE THEN

                SELECT format(
                  $$ DROP EVENT TRIGGER IF EXISTS %I ; $$
                  , ${(0, exports.asValue)(getInitQuery_1.DB_OBJ_NAMES.schema_watch_trigger)}
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

                DROP EVENT TRIGGER IF EXISTS ${getInitQuery_1.DB_OBJ_NAMES.schema_watch_trigger};
                CREATE EVENT TRIGGER ${getInitQuery_1.DB_OBJ_NAMES.schema_watch_trigger} ON ddl_command_end
                WHEN TAG IN ('COMMENT', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO')
                --WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE TRIGGER', 'DROP TRIGGER')
                EXECUTE PROCEDURE ${getInitQuery_1.DB_OBJ_NAMES.schema_watch_func}();

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
        }
        catch (e) {
            console.error("prepareTriggers failed: ", e);
            throw e;
        }
    };
    isReady() {
        if (!this.postgresNotifListenManager)
            throw "this.postgresNotifListenManager missing";
        return this.postgresNotifListenManager.isListening();
    }
    getClientSubs(client) {
        return this.subs.filter(s => {
            return s.channel_name === client.channel_name && ((0, subscribe_1.matchesLocalFuncs)(client.localFuncs, s.localFuncs) || client.socket_id && s.socket_id === client.socket_id);
        });
    }
    getTriggerSubs(table_name, condition) {
        const subs = this.subs.filter(s => (0, util_1.find)(s.triggers, { table_name, condition }));
        return subs;
    }
    removeLocalSub(channelName, localFuncs) {
        const matchingSubIdx = this.subs.findIndex(s => s.channel_name === channelName &&
            (0, subscribe_1.getOnDataFunc)(localFuncs) === (0, subscribe_1.getOnDataFunc)(s.localFuncs));
        if (matchingSubIdx > -1) {
            this.subs.splice(matchingSubIdx, 1);
        }
        else {
            console.error("Could not unsubscribe. Subscription might not have initialised yet", { channelName });
        }
    }
    getSyncs(table_name, condition) {
        return (this.syncs || [])
            .filter((s) => s.table_name === table_name && s.condition === condition);
    }
    notifListener = notifListener_1.notifListener.bind(this);
    getSubData = async (sub) => {
        const { table_info, filter, params, table_rules } = sub; //, subOne = false 
        const { name: table_name } = table_info;
        if (!this.dbo?.[table_name]?.find) {
            throw new Error(`1107 this.dbo.${table_name}.find`);
        }
        try {
            const data = await this.dbo?.[table_name].find(filter, params, undefined, table_rules);
            return { data };
        }
        catch (err) {
            return { err };
        }
    };
    pushSubData = pushSubData_1.pushSubData.bind(this);
    upsertSocket(socket) {
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
    syncTimeout;
    async syncData(sync, clientData, source) {
        return await (0, SyncReplication_1.syncData)(this, sync, clientData, source);
    }
    addSync = addSync_1.addSync.bind(this);
    addSub = addSub_1.addSub.bind(this);
    getActiveListeners = () => {
        const result = [];
        const upsert = (t, c) => {
            if (!result.find(r => r.table_name === t && r.condition === c)) {
                result.push({ table_name: t, condition: c });
            }
        };
        (this.syncs || []).map(s => {
            upsert(s.table_name, s.condition);
        });
        this.subs.forEach(s => {
            s.triggers.forEach(trg => {
                upsert(trg.table_name, trg.condition);
            });
        });
        return result;
    };
    checkIfTimescaleBug = async (table_name) => {
        const schema = "_timescaledb_catalog", res = await this.db.oneOrNone("SELECT EXISTS( \
            SELECT * \
            FROM information_schema.tables \
            WHERE 1 = 1 \
                AND table_schema = ${schema} \
                AND table_name = 'hypertable' \
        );", { schema });
        if (res.exists) {
            const isHyperTable = await this.db.any("SELECT * FROM " + (0, prostgles_types_1.asName)(schema) + ".hypertable WHERE table_name = ${table_name};", { table_name, schema });
            if (isHyperTable && isHyperTable.length) {
                throw "Triggers do not work on timescaledb hypertables due to bug:\nhttps://github.com/timescale/timescaledb/issues/1084";
            }
        }
        return true;
    };
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
    `, [this.appID]);
    };
    // waitingTriggers: { [key: string]: string[] } = undefined;
    addingTrigger;
    addTriggerPool = undefined;
    async addTrigger(params, viewOptions) {
        try {
            const { table_name } = { ...params };
            let { condition } = { ...params };
            if (!table_name)
                throw "MISSING table_name";
            if (!this.appID)
                throw "MISSING appID";
            if (!condition || !condition.trim().length) {
                condition = "TRUE";
            }
            // console.log(1623, { app_id, addTrigger: { table_name, condition } });
            await this.checkIfTimescaleBug(table_name);
            const trgVals = {
                tbl: (0, exports.asValue)(table_name),
                cond: (0, exports.asValue)(condition),
            };
            await this.db.any(`
        BEGIN WORK;
        /* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

        INSERT INTO prostgles.app_triggers (table_name, condition, app_id, related_view_name, related_view_def) 
          VALUES (${trgVals.tbl}, ${trgVals.cond}, ${(0, exports.asValue)(this.appID)}, ${(0, exports.asValue)(viewOptions?.viewName ?? null)}, ${(0, exports.asValue)(viewOptions?.definition ?? null)})
        ON CONFLICT DO NOTHING;
              
        COMMIT WORK;
      `);
            (0, exports.log)("addTrigger.. ", { table_name, condition });
            const triggers = await this.db.any(await this.getMyTriggerQuery());
            this._triggers = {};
            triggers.map(t => {
                this._triggers = this._triggers || {};
                this._triggers[t.table_name] = this._triggers[t.table_name] || [];
                if (!this._triggers[t.table_name]?.includes(t.condition)) {
                    this._triggers[t.table_name]?.push(t.condition);
                }
            });
            (0, exports.log)("trigger added.. ", { table_name, condition });
            return true;
            // console.log("1612", JSON.stringify(triggers, null, 2))
            // console.log("1613",JSON.stringify(this._triggers, null, 2))
        }
        catch (e) {
            console.trace("Failed adding trigger", e);
            // throw e
        }
    }
}
exports.PubSubManager = PubSubManager;
const parseCondition = (condition) => condition && condition.trim().length ? condition : "TRUE";
exports.parseCondition = parseCondition;
var prostgles_types_2 = require("prostgles-types");
Object.defineProperty(exports, "pickKeys", { enumerable: true, get: function () { return prostgles_types_2.pickKeys; } });
Object.defineProperty(exports, "omitKeys", { enumerable: true, get: function () { return prostgles_types_2.omitKeys; } });

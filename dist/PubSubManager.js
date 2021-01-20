"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterObj = exports.PubSubManager = exports.DEFAULT_SYNC_BATCH_SIZE = void 0;
const PostgresNotifListenManager_1 = require("./PostgresNotifListenManager");
const utils_1 = require("./utils");
const DboBuilder_1 = require("./DboBuilder");
const Bluebird = require("bluebird");
const pgPromise = require("pg-promise");
const prostgles_types_1 = require("prostgles-types");
let pgp = pgPromise({
    promiseLib: Bluebird
});
exports.DEFAULT_SYNC_BATCH_SIZE = 50;
const log = (...args) => {
    if (process.env.TEST_TYPE) {
        console.log(...args);
    }
};
class PubSubManager {
    constructor(options) {
        this.schemaChangedNotifPayloadStr = "$prostgles_schema_has_changed$";
        /* Relay relevant data to relevant subscriptions */
        this.notifListener = (data) => {
            let dataArr = data.payload.split(PubSubManager.DELIMITER);
            let table_name = dataArr[0], op_name = dataArr[1], condition_ids_str = dataArr[2];
            log(table_name, op_name, condition_ids_str, this.triggers[table_name]);
            if (table_name && table_name === this.schemaChangedNotifPayloadStr) {
                // console.log(op_name)
                this.onSchemaChange();
            }
            else if (condition_ids_str &&
                condition_ids_str.split(",").length &&
                !condition_ids_str.split(",").find((c) => !Number.isInteger(+c)) &&
                this.triggers && this.triggers[table_name] && this.triggers[table_name].length) {
                condition_ids_str.split(",").map((condition_id) => {
                    const condition = this.triggers[table_name][condition_id];
                    const subs = this.getSubs(table_name, condition);
                    const syncs = this.getSyncs(table_name, condition);
                    // console.log("SYNC DATA ", this.syncs)
                    // console.log(table_name, condition, this.syncs)
                    syncs.map((s) => {
                        // console.log("SYNC DATA FROM TRIGGER");
                        this.syncData(s, null);
                    });
                    if (!subs) {
                        // console.error(`sub missing for ${table_name} ${condition}`, this.triggers);
                        // console.log(this.subs)
                        return;
                    }
                    /* Throttle the subscriptions */
                    for (var i = 0; i < subs.length; i++) {
                        var sub = subs[i];
                        if (this.dbo[sub.table_name] &&
                            sub.is_ready &&
                            (sub.socket_id && this.sockets[sub.socket_id]) || sub.func) {
                            const throttle = sub.throttle;
                            if (sub.last_throttled <= Date.now() - throttle) {
                                /* It is assumed the policy was checked before this point */
                                this.pushSubData(sub);
                                sub.last_throttled = Date.now();
                            }
                            else if (!sub.is_throttling) {
                                log("throttling sub");
                                sub.is_throttling = setTimeout(() => {
                                    log("throttling finished. pushSubData...");
                                    sub.is_throttling = null;
                                    this.pushSubData(sub);
                                    sub.last_throttled = Date.now();
                                }, throttle); // sub.throttle);
                            }
                        }
                    }
                });
            }
            else {
                if (!this.triggers || !this.triggers[table_name] || !this.triggers[table_name].length) {
                    console.warn(190, "Trigger sub not found. DROPPING TRIGGER", table_name, condition_ids_str, this.triggers);
                    this.dropTrigger(table_name);
                }
                else {
                    console.warn(190, "Trigger sub issue: ", table_name, condition_ids_str, this.triggers);
                }
            }
        };
        this.syncTimeout = null;
        this.parseCondition = (condition) => Boolean(condition && condition.trim().length) ? condition : "TRUE";
        const { db, dbo, wsChannelNamePrefix, pgChannelName, onSchemaChange } = options;
        if (!db || !dbo) {
            throw 'MISSING: db_pg, db';
        }
        this.db = db;
        this.dbo = dbo;
        this.onSchemaChange = onSchemaChange;
        this.triggers = {};
        this.sockets = {};
        this.subs = {};
        this.syncs = [];
        this.socketChannelPreffix = wsChannelNamePrefix || "_psqlWS_";
        this.postgresNotifChannelName = pgChannelName || "prostgles-socket-replication";
        this.postgresNotifListenManager = new PostgresNotifListenManager_1.PostgresNotifListenManager(db, this.notifListener, 'prostgles-socket-replication');
        if (!this.postgresNotifChannelName)
            throw "postgresNotifChannelName missing";
        if (this.onSchemaChange) {
            this.startWatchingSchema();
        }
        // return this.postgresNotifListenManager.then(success => true);
    }
    startWatchingSchema() {
        return __awaiter(this, void 0, void 0, function* () {
            const pref = "prostgles_", funcName = DboBuilder_1.asName(pref + "schema_watch_func"), triggerName = DboBuilder_1.asName(pref + "schema_watch_trigger");
            yield this.db.any(`


        BEGIN;

        DROP EVENT TRIGGER IF EXISTS ${triggerName};


        CREATE OR REPLACE FUNCTION ${funcName}() RETURNS event_trigger AS $$

        DECLARE condition_ids TEXT := '';            
        
        BEGIN

        PERFORM pg_notify( '${this.postgresNotifChannelName}' , '${this.schemaChangedNotifPayloadStr}${PubSubManager.DELIMITER}' || tg_tag || TG_event ); 

        END;
        $$ LANGUAGE plpgsql;


        CREATE EVENT TRIGGER ${triggerName} ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE')
        EXECUTE PROCEDURE ${funcName}();

        COMMIT;
        `);
        });
    }
    isReady() {
        return this.postgresNotifListenManager.isListening();
    }
    getSubs(table_name, condition) {
        return utils_1.get(this.subs, [table_name, condition, "subs"]);
    }
    getSyncs(table_name, condition) {
        return (this.syncs || [])
            .filter((s) => !s.is_syncing && s.table_name === table_name && s.condition === condition);
    }
    pushSubData(sub) {
        if (!sub)
            throw "pushSubData: invalid sub";
        const { table_name, filter, params, table_rules, socket_id, channel_name, func, subOne = false } = sub;
        return new Promise((resolve, reject) => {
            this.dbo[table_name][subOne ? "findOne" : "find"](filter, params, null, table_rules)
                .then(data => {
                if (socket_id && this.sockets[socket_id]) {
                    log("Pushed " + data.length + " records to sub");
                    this.sockets[socket_id].emit(channel_name, { data }, () => {
                        resolve(data);
                    });
                    /* TO DO: confirm receiving data or server will unsubscribe
                            { data }, (cb)=> { console.log(cb) });
                    */
                }
                else if (func) {
                    func(data);
                    resolve(data);
                }
                sub.last_throttled = Date.now();
            }).catch(err => {
                const errObj = { _err_msg: err.toString(), err };
                if (socket_id && this.sockets[socket_id]) {
                    this.sockets[socket_id].emit(channel_name, { err: errObj });
                }
                else if (func) {
                    func({ err: errObj });
                }
                reject(errObj);
            });
        });
    }
    upsertSocket(socket, channel_name) {
        if (socket && !this.sockets[socket.id]) {
            this.sockets[socket.id] = socket;
            socket.on("disconnect", () => this.onSocketDisconnected(socket, null));
        }
    }
    syncData(sync, clientData) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("S", clientData)
            const { socket_id, channel_name, table_name, filter, table_rules, allow_delete = false, params, synced_field, id_fields = [], batch_size, isSyncingTimeout, wal, throttle } = sync, socket = this.sockets[socket_id];
            if (!socket)
                throw "Orphaned socket";
            const sync_fields = [synced_field, ...id_fields.sort()], orderByAsc = sync_fields.reduce((a, v) => (Object.assign(Object.assign({}, a), { [v]: true })), {}), orderByDesc = sync_fields.reduce((a, v) => (Object.assign(Object.assign({}, a), { [v]: false })), {}), 
            // desc_params = { orderBy: [{ [synced_field]: false }].concat(id_fields.map(f => ({ [f]: false }) )) },
            // asc_params = { orderBy: [synced_field].concat(id_fields) },
            rowsIdsMatch = (a, b) => {
                return a && b && !id_fields.find(key => a[key].toString() !== b[key].toString());
            }, rowsFullyMatch = (a, b) => {
                return rowsIdsMatch(a, b) && a[synced_field].toString() === b[synced_field].toString();
            }, getServerRowInfo = ({ from_synced = null, to_synced = null, end_offset = null } = {}) => __awaiter(this, void 0, void 0, function* () {
                let _filter = Object.assign({}, filter);
                if (from_synced || to_synced) {
                    _filter[synced_field] = Object.assign(Object.assign({}, (from_synced ? { $gte: from_synced } : {})), (to_synced ? { $lte: to_synced } : {}));
                }
                const first_rows = yield this.dbo[table_name].find(_filter, { orderBy: orderByAsc, select: sync_fields, limit: 1 }, null, table_rules);
                const last_rows = yield this.dbo[table_name].find(_filter, { orderBy: orderByDesc, select: sync_fields, limit: 1, offset: end_offset || 0 }, null, table_rules);
                const count = yield this.dbo[table_name].count(_filter, null, null, table_rules);
                return { s_fr: first_rows[0] || null, s_lr: last_rows[0] || null, s_count: count };
            }), getClientRowInfo = ({ from_synced = null, to_synced = null, end_offset = null } = {}) => {
                let res = new Promise((resolve, reject) => {
                    let onSyncRequest = { from_synced, to_synced, end_offset }; //, forReal: true };
                    socket.emit(channel_name, { onSyncRequest }, (resp) => {
                        if (resp.onSyncRequest) {
                            let c_fr = resp.onSyncRequest.c_fr, c_lr = resp.onSyncRequest.c_lr, c_count = resp.onSyncRequest.c_count;
                            // console.log(onSyncRequest, { c_fr, c_lr, c_count }, socket._user);
                            return resolve({ c_fr, c_lr, c_count });
                        }
                        else if (resp.err) {
                            reject(resp.err);
                        }
                    });
                });
                return res;
            }, getClientData = (from_synced = 0, offset = 0) => {
                return new Promise((resolve, reject) => {
                    const onPullRequest = { from_synced: from_synced || 0, offset: offset || 0, limit: batch_size };
                    socket.emit(channel_name, { onPullRequest }, (resp) => __awaiter(this, void 0, void 0, function* () {
                        if (resp && resp.data && Array.isArray(resp.data)) {
                            // console.log({ onPullRequest, resp }, socket._user)
                            resolve(sortClientData(resp.data));
                        }
                        else {
                            reject("unexpected onPullRequest response: " + JSON.stringify(resp));
                        }
                    }));
                });
                function sortClientData(data) {
                    return data.sort((a, b) => {
                        /* Order by increasing synced and ids (sorted alphabetically) */
                        return (a[synced_field] - b[synced_field]) || id_fields.sort().map(idKey => a[idKey] < b[idKey] ? -1 : a[idKey] > b[idKey] ? 1 : 0).find(v => v) || 0;
                    });
                }
            }, getServerData = (from_synced = 0, offset = 0) => {
                let _filter = Object.assign(Object.assign({}, filter), { [synced_field]: { $gte: from_synced || 0 } });
                return this.dbo[table_name].find(_filter, {
                    select: params.select,
                    orderBy: orderByAsc,
                    offset: offset || 0,
                    limit: batch_size
                }, null, table_rules);
            }, deleteData = (deleted) => __awaiter(this, void 0, void 0, function* () {
                // console.log("deleteData deleteData  deleteData " + deleted.length);
                if (allow_delete) {
                    return Promise.all(deleted.map((d) => __awaiter(this, void 0, void 0, function* () {
                        const id_filter = filterObj(d, id_fields);
                        try {
                            yield this.dbo[table_name].delete(id_filter, null, null, table_rules);
                            return 1;
                        }
                        catch (e) {
                            console.error(e);
                        }
                        return 0;
                    })));
                }
                else {
                    console.warn("client tried to delete data without permission (allow_delete is false)");
                }
                return false;
            }), upsertData = (data, isExpress = false) => {
                let inserted = 0, updated = 0, total = data.length;
                // console.log("isExpress", isExpress, data);
                return Promise.all(data.map((d, i) => __awaiter(this, void 0, void 0, function* () {
                    const id_filter = filterObj(d, id_fields);
                    /* To account for client time deviation */
                    /* This can break sync.lr logic (correct timestamps but recursive syncing) */
                    // d[synced_field] = isExpress? (Date.now() + i) : Math.max(Date.now(), d[synced_field]);
                    /* Select only the necessary fields when preparing to update */
                    const exst = yield this.dbo[table_name].find(id_filter, { select: { [synced_field]: 1 }, orderBy: orderByAsc, limit: 1 }, null, table_rules);
                    /* TODO: Add batch INSERT with ON CONFLICT DO UPDATE */
                    if (exst && exst.length) {
                        // console.log(exst[0], d)
                        if (table_rules.update && +exst[0][synced_field] < +d[synced_field]) {
                            try {
                                const syncSafeFilter = { $and: [id_filter, { [synced_field]: { "<": d[synced_field] } }] };
                                updated++;
                                yield this.dbo[table_name].update(syncSafeFilter, filterObj(d, [], id_fields), { fixIssues: true }, table_rules);
                            }
                            catch (e) {
                                console.log(e);
                                throw e;
                            }
                        }
                    }
                    else if (table_rules.insert) {
                        try {
                            inserted++;
                            yield this.dbo[table_name].insert(d, { fixIssues: true }, null, table_rules);
                        }
                        catch (e) {
                            console.log(e);
                            throw e;
                        }
                    }
                    else {
                        console.error("SYNC onPullRequest UNEXPECTED CASE\n Data item does not exist on server and insert is not allowed !???");
                        return false;
                    }
                    return true;
                })))
                    .then(res => {
                    // console.log(`upsertData: inserted( ${inserted} )    updated( ${updated} )     total( ${total} )`);
                    return { inserted, updated, total };
                })
                    .catch(err => {
                    console.error("Something went wrong with syncing to server: \n ->", err, data, id_fields);
                    return Promise.reject("Something went wrong with syncing to server: ");
                });
            }, pushData = (data, isSynced = false) => __awaiter(this, void 0, void 0, function* () {
                return new Promise((resolve, reject) => {
                    socket.emit(channel_name, { data, isSynced }, (resp) => {
                        if (resp && resp.ok) {
                            // console.log("PUSHED to client: fr/lr", data[0], data[data.length - 1]);
                            resolve({ pushed: data.length, resp });
                        }
                        else {
                            reject(resp);
                            console.error("Unexpected response");
                        }
                    });
                });
            }), getLastSynced = (clientData) => __awaiter(this, void 0, void 0, function* () {
                // Get latest row info
                const { c_fr, c_lr, c_count } = clientData || (yield getClientRowInfo());
                const { s_fr, s_lr, s_count } = yield getServerRowInfo();
                // console.log("getLastSynced", clientData, socket._user )
                let result = null;
                /* Nothing to sync */
                if (!c_fr && !s_fr || rowsFullyMatch(c_lr, s_lr)) { //  c_count === s_count && 
                    // sync.last_synced = null;
                    result = null;
                    /* Sync Everything */
                }
                else if (!rowsFullyMatch(c_fr, s_fr)) {
                    if (c_fr && s_fr) {
                        result = Math.min(c_fr[synced_field], s_fr[synced_field]);
                    }
                    else if (c_fr || s_fr) {
                        result = (c_fr || s_fr)[synced_field];
                    }
                    /* Sync from last matching synced value */
                }
                else if (rowsFullyMatch(c_fr, s_fr)) {
                    if (s_lr && c_lr) {
                        result = Math.min(c_lr[synced_field], s_lr[synced_field]);
                    }
                    else {
                        result = Math.min(c_fr[synced_field], s_fr[synced_field]);
                    }
                    let min_count = Math.min(c_count, s_count);
                    let end_offset = 1; // Math.min(s_count, c_count) - 1;
                    let step = 0;
                    while (min_count > 5 && end_offset < min_count) {
                        const { c_lr = null } = yield getClientRowInfo({ from_synced: 0, to_synced: result, end_offset });
                        // console.log("getLastSynced... end_offset > " + end_offset);
                        let server_row;
                        if (c_lr) {
                            let _filter = {};
                            sync_fields.map(key => {
                                _filter[key] = c_lr[key];
                            });
                            server_row = yield this.dbo[table_name].find(_filter, { select: sync_fields, limit: 1 }, null, table_rules);
                        }
                        // if(rowsFullyMatch(c_lr, s_lr)){ //c_count === s_count && 
                        if (server_row && server_row.length) {
                            server_row = server_row[0];
                            result = server_row[synced_field];
                            end_offset = min_count;
                            // console.log(`getLastSynced found for ${table_name} -> ${result}`);
                        }
                        else {
                            end_offset += 1 + step * (step > 4 ? 2 : 1);
                            // console.log(`getLastSynced NOT found for ${table_name} -> ${result}`);
                        }
                        step++;
                    }
                }
                return result;
            }), syncBatch = (from_synced) => __awaiter(this, void 0, void 0, function* () {
                let offset = 0, limit = batch_size, canContinue = true, min_synced = from_synced || 0, max_synced = from_synced;
                let inserted = 0, updated = 0, pushed = 0, deleted = 0, total = 0;
                // console.log("syncBatch", from_synced)
                while (canContinue) {
                    let cData = yield getClientData(min_synced, offset);
                    if (cData.length) {
                        let res = yield upsertData(cData);
                        inserted += res.inserted;
                        updated += res.updated;
                    }
                    let sData = yield getServerData(min_synced, offset);
                    // console.log("allow_delete", table_rules.delete);
                    if (allow_delete && table_rules.delete) {
                        const to_delete = sData.filter(d => {
                            !cData.find(c => rowsIdsMatch(c, d));
                        });
                        yield Promise.all(to_delete.map(d => {
                            deleted++;
                            return this.dbo[table_name].delete(filterObj(d, id_fields), {}, null, table_rules);
                        }));
                        sData = yield getServerData(min_synced, offset);
                    }
                    let forClient = sData.filter(s => {
                        return !cData.find(c => rowsIdsMatch(c, s) &&
                            c[synced_field] >= s[synced_field]);
                    });
                    if (forClient.length) {
                        let res = yield pushData(forClient);
                        pushed += res.pushed;
                    }
                    if (sData.length) {
                        sync.lr = sData[sData.length - 1];
                        sync.last_synced = sync.lr[synced_field];
                        total += sData.length;
                    }
                    offset += sData.length;
                    // canContinue = offset >= limit;
                    canContinue = sData.length >= limit;
                    // console.log(`sData ${sData.length}      limit ${limit}`);
                }
                // console.log(`syncBatch ${table_name}: inserted( ${inserted} )    updated( ${updated} )   deleted( ${deleted} )    pushed( ${pushed} )     total( ${total} )`, socket._user );
                return true;
            });
            if (!wal) {
                sync.wal = new prostgles_types_1.WAL({
                    id_fields, synced_field, throttle, batch_size,
                    onSendStart: () => {
                        sync.is_syncing = true;
                    },
                    onSend: (data) => __awaiter(this, void 0, void 0, function* () {
                        // console.log("WAL upsertData START", data)
                        const res = yield upsertData(data, true);
                        // console.log("WAL upsertData END")
                        return res;
                    }),
                    onSendEnd: () => {
                        sync.is_syncing = false;
                        // console.log("syncData from WAL.onSendEnd")
                        this.syncData(sync, null);
                    },
                });
            }
            // console.log("syncData", clientData)
            /* Express data sent from client */
            if (clientData) {
                if (clientData.data && Array.isArray(clientData.data) && clientData.data.length) {
                    sync.wal.addData(clientData.data);
                    return;
                    // await upsertData(clientData.data, true);
                    /* Not expecting this anymore. use normal db.table.delete channel */
                }
                else if (clientData.deleted && Array.isArray(clientData.deleted) && clientData.deleted.length) {
                    yield deleteData(clientData.deleted);
                }
            }
            if (sync.wal.isSending() || sync.is_syncing) {
                if (!this.syncTimeout) {
                    this.syncTimeout = setTimeout(() => {
                        this.syncTimeout = null;
                        // console.log("SYNC FROM TIMEOUT")
                        this.syncData(sync, null);
                    }, throttle);
                }
                // console.log("SYNC THROTTLE")
                return;
            }
            sync.is_syncing = true;
            // from synced does not make sense. It should be sync.lr only!!!
            let from_synced = null;
            if (sync.lr) {
                const { s_lr } = yield getServerRowInfo();
                /* Make sure trigger is not firing on freshly synced data */
                if (!rowsFullyMatch(sync.lr, s_lr)) {
                    from_synced = sync.last_synced;
                }
                else {
                    // console.log("rowsFullyMatch")
                }
                // console.log(table_name, sync.lr[synced_field])
            }
            else {
                from_synced = yield getLastSynced(clientData);
            }
            if (from_synced !== null) {
                yield syncBatch(from_synced);
            }
            else {
                // console.log("from_synced is null")
            }
            yield pushData([], true);
            sync.is_syncing = false;
            // console.log(`Finished sync for ${table_name}`, socket._user);
        });
    }
    /* Returns a sync channel */
    addSync(syncParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const { socket = null, table_info = null, table_rules = null, synced_field = null, allow_delete = null, id_fields = [], filter = {}, params, condition = "", throttle = 0 } = syncParams || {};
            let conditionParsed = this.parseCondition(condition);
            if (!socket || !table_info)
                throw "socket or table_info missing";
            const { name: table_name } = table_info, channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.sync`;
            if (!synced_field)
                throw "synced_field missing from table_rules";
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
                    throttle: Math.max(throttle || 0, table_rules.sync.throttle || 0),
                    batch_size: utils_1.get(table_rules, "sync.batch_size") || exports.DEFAULT_SYNC_BATCH_SIZE,
                    last_throttled: 0,
                    socket_id: socket.id,
                    is_sync: true,
                    last_synced: 0,
                    lr: null,
                    table_info,
                    is_syncing: false,
                    isSyncingTimeout: null,
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
                    socket.once(channel_name + "unsync", () => {
                        this.onSocketDisconnected(socket, channel_name);
                    });
                    socket.removeAllListeners(channel_name);
                    socket.on(channel_name, (data, cb) => {
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
                            this.syncData(newSync, data.onSyncRequest);
                            // console.log("onSyncRequest ", socket._user)
                        }
                    });
                    // socket.emit(channel_name, { onSyncRequest: true }, (response) => {
                    //     console.log(response)
                    // });
                }
                else {
                    console.error("UNCLOSED DUPLICATE SYNC FOUND");
                }
                return newSync;
            };
            // const { min_id, max_id, count, max_synced } = params;
            let sync = upsertSync();
            yield this.addTrigger({ table_name, condition: conditionParsed });
            return channel_name;
        });
    }
    /* Must return a channel for socket */
    /* The distinct list of channel names must have a corresponding trigger in the database */
    addSub(subscriptionParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const { socket = null, func = null, table_info = null, table_rules = null, filter = {}, params = {}, condition = "", subOne = false } = subscriptionParams || {};
            let throttle = subscriptionParams.throttle || 10;
            if ((!socket && !func) || !table_info)
                throw "socket/func or table_info missing";
            const pubThrottle = utils_1.get(table_rules, ["subscribe", "throttle"]);
            if (pubThrottle && Number.isInteger(pubThrottle) && pubThrottle > 0) {
                throttle = pubThrottle;
            }
            let channel_name = `${this.socketChannelPreffix}.${table_info.name}.${JSON.stringify(filter)}.${JSON.stringify(params)}.${subOne ? "o" : "m"}.sub`;
            this.upsertSocket(socket, channel_name);
            const upsertSub = (newSubData) => {
                const { table_name, condition: _cond, is_ready = false } = newSubData, condition = this.parseCondition(_cond), newSub = {
                    socket,
                    table_name: table_info.name,
                    table_info,
                    filter,
                    params,
                    table_rules,
                    channel_name,
                    func: func ? func : null,
                    socket_id: socket ? socket.id : null,
                    throttle,
                    is_throttling: null,
                    last_throttled: 0,
                    is_ready,
                    subOne
                };
                this.subs[table_name] = this.subs[table_name] || {};
                this.subs[table_name][condition] = this.subs[table_name][condition] || { subs: [] };
                this.subs[table_name][condition].subs = this.subs[table_name][condition].subs || [];
                const sub_idx = this.subs[table_name][condition].subs.findIndex(s => s.channel_name === channel_name &&
                    (socket && s.socket_id === socket.id ||
                        func && s.func === func));
                if (sub_idx < 0) {
                    this.subs[table_name][condition].subs.push(newSub);
                    if (socket) {
                        const chnUnsub = channel_name + "unsubscribe";
                        socket.removeAllListeners(chnUnsub);
                        socket.once(chnUnsub, () => this.onSocketDisconnected(socket, channel_name));
                    }
                }
                else {
                    this.subs[table_name][condition].subs[sub_idx] = newSub;
                }
                if (is_ready) {
                    this.pushSubData(newSub);
                }
            };
            if (table_info.is_view && table_info.parent_tables) {
                if (table_info.parent_tables.length) {
                    let _condition = "TRUE";
                    table_info.parent_tables.map((table_name) => __awaiter(this, void 0, void 0, function* () {
                        upsertSub({
                            table_name,
                            condition: _condition,
                            is_ready: true
                        });
                        yield this.addTrigger({
                            table_name,
                            condition: _condition
                        });
                        upsertSub({
                            table_name,
                            condition: _condition,
                            is_ready: true
                        });
                    }));
                    return channel_name;
                }
                else {
                    throw "PubSubManager: view parent_tables missing";
                }
                /*  */
            }
            else {
                /* Just a table, add table + condition trigger */
                // console.log(table_info, 202);
                upsertSub({
                    table_name: table_info.name,
                    condition: this.parseCondition(condition),
                    is_ready: false
                });
                yield this.addTrigger({
                    table_name: table_info.name,
                    condition: this.parseCondition(condition),
                });
                upsertSub({
                    table_name: table_info.name,
                    condition: this.parseCondition(condition),
                    is_ready: true
                });
                return channel_name;
            }
        });
    }
    removeLocalSub(table_name, condition, func) {
        let cond = this.parseCondition(condition);
        if (utils_1.get(this.subs, [table_name, cond, "subs"])) {
            this.subs[table_name][cond].subs.map((sub, i) => {
                if (sub.func && sub.func === func) {
                    this.subs[table_name][cond].subs.splice(i, 1);
                }
            });
        }
        else {
            console.error("Could not unsubscribe. Subscription might not have initialised yet");
        }
    }
    onSocketDisconnected(socket, channel_name) {
        // process.on('warning', e => {
        //     console.warn(e.stack)
        // });
        // console.log("onSocketDisconnected", channel_name, this.syncs)
        if (this.subs) {
            Object.keys(this.subs).map(table_name => {
                Object.keys(this.subs[table_name]).map(condition => {
                    this.subs[table_name][condition].subs.map((sub, i) => {
                        if (sub.socket_id === socket.id &&
                            (!channel_name || sub.channel_name === channel_name)) {
                            this.subs[table_name][condition].subs.splice(i, 1);
                        }
                    });
                });
            });
        }
        if (this.syncs) {
            this.syncs = this.syncs.filter(s => {
                if (channel_name) {
                    return s.socket_id !== socket.id || s.channel_name !== channel_name;
                }
                return s.socket_id !== socket.id;
            });
        }
        if (!channel_name) {
            delete this.sockets[socket.id];
        }
        else {
            socket.removeAllListeners(channel_name);
            socket.removeAllListeners(channel_name + "unsync");
            socket.removeAllListeners(channel_name + "unsubscribe");
        }
    }
    // /* Remove Sub channels (and triggers if required) upon user request */
    // removeSub(socket, { channel_name, table_name } = {}){
    // }
    dropTrigger(table_name) {
        this.db.any(`
            DROP TRIGGER IF EXISTS ${this.getTriggerName(table_name, "_insert")} ON ${table_name};
            DROP TRIGGER IF EXISTS ${this.getTriggerName(table_name, "_update")} ON ${table_name};
            DROP TRIGGER IF EXISTS ${this.getTriggerName(table_name, "_delete")} ON ${table_name};
        `).then(res => {
            // console.error("Dropped trigger result: ", res);
        })
            .catch(err => {
            console.error("Error dropping trigger: ", err);
        });
    }
    getTriggerName(table_name, suffix) {
        return pgp.as.format("$1:name", [`prostgles_triggers_${table_name}_${suffix}`]);
    }
    /*
        A table will only have a trigger with all conditions (for different subs)
            conditions = ["user_id = 1"]
            fields = ["user_id"]
    */
    addTrigger(params) {
        return __awaiter(this, void 0, void 0, function* () {
            let { table_name, condition } = Object.assign({}, params);
            if (!table_name)
                throw "MISSING table_name";
            log("addTrigger.. ", { table_name, condition });
            if (!condition || !condition.trim().length)
                condition = "TRUE";
            let _condts = [condition];
            /* Check if need to add it to existing conditions */
            if (this.triggers[table_name] && this.triggers[table_name].includes(condition)) {
                /* Trigger already set. Nothing to do */
                log("addTrigger.. Trigger already set. Nothing to do", { table_name, condition });
                return Promise.resolve(true);
            }
            else {
                this.triggers[table_name] = this.triggers[table_name] || [];
                _condts = [...this.triggers[table_name], condition];
            }
            const func_name_escaped = pgp.as.format("$1:name", [`prostgles_funcs_${table_name}`]), table_name_escaped = pgp.as.format("$1:name", [table_name]), delimiter = PubSubManager.DELIMITER, query = ` BEGIN;
                CREATE OR REPLACE FUNCTION ${func_name_escaped}() RETURNS TRIGGER AS $$
        
                DECLARE condition_ids TEXT := '';            
                
                BEGIN
                
                    IF (TG_OP = 'DELETE') THEN
                        SELECT string_agg(DISTINCT t.c_ids, ',')
                        INTO condition_ids
                        FROM (
                            ${_condts.map((c, cIndex) => `
                                SELECT CASE WHEN EXISTS(SELECT 1 FROM old_table as ${DboBuilder_1.asName(table_name)} WHERE ${c}) THEN '${cIndex}' END AS c_ids
                            `).join(" UNION ALL ")}
                        ) t;

                    ELSIF (TG_OP = 'UPDATE') THEN
                        SELECT string_agg(DISTINCT t.c_ids, ',')
                        INTO condition_ids
                        FROM (
                            ${_condts.map((c, cIndex) => `
                                SELECT CASE WHEN EXISTS(SELECT 1 FROM old_table as ${DboBuilder_1.asName(table_name)} WHERE ${c}) THEN '${cIndex}' END AS c_ids UNION ALL 
                                SELECT CASE WHEN EXISTS(SELECT 1 FROM new_table as ${DboBuilder_1.asName(table_name)} WHERE ${c}) THEN '${cIndex}' END AS c_ids
                            `).join(" UNION ALL ")}
                        ) t;
                        
                    ELSIF (TG_OP = 'INSERT') THEN
                        SELECT string_agg(DISTINCT t.c_ids, ',')
                        INTO condition_ids
                        FROM (
                            ${_condts.map((c, cIndex) => `
                                SELECT CASE WHEN EXISTS(SELECT 1 FROM new_table as ${DboBuilder_1.asName(table_name)} WHERE ${c}) THEN '${cIndex}' END AS c_ids
                            `).join(" UNION ALL ")}
                        ) t;

                    END IF;


                    IF condition_ids IS NOT NULL THEN
                        PERFORM pg_notify( '${this.postgresNotifChannelName}' , COALESCE(TG_TABLE_NAME, 'MISSING') || '${delimiter}' || COALESCE(TG_OP, 'MISSING')  || '${delimiter}' || COALESCE(condition_ids, '') ); 
                    END IF;

                    RETURN NULL; -- result is ignored since this is an AFTER trigger
                END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS ${this.getTriggerName(table_name, "_insert")} ON ${table_name_escaped};
            CREATE TRIGGER ${this.getTriggerName(table_name, "_insert")}
            AFTER INSERT ON ${table_name_escaped}
            REFERENCING NEW TABLE AS new_table
            FOR EACH STATEMENT EXECUTE PROCEDURE ${func_name_escaped}();

            DROP TRIGGER IF EXISTS ${this.getTriggerName(table_name, "_update")} ON ${table_name_escaped};
            CREATE TRIGGER ${this.getTriggerName(table_name, "_update")}
            AFTER UPDATE ON ${table_name_escaped}
            REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
            FOR EACH STATEMENT EXECUTE PROCEDURE ${func_name_escaped}();

            DROP TRIGGER IF EXISTS ${this.getTriggerName(table_name, "_delete")} ON ${table_name_escaped};
            CREATE TRIGGER ${this.getTriggerName(table_name, "_delete")}
            AFTER DELETE ON ${table_name_escaped}
            REFERENCING OLD TABLE AS old_table
            FOR EACH STATEMENT EXECUTE PROCEDURE ${func_name_escaped}();

            COMMIT;
        `;
            // console.log(query)
            this.addTriggerPool = this.addTriggerPool || [];
            this.addTriggerPool.push({ table_name, condition });
            if (this.addingTrigger) {
                // console.log("waiting until add trigger finished", { table_name, condition });
                return 1;
            }
            this.addingTrigger = true;
            this.db.result(query).then(res => {
                this.addingTrigger = false;
                this.addTriggerPool = this.addTriggerPool.filter(t => t.table_name !== table_name || t.condition !== condition);
                if (this.addTriggerPool.length) {
                    this.addTrigger(this.addTriggerPool[0]);
                    // console.log("processing next trigger in queue");
                }
                this.triggers[table_name] = _condts;
                // console.log("added new trigger: ", { table_name, condition });
                return true;
            }).catch(err => {
                console.error(317, err, query);
                return Promise.reject(err);
            });
            return this.addingTrigger;
        });
    }
    /* info_level:
        0   -   min_id, max_id, count
        1   -   missing_ids
        */
    pushSyncInfo({ table_name, id_key = "id", info_level = 0 }) {
        return this.db.any(`            
            SELECT ${id_key}
            FROM generate_series(
                (SELECT MIN(msg_id) FROM ${table_name}) ,
                (SELECT MAX(msg_id) FROM ${table_name})
            ) ${id_key}
            WHERE NOT EXISTS (
                SELECT 1 
                FROM ${table_name} n
                WHERE n.msg_id = ${id_key}.${id_key}
            )
        `);
    }
}
exports.PubSubManager = PubSubManager;
PubSubManager.DELIMITER = '|$prstgls$|';
/* Get only the specified properties of an object */
function filterObj(obj, keys = [], exclude) {
    if (exclude)
        keys = Object.keys(obj).filter(k => !exclude.includes(k));
    if (!keys.length) {
        // console.warn("filterObj: returning empty object");
        return {};
    }
    if (obj && keys.length) {
        let res = {};
        keys.map(k => {
            res[k] = obj[k];
        });
        return res;
    }
    return obj;
}
exports.filterObj = filterObj;
//# sourceMappingURL=PubSubManager.js.map
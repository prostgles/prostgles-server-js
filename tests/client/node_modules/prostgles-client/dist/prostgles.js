"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prostgles = void 0;
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const prostgles_types_1 = require("prostgles-types");
const SyncedTable_1 = require("./SyncedTable");
function prostgles(initOpts, syncedTable) {
    const { socket, onReady, onDisconnect, onReconnect, onSchemaChange = true } = initOpts;
    SyncedTable_1.debug("prostgles", { initOpts });
    if (onSchemaChange) {
        let cb;
        if (typeof onSchemaChange === "function") {
            cb = onSchemaChange;
        }
        socket.removeAllListeners(prostgles_types_1.CHANNELS.SCHEMA_CHANGED);
        if (cb)
            socket.on(prostgles_types_1.CHANNELS.SCHEMA_CHANGED, cb);
    }
    const preffix = prostgles_types_1.CHANNELS._preffix;
    let subscriptions = {};
    // window["subscriptions"] = subscriptions;
    let syncedTables = {};
    let syncs = {};
    let notifSubs = {};
    const removeNotifListener = (listener, conf) => {
        if (notifSubs && notifSubs[conf.notifChannel]) {
            notifSubs[conf.notifChannel].listeners = notifSubs[conf.notifChannel].listeners.filter(nl => nl !== listener);
            if (!notifSubs[conf.notifChannel].listeners.length && notifSubs[conf.notifChannel].config && notifSubs[conf.notifChannel].config.socketUnsubChannel && socket) {
                socket.emit(notifSubs[conf.notifChannel].config.socketUnsubChannel, {});
                delete notifSubs[conf.notifChannel];
            }
        }
    };
    const addNotifListener = (listener, conf) => {
        notifSubs = notifSubs || {};
        if (!notifSubs[conf.notifChannel]) {
            notifSubs[conf.notifChannel] = {
                config: conf,
                listeners: [listener]
            };
            socket.removeAllListeners(conf.socketChannel);
            socket.on(conf.socketChannel, notif => {
                if (notifSubs[conf.notifChannel] && notifSubs[conf.notifChannel].listeners && notifSubs[conf.notifChannel].listeners.length) {
                    notifSubs[conf.notifChannel].listeners.map(l => {
                        l(notif);
                    });
                }
                else {
                    socket.emit(notifSubs[conf.notifChannel].config.socketUnsubChannel, {});
                }
            });
        }
        else {
            notifSubs[conf.notifChannel].listeners.push(listener);
        }
    };
    let noticeSubs;
    const removeNoticeListener = (listener) => {
        if (noticeSubs) {
            noticeSubs.listeners = noticeSubs.listeners.filter(nl => nl !== listener);
            if (!noticeSubs.listeners.length && noticeSubs.config && noticeSubs.config.socketUnsubChannel && socket) {
                socket.emit(noticeSubs.config.socketUnsubChannel, {});
            }
        }
    };
    const addNoticeListener = (listener, conf) => {
        noticeSubs = noticeSubs || {
            config: conf,
            listeners: []
        };
        if (!noticeSubs.listeners.length) {
            socket.removeAllListeners(conf.socketChannel);
            socket.on(conf.socketChannel, notice => {
                if (noticeSubs && noticeSubs.listeners && noticeSubs.listeners.length) {
                    noticeSubs.listeners.map(l => {
                        l(notice);
                    });
                }
                else {
                    socket.emit(conf.socketUnsubChannel, {});
                }
            });
        }
        noticeSubs.listeners.push(listener);
    };
    let connected = false;
    const destroySyncs = () => {
        SyncedTable_1.debug("destroySyncs", { subscriptions, syncedTables });
        Object.values(subscriptions).map(s => s.destroy());
        subscriptions = {};
        syncs = {};
        Object.values(syncedTables).map((s) => {
            if (s && s.destroy)
                s.destroy();
        });
        syncedTables = {};
    };
    function _unsubscribe(channelName, handler) {
        SyncedTable_1.debug("_unsubscribe", { channelName, handler });
        return new Promise((resolve, reject) => {
            if (subscriptions[channelName]) {
                subscriptions[channelName].handlers = subscriptions[channelName].handlers.filter(h => h !== handler);
                if (!subscriptions[channelName].handlers.length) {
                    socket.emit(channelName + "unsubscribe", {}, (err, res) => {
                        // console.log("unsubscribed", err, res);
                        if (err)
                            console.error(err);
                        // else resolve(res);
                    });
                    socket.removeListener(channelName, subscriptions[channelName].onCall);
                    delete subscriptions[channelName];
                    /* Not waiting for server confirmation to speed things up */
                    resolve(true);
                }
                else {
                    resolve(true);
                }
            }
            else {
                resolve(true);
            }
        });
    }
    function _unsync(channelName, triggers) {
        SyncedTable_1.debug("_unsync", { channelName, triggers });
        return new Promise((resolve, reject) => {
            if (syncs[channelName]) {
                syncs[channelName].triggers = syncs[channelName].triggers.filter(tr => (tr.onPullRequest !== triggers.onPullRequest &&
                    tr.onSyncRequest !== triggers.onSyncRequest &&
                    tr.onUpdates !== triggers.onUpdates));
                if (!syncs[channelName].triggers.length) {
                    socket.emit(channelName + "unsync", {}, (err, res) => {
                        if (err)
                            reject(err);
                        else
                            resolve(res);
                    });
                    socket.removeListener(channelName, syncs[channelName].onCall);
                    delete syncs[channelName];
                }
            }
        });
    }
    function addServerSync({ tableName, command, param1, param2 }, onSyncRequest) {
        return new Promise((resolve, reject) => {
            socket.emit(preffix, { tableName, command, param1, param2 }, (err, res) => {
                if (err) {
                    console.error(err);
                    reject(err);
                }
                else if (res) {
                    const { id_fields, synced_field, channelName } = res;
                    socket.emit(channelName, { onSyncRequest: onSyncRequest({}, res) }, (response) => {
                        console.log(response);
                    });
                    resolve({ id_fields, synced_field, channelName });
                }
            });
        });
    }
    function addServerSub({ tableName, command, param1, param2 }) {
        return new Promise((resolve, reject) => {
            socket.emit(preffix, { tableName, command, param1, param2 }, (err, res) => {
                if (err) {
                    console.error(err);
                    reject(err);
                }
                else if (res) {
                    resolve(res.channelName);
                }
            });
        });
    }
    async function addSync({ tableName, command, param1, param2 }, triggers) {
        const { onPullRequest, onSyncRequest, onUpdates } = triggers;
        function makeHandler(channelName, sync_info) {
            let unsync = function () {
                _unsync(channelName, triggers);
            };
            let syncData = function (data, deleted, cb) {
                socket.emit(channelName, {
                    onSyncRequest: {
                        ...onSyncRequest({}, sync_info),
                        ...({ data } || {}),
                        ...({ deleted } || {})
                    },
                }, !cb ? null : (response) => {
                    cb(response);
                });
            };
            return Object.freeze({ unsync, syncData });
        }
        const existingChannel = Object.keys(syncs).find(ch => {
            let s = syncs[ch];
            return (s.tableName === tableName &&
                s.command === command &&
                JSON.stringify(s.param1 || {}) === JSON.stringify(param1 || {}) &&
                JSON.stringify(s.param2 || {}) === JSON.stringify(param2 || {})
            // s.triggers.find(tr => (
            //     tr.onPullRequest === triggers.onPullRequest &&
            //     tr.onSyncRequest === triggers.onSyncRequest &&
            //     tr.onUpdates === triggers.onUpdates
            // ))
            );
        });
        if (existingChannel) {
            syncs[existingChannel].triggers.push(triggers);
            return makeHandler(existingChannel, syncs[existingChannel].syncInfo);
        }
        else {
            const sync_info = await addServerSync({ tableName, command, param1, param2 }, onSyncRequest);
            const { channelName, synced_field, id_fields } = sync_info;
            function onCall(data, cb) {
                /*
                    Client will:
                    1. Send last_synced     on(onSyncRequest)
                    2. Send data >= server_synced   on(onPullRequest)
                    3. Send data on CRUD    emit(data.data)
                    4. Upsert data.data     on(data.data)
                */
                if (!data)
                    return;
                if (!syncs[channelName])
                    return;
                syncs[channelName].triggers.map(({ onUpdates, onSyncRequest, onPullRequest }) => {
                    // onChange(data.data);
                    if (data.data) {
                        Promise.resolve(onUpdates(data, sync_info))
                            .then(() => {
                            if (cb)
                                cb({ ok: true });
                        })
                            .catch(err => {
                            if (cb) {
                                cb({ err });
                            }
                            else {
                                console.error(tableName + " onUpdates error", err);
                            }
                        });
                    }
                    else if (data.onSyncRequest) {
                        // cb(onSyncRequest());
                        Promise.resolve(onSyncRequest(data.onSyncRequest, sync_info))
                            .then(res => cb({ onSyncRequest: res }))
                            .catch(err => {
                            if (cb) {
                                cb({ err });
                            }
                            else {
                                console.error(tableName + " onSyncRequest error", err);
                            }
                        });
                    }
                    else if (data.onPullRequest) {
                        Promise.resolve(onPullRequest(data.onPullRequest, sync_info))
                            .then(arr => {
                            cb({ data: arr });
                        })
                            .catch(err => {
                            if (cb) {
                                cb({ err });
                            }
                            else {
                                console.error(tableName + " onPullRequest error", err);
                            }
                        });
                    }
                    else {
                        console.log("unexpected response");
                    }
                    /* Cache */
                    // window.localStorage.setItem(channelName, JSON.stringify(data))
                });
            }
            syncs[channelName] = {
                tableName,
                command,
                param1,
                param2,
                triggers: [triggers],
                syncInfo: sync_info,
                onCall
            };
            socket.on(channelName, onCall);
            return makeHandler(channelName, sync_info);
        }
    }
    async function addSub(dbo, { tableName, command, param1, param2 }, onChange, _onError) {
        function makeHandler(channelName) {
            let unsubscribe = function () {
                return _unsubscribe(channelName, onChange);
            };
            let res = { unsubscribe, filter: { ...param1 } };
            /* Some dbo sorting was done to make sure this will work */
            if (dbo[tableName].update) {
                res = {
                    ...res,
                    update: function (newData, updateParams) {
                        return dbo[tableName].update(param1, newData, updateParams);
                    }
                };
            }
            if (dbo[tableName].delete) {
                res = {
                    ...res,
                    delete: function (deleteParams) {
                        return dbo[tableName].delete(param1, deleteParams);
                    }
                };
            }
            return Object.freeze(res);
        }
        const existing = Object.keys(subscriptions).find(ch => {
            let s = subscriptions[ch];
            return (s.tableName === tableName &&
                s.command === command &&
                JSON.stringify(s.param1 || {}) === JSON.stringify(param1 || {}) &&
                JSON.stringify(s.param2 || {}) === JSON.stringify(param2 || {}));
        });
        if (existing) {
            subscriptions[existing].handlers.push(onChange);
            if (subscriptions[existing].handlers.includes(onChange)) {
                console.warn("Duplicate subscription handler was added for:", subscriptions[existing]);
            }
            return makeHandler(existing);
        }
        else {
            const channelName = await addServerSub({ tableName, command, param1, param2 });
            let onCall = function (data, cb) {
                /* TO DO: confirm receiving data or server will unsubscribe */
                // if(cb) cb(true);
                if (subscriptions[channelName]) {
                    if (data.data) {
                        subscriptions[channelName].handlers.map(h => {
                            h(data.data);
                        });
                    }
                    else if (data.err) {
                        subscriptions[channelName].errorHandlers.map(h => {
                            h(data.err);
                        });
                    }
                    else {
                        console.error("INTERNAL ERROR: Unexpected data format from subscription: ", data);
                    }
                }
                else {
                    console.warn("Orphaned subscription: ", channelName);
                }
            };
            let onError = _onError || function (err) { console.error(`Uncaught error within running subscription \n ${channelName}`, err); };
            socket.on(channelName, onCall);
            subscriptions[channelName] = {
                tableName,
                command,
                param1,
                param2,
                onCall,
                handlers: [onChange],
                errorHandlers: [onError],
                destroy: () => {
                    if (subscriptions[channelName]) {
                        Object.values(subscriptions[channelName]).map((s) => {
                            if (s && s.handlers)
                                s.handlers.map(h => _unsubscribe(channelName, h));
                        });
                        delete subscriptions[channelName];
                    }
                }
            };
            return makeHandler(channelName);
        }
    }
    return new Promise((resolve, reject) => {
        if (onDisconnect) {
            // socket.removeAllListeners("disconnect", onDisconnect)
            socket.on("disconnect", onDisconnect);
        }
        /* Schema = published schema */
        // socket.removeAllListeners(CHANNELS.SCHEMA)
        socket.on(prostgles_types_1.CHANNELS.SCHEMA, ({ schema, methods, fullSchema, auth, rawSQL, joinTables = [], err }) => {
            if (err) {
                reject(err);
                throw err;
            }
            destroySyncs();
            if (connected && onReconnect) {
                onReconnect(socket);
            }
            connected = true;
            let dbo = JSON.parse(JSON.stringify(schema));
            let _methods = JSON.parse(JSON.stringify(methods)), methodsObj = {}, _auth = {};
            if (auth) {
                _auth = { ...auth };
                [prostgles_types_1.CHANNELS.LOGIN, prostgles_types_1.CHANNELS.LOGOUT, prostgles_types_1.CHANNELS.REGISTER].map(funcName => {
                    if (auth[funcName]) {
                        _auth[funcName] = function (params) {
                            return new Promise((resolve, reject) => {
                                socket.emit(preffix + funcName, params, (err, res) => {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(res);
                                });
                            });
                        };
                    }
                });
            }
            _methods.map(method => {
                methodsObj[method] = function (...params) {
                    return new Promise((resolve, reject) => {
                        socket.emit(prostgles_types_1.CHANNELS.METHOD, { method, params }, (err, res) => {
                            if (err)
                                reject(err);
                            else
                                resolve(res);
                        });
                    });
                };
            });
            methodsObj = Object.freeze(methodsObj);
            if (rawSQL) {
                // dbo.schema = Object.freeze([ ...dbo.sql ]);
                dbo.sql = function (query, params, options) {
                    return new Promise((resolve, reject) => {
                        socket.emit(prostgles_types_1.CHANNELS.SQL, { query, params, options }, (err, res) => {
                            if (err)
                                reject(err);
                            else {
                                if (options &&
                                    options.returnType === "noticeSubscription" &&
                                    res &&
                                    Object.keys(res).sort().join() === ["socketChannel", "socketUnsubChannel"].sort().join() &&
                                    !Object.values(res).find(v => typeof v !== "string")) {
                                    const addListener = (listener) => {
                                        addNoticeListener(listener, res);
                                        return {
                                            ...res,
                                            removeListener: () => removeNoticeListener(listener)
                                        };
                                    };
                                    const handle = { addListener };
                                    resolve(handle);
                                }
                                else if ((!options || !options.returnType || options.returnType !== "statement") &&
                                    res &&
                                    Object.keys(res).sort().join() === ["socketChannel", "socketUnsubChannel", "notifChannel"].sort().join() &&
                                    !Object.values(res).find(v => typeof v !== "string")) {
                                    const addListener = (listener) => {
                                        addNotifListener(listener, res);
                                        return {
                                            ...res,
                                            removeListener: () => removeNotifListener(listener, res)
                                        };
                                    };
                                    const handle = { addListener };
                                    resolve(handle);
                                }
                                else {
                                    resolve(res);
                                }
                            }
                        });
                    });
                };
            }
            /* Building DBO object */
            const isPojo = (obj) => Object.prototype.toString.call(obj) === "[object Object]";
            const checkArgs = (basicFilter, options, onChange, onError) => {
                if (!isPojo(basicFilter) || !isPojo(options) || !(typeof onChange === "function") || onError && typeof onError !== "function") {
                    throw "Expecting: ( basicFilter<object>, options<object>, onChange<function> , onError?<function>) but got something else";
                }
            };
            const sub_commands = ["subscribe", "subscribeOne"];
            Object.keys(dbo).forEach(tableName => {
                const all_commands = Object.keys(dbo[tableName]);
                all_commands
                    .sort((a, b) => sub_commands.includes(a) - sub_commands.includes(b))
                    .forEach(command => {
                    if (["find", "findOne"].includes(command)) {
                        dbo[tableName].getJoinedTables = function () {
                            return (joinTables || [])
                                .filter(tb => Array.isArray(tb) && tb.includes(tableName))
                                .flat()
                                .filter(t => t !== tableName);
                        };
                    }
                    if (command === "sync") {
                        dbo[tableName]._syncInfo = { ...dbo[tableName][command] };
                        if (syncedTable) {
                            dbo[tableName].getSync = (filter, params = {}) => {
                                return syncedTable.create({ name: tableName, filter, db: dbo, ...params });
                            };
                            const upsertSTable = async (basicFilter = {}, options = {}, onError) => {
                                const syncName = `${tableName}.${JSON.stringify(basicFilter)}.${JSON.stringify(options)}`;
                                if (!syncedTables[syncName]) {
                                    syncedTables[syncName] = await syncedTable.create({ ...options, name: tableName, filter: basicFilter, db: dbo, onError });
                                }
                                return syncedTables[syncName];
                            };
                            dbo[tableName].sync = async (basicFilter, options = { handlesOnData: true, select: "*" }, onChange, onError) => {
                                checkArgs(basicFilter, options, onChange, onError);
                                const s = await upsertSTable(basicFilter, options, onError);
                                return await s.sync(onChange, options.handlesOnData);
                            };
                            dbo[tableName].syncOne = async (basicFilter, options = { handlesOnData: true }, onChange, onError) => {
                                checkArgs(basicFilter, options, onChange, onError);
                                const s = await upsertSTable(basicFilter, options, onError);
                                return await s.syncOne(basicFilter, onChange, options.handlesOnData);
                            };
                        }
                        dbo[tableName]._sync = function (param1, param2, syncHandles) {
                            return addSync({ tableName, command, param1, param2 }, syncHandles);
                        };
                    }
                    else if (sub_commands.includes(command)) {
                        dbo[tableName][command] = function (param1, param2, onChange, onError) {
                            checkArgs(param1, param2, onChange, onError);
                            return addSub(dbo, { tableName, command, param1, param2 }, onChange, onError);
                        };
                        const SUBONE = "subscribeOne";
                        if (command === SUBONE || !sub_commands.includes(SUBONE)) {
                            dbo[tableName][SUBONE] = function (param1, param2, onChange, onError) {
                                checkArgs(param1, param2, onChange, onError);
                                let onChangeOne = (rows) => { onChange(rows[0]); };
                                return addSub(dbo, { tableName, command, param1, param2 }, onChangeOne, onError);
                            };
                        }
                    }
                    else {
                        dbo[tableName][command] = function (param1, param2, param3) {
                            // if(Array.isArray(param2) || Array.isArray(param3)) throw "Expecting an object";
                            return new Promise((resolve, reject) => {
                                socket.emit(preffix, { tableName, command, param1, param2, param3 }, 
                                /* Get col definition and re-cast data types?! */
                                (err, res) => {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(res);
                                });
                            });
                        };
                    }
                });
            });
            // Re-attach listeners
            if (subscriptions && Object.keys(subscriptions).length) {
                Object.keys(subscriptions).map(async (ch) => {
                    try {
                        let s = subscriptions[ch];
                        await addServerSub(s);
                        socket.on(ch, s.onCall);
                    }
                    catch (err) {
                        console.error("There was an issue reconnecting old subscriptions", err);
                    }
                });
            }
            if (syncs && Object.keys(syncs).length) {
                Object.keys(syncs).filter(ch => {
                    return syncs[ch].triggers && syncs[ch].triggers.length;
                }).map(async (ch) => {
                    try {
                        let s = syncs[ch];
                        await addServerSync(s, s.triggers[0].onSyncRequest);
                        socket.on(ch, s.onCall);
                    }
                    catch (err) {
                        console.error("There was an issue reconnecting olf subscriptions", err);
                    }
                });
            }
            joinTables.flat().map(table => {
                dbo.innerJoin = dbo.innerJoin || {};
                dbo.leftJoin = dbo.leftJoin || {};
                dbo.innerJoinOne = dbo.innerJoinOne || {};
                dbo.leftJoinOne = dbo.leftJoinOne || {};
                dbo.leftJoin[table] = (filter, select, options = {}) => {
                    return makeJoin(true, filter, select, options);
                };
                dbo.innerJoin[table] = (filter, select, options = {}) => {
                    return makeJoin(false, filter, select, options);
                };
                dbo.leftJoinOne[table] = (filter, select, options = {}) => {
                    return makeJoin(true, filter, select, { ...options, limit: 1 });
                };
                dbo.innerJoinOne[table] = (filter, select, options = {}) => {
                    return makeJoin(false, filter, select, { ...options, limit: 1 });
                };
                function makeJoin(isLeft = true, filter, select, options) {
                    return {
                        [isLeft ? "$leftJoin" : "$innerJoin"]: table,
                        filter,
                        select,
                        ...options
                    };
                }
            });
            (async () => {
                try {
                    await onReady(dbo, methodsObj, fullSchema, _auth);
                }
                catch (err) {
                    console.error("Prostgles: Error within onReady: \n", err);
                    reject(err);
                }
                resolve(dbo);
            })();
        });
    });
}
exports.prostgles = prostgles;
;

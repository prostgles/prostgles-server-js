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
exports.isSuperUser = exports.PublishParser = exports.flat = exports.Prostgles = exports.JOIN_TYPES = void 0;
const promise = require("bluebird");
const pgPromise = require("pg-promise");
const pkgj = require('../package.json');
const version = pkgj.version;
const utils_1 = require("./utils");
const DboBuilder_1 = require("./DboBuilder");
const PubSubManager_1 = require("./PubSubManager");
const prostgles_types_1 = require("prostgles-types");
const DBEventsManager_1 = require("./DBEventsManager");
let currConnection;
function getDbConnection(dbConnection, options, debugQueries = false, noNewConnections = true, onNotice = null) {
    let pgp = pgPromise(Object.assign(Object.assign({ promiseLib: promise }, (debugQueries ? {
        query: function (e) {
            console.log({ psql: e.query, params: e.params });
        },
    } : {})), ((onNotice || debugQueries) ? {
        connect: function (client, dc, isFresh) {
            if (isFresh && !client.listeners('notice').length) {
                client.on('notice', function (msg) {
                    if (onNotice) {
                        onNotice(msg, utils_1.get(msg, "message"));
                    }
                    else {
                        console.log("notice: %j", utils_1.get(msg, "message"));
                    }
                });
            }
        },
    } : {})));
    pgp.pg.defaults.max = 70;
    // /* Casts count/sum/max to bigint. Needs rework to remove casting "+count" and other issues; */
    // pgp.pg.types.setTypeParser(20, BigInt);
    if (options) {
        Object.assign(pgp.pg.defaults, options);
    }
    if (!currConnection || !noNewConnections) {
        currConnection = {
            db: pgp(dbConnection),
            pgp
        };
    }
    return currConnection;
}
const QueryFile = require('pg-promise').QueryFile;
exports.JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"];
const DEFAULT_KEYWORDS = {
    $filter: "$filter",
    $and: "$and",
    $or: "$or",
    $not: "$not"
};
const fs = require('fs');
class Prostgles {
    constructor(params) {
        // o: ProstglesInitOptions;
        this.dbConnection = {
            host: "localhost",
            port: 5432,
            application_name: "prostgles_app"
        };
        this.schema = "public";
        this.wsChannelNamePrefix = "_psqlWS_";
        this.DEBUG_MODE = false;
        this.watchSchema = false;
        this.loaded = false;
        this.keywords = DEFAULT_KEYWORDS;
        this.connectedSockets = [];
        this.pushSocketSchema = (socket) => __awaiter(this, void 0, void 0, function* () {
            let auth = {};
            if (this.auth) {
                const { register, login, logout, sidQueryParamName } = this.auth;
                if (sidQueryParamName === "sid")
                    throw "sidQueryParamName cannot be 'sid' please provide another name.";
                let handlers = [
                    { func: register, ch: prostgles_types_1.CHANNELS.REGISTER, name: "register" },
                    { func: login, ch: prostgles_types_1.CHANNELS.LOGIN, name: "login" },
                    { func: logout, ch: prostgles_types_1.CHANNELS.LOGOUT, name: "logout" }
                ].filter(h => h.func);
                const usrData = yield this.getUserFromCookieSession(socket);
                if (usrData) {
                    auth.user = usrData.clientUser;
                    handlers = handlers.filter(h => h.name === "logout");
                }
                handlers.map(({ func, ch, name }) => {
                    auth[name] = true;
                    socket.removeAllListeners(ch);
                    socket.on(ch, (params, cb = (...callback) => { }) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            if (!socket)
                                throw "socket missing??!!";
                            const res = yield func(params, dbo, db, socket);
                            if (name === "login" && res && res.sid) {
                                /* TODO: Re-send schema to client */
                            }
                            cb(null, true);
                        }
                        catch (err) {
                            console.error(name + " err", err);
                            cb(err);
                        }
                    }));
                });
            }
            let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
            let DATA_TYPES = !needType ? [] : yield this.db.any("SELECT oid, typname FROM pg_type");
            let USER_TABLES = !needType ? [] : yield this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");
            let schema = {};
            let publishValidationError;
            let rawSQL = false;
            const { dbo, db, pgp, publishParser } = this;
            try {
                schema = yield publishParser.getSchemaFromPublish(socket);
                // console.log("getSchemaFromPublish", Object.keys(schema), this.dboBuilder.tablesOrViews.map(t => `${t.name} (${t.columns.map(c => c.name).join(", ")})`))
            }
            catch (e) {
                publishValidationError = "Server Error: PUBLISH VALIDATION ERROR";
                console.error(`\nProstgles PUBLISH VALIDATION ERROR (after socket connected):\n    ->`, e);
            }
            socket.prostgles = socket.prostgles || {};
            socket.prostgles.schema = schema;
            /*  RUN Raw sql from client IF PUBLISHED
            */
            let fullSchema = [];
            let allTablesViews = this.dboBuilder.tablesOrViews;
            if (this.publishRawSQL && typeof this.publishRawSQL === "function") {
                const canRunSQL = () => __awaiter(this, void 0, void 0, function* () {
                    let res = yield this.publishRawSQL(socket, dbo, db, yield this.getUser(socket));
                    return Boolean(res && typeof res === "boolean" || res === "*");
                });
                // console.log("canRunSQL", canRunSQL, socket.handshake.headers["x-real-ip"]);//, allTablesViews);
                if (yield canRunSQL()) {
                    socket.removeAllListeners(prostgles_types_1.CHANNELS.SQL);
                    socket.on(prostgles_types_1.CHANNELS.SQL, ({ query, params, options }, cb = (...callback) => { }) => __awaiter(this, void 0, void 0, function* () {
                        if (!(yield canRunSQL())) {
                            cb("Dissallowed", null);
                            return;
                        }
                        const { returnType } = options || {};
                        if (returnType === "noticeSubscription") {
                            const sub = this.dbEventsManager.addNotice(socket);
                            socket.on(sub.socketChannel + "unsubscribe", () => {
                                this.dbEventsManager.removeNotice(socket);
                            });
                            cb(null, {
                                socketChannel: sub.socketChannel,
                                socketUnsubChannel: sub.socketUnsubChannel,
                            });
                        }
                        else if (returnType === "statement") {
                            try {
                                cb(null, pgp.as.format(query, params));
                            }
                            catch (err) {
                                cb(err.toString());
                            }
                        }
                        else if (db) {
                            db.result(query, params)
                                .then((qres) => __awaiter(this, void 0, void 0, function* () {
                                const { duration, fields, rows, command } = qres;
                                if (command === "LISTEN") {
                                    const sub = yield this.dbEventsManager.addNotify(query, socket);
                                    socket.on(sub.socketChannel + "unsubscribe", () => {
                                        this.dbEventsManager.removeNotify(sub.notifChannel, socket);
                                    });
                                    cb(null, {
                                        socketChannel: sub.socketChannel,
                                        socketUnsubChannel: sub.socketUnsubChannel,
                                        notifChannel: sub.notifChannel,
                                    });
                                }
                                else if (returnType === "rows") {
                                    cb(null, rows);
                                }
                                else {
                                    if (fields && DATA_TYPES.length) {
                                        qres.fields = fields.map(f => {
                                            const dataType = DATA_TYPES.find(dt => +dt.oid === +f.dataTypeID), tableName = USER_TABLES.find(t => +t.relid === +f.tableID), { name } = f;
                                            return Object.assign(Object.assign(Object.assign({}, f), (dataType ? { dataType: dataType.typname } : {})), (tableName ? { tableName: tableName.relname } : {}));
                                        });
                                    }
                                    cb(null, qres);
                                }
                            }))
                                .catch(err => {
                                makeSocketError(cb, err);
                                // Promise.reject(err.toString());
                            });
                        }
                        else
                            console.error("db missing");
                    }));
                    if (db) {
                        // let allTablesViews = await db.any(STEP2_GET_ALL_TABLES_AND_COLUMNS);
                        fullSchema = allTablesViews;
                        rawSQL = true;
                    }
                    else
                        console.error("db missing");
                }
            }
            const methods = yield publishParser.getMethods(socket);
            // let joinTables = [];
            let joinTables2 = [];
            if (this.joins) {
                // joinTables = Array.from(new Set(flat(this.dboBuilder.getJoins().map(j => j.tables)).filter(t => schema[t])));
                let _joinTables2 = this.dboBuilder.getJoinPaths()
                    .filter(jp => ![jp.t1, jp.t2].find(t => !schema[t] || !schema[t].findOne)).map(jp => [jp.t1, jp.t2].sort());
                _joinTables2.map(jt => {
                    if (!joinTables2.find(_jt => _jt.join() === jt.join())) {
                        joinTables2.push(jt);
                    }
                });
            }
            socket.emit(prostgles_types_1.CHANNELS.SCHEMA, Object.assign(Object.assign({ schema, methods: Object.keys(methods) }, (fullSchema ? { fullSchema } : {})), { rawSQL, joinTables: joinTables2, auth,
                version, err: publishValidationError }));
        });
        if (!params)
            throw "ProstglesInitOptions missing";
        if (!params.io)
            console.warn("io missing. WebSockets will not be set up");
        // TODO: find an exact keyof T<->arr TS matching method
        let config = [
            "transactions", "joins", "tsGeneratedTypesDir",
            "onReady", "dbConnection", "dbOptions", "publishMethods", "io",
            "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect",
            "onSocketDisconnect", "sqlFilePath", "auth", "DEBUG_MODE", "watchSchema"
        ];
        const unknownParams = Object.keys(params).filter((key) => !config.includes(key));
        if (unknownParams.length) {
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        Object.assign(this, params);
        this.keywords = Object.assign(Object.assign({}, DEFAULT_KEYWORDS), params.keywords);
    }
    onSchemaChange(event) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.watchSchema && this.loaded) {
                console.log("Schema changed");
                if (typeof this.watchSchema === "function") {
                    /* Only call the provided func */
                    this.watchSchema(event);
                }
                else if (this.watchSchema === "hotReloadMode") {
                    if (this.tsGeneratedTypesDir) {
                        /* Hot reload integration. Will only touch tsGeneratedTypesDir */
                        console.log("watchSchema: Re-writing TS schema");
                        yield this.refreshDBO();
                        this.writeDBSchema(true);
                    }
                }
                else if (this.watchSchema === true) {
                    /* Full re-init. Sockets must reconnect */
                    console.log("watchSchema: Full re-initialisation");
                    this.init(this.onReady);
                }
            }
        });
    }
    checkDb() {
        if (!this.db || !this.db.connect)
            throw "something went wrong getting a db connection";
    }
    getTSFileName() {
        const fileName = "DBoGenerated.d.ts"; //`dbo_${this.schema}_types.ts`;
        const fullPath = (this.tsGeneratedTypesDir || "") + fileName;
        return { fileName, fullPath };
    }
    getFileText(fullPath, format = "utf8") {
        return new Promise((resolve, reject) => {
            fs.readFile(fullPath, 'utf8', function (err, data) {
                if (err)
                    reject(err);
                else
                    resolve(data);
            });
        });
    }
    writeDBSchema(force = false) {
        if (this.tsGeneratedTypesDir) {
            const { fullPath, fileName } = this.getTSFileName();
            const header = `/* This file was generated by Prostgles \n` +
                // `* ${(new Date).toUTCString()} \n` 
                `*/ \n\n `;
            const fileContent = header + this.dboBuilder.tsTypesDefinition;
            fs.readFile(fullPath, 'utf8', function (err, data) {
                if (err || (force || data !== fileContent)) {
                    fs.writeFileSync(fullPath, fileContent);
                    console.log("Prostgles: Created typescript schema definition file: \n " + fileName);
                }
            });
        }
        else {
            console.error("Schema changed. tsGeneratedTypesDir needs to be set to reload server");
        }
    }
    refreshDBO() {
        return __awaiter(this, void 0, void 0, function* () {
            this.dboBuilder = yield DboBuilder_1.DboBuilder.create(this);
            this.dbo = this.dboBuilder.dbo;
        });
    }
    init(onReady) {
        return __awaiter(this, void 0, void 0, function* () {
            this.loaded = false;
            if (this.watchSchema === "hotReloadMode" && !this.tsGeneratedTypesDir)
                throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
            /* 1. Connect to db */
            const { db, pgp } = getDbConnection(this.dbConnection, this.dbOptions, this.DEBUG_MODE, true, notice => {
                if (this.onNotice)
                    this.onNotice(notice);
                if (this.dbEventsManager) {
                    this.dbEventsManager.onNotice(notice);
                }
            });
            this.db = db;
            this.pgp = pgp;
            this.checkDb();
            /* 2. Execute any SQL file if provided */
            if (this.sqlFilePath) {
                yield this.runSQLFile(this.sqlFilePath);
            }
            try {
                /* 3. Make DBO object from all tables and views */
                yield this.refreshDBO();
                this.writeDBSchema();
                if (this.publish) {
                    /* 3.9 Check auth config */
                    if (this.auth) {
                        const { sidCookieName, login, getUser, getClientUser } = this.auth;
                        if (typeof sidCookieName !== "string" && !login) {
                            throw "Invalid auth: Provide { sidCookieName: string } OR  { login: Function } ";
                        }
                        if (!getUser || !getClientUser)
                            throw "getUser OR getClientUser missing from auth config";
                    }
                    this.publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db, this);
                    this.dboBuilder.publishParser = this.publishParser;
                    /* 4. Set publish and auth listeners */ //makeDBO(db, allTablesViews, pubSubManager, false)
                    yield this.setSocketEvents();
                }
                else if (this.auth)
                    throw "Auth config does not work without publish";
                if (this.watchSchema) {
                    if (!(yield isSuperUser(db)))
                        throw "Cannot watchSchema without a super user schema. Set watchSchema=false or provide a super user";
                }
                this.dbEventsManager = new DBEventsManager_1.DBEventsManager(db, pgp);
                /* 5. Finish init and provide DBO object */
                try {
                    onReady(this.dbo, this.db);
                }
                catch (err) {
                    console.error("Prostgles: Error within onReady: \n", err);
                }
                this.loaded = true;
                return true;
            }
            catch (e) {
                console.trace(e);
                throw "init issues: " + e.toString();
            }
        });
    }
    runSQLFile(filePath) {
        return __awaiter(this, void 0, void 0, function* () {
            const fileContent = yield this.getFileText(filePath); //.then(console.log);
            return this.db.multi(fileContent).then((data) => {
                console.log("Prostgles: SQL file executed successfuly \n    -> " + filePath);
                return true;
            }).catch((err) => {
                console.log(filePath + "    file error: ", err);
            });
        });
    }
    getSID(socket) {
        if (!this.auth)
            return null;
        const { sidCookieName, sidQueryParamName } = this.auth;
        if (!sidCookieName && !sidQueryParamName)
            return null;
        let result = {
            sidCookie: null,
            sidQuery: null,
            sid: null
        };
        if (sidQueryParamName) {
            result.sidQuery = utils_1.get(socket, `handshake.query.${sidQueryParamName}`);
        }
        if (sidCookieName) {
            const cookie_str = utils_1.get(socket, "handshake.headers.cookie");
            const cookie = parseCookieStr(cookie_str);
            if (socket && cookie) {
                result.sidCookie = cookie[sidCookieName];
            }
        }
        function parseCookieStr(cookie_str) {
            if (!cookie_str || typeof cookie_str !== "string")
                return {};
            return cookie_str.replace(/\s/g, '').split(";").reduce((prev, current) => {
                const [name, value] = current.split('=');
                prev[name] = value;
                return prev;
            }, {});
        }
        result.sid = result.sidQuery || result.sidCookie;
        return result;
    }
    getUser(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.auth) {
                const { getUser } = this.auth;
                if (getUser) {
                    const params = this.getSID(socket);
                    return yield getUser(params, this.dbo, this.db, socket);
                }
            }
            return null;
        });
    }
    getUserFromCookieSession(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("conn", socket.handshake.query, socket._session)
            const params = this.getSID(socket);
            const { getUser, getClientUser } = this.auth;
            const user = yield getUser(params, this.dbo, this.db, socket);
            const clientUser = yield getClientUser(params, this.dbo, this.db, socket);
            if (!user)
                return undefined;
            return { user, clientUser };
        });
    }
    setSocketEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkDb();
            if (!this.dbo)
                throw "dbo missing";
            let publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db, this);
            this.publishParser = publishParser;
            if (!this.io)
                return;
            /* Already initialised. Only reconnect sockets */
            if (this.connectedSockets.length) {
                this.connectedSockets.forEach((s) => {
                    s.emit(prostgles_types_1.CHANNELS.SCHEMA_CHANGED);
                    this.pushSocketSchema(s);
                });
                return;
            }
            /* Initialise */
            this.io.on('connection', (socket) => __awaiter(this, void 0, void 0, function* () {
                this.connectedSockets.push(socket);
                if (!this.db || !this.dbo)
                    throw "db/dbo missing";
                let { dbo, db, pgp } = this;
                try {
                    if (this.onSocketConnect)
                        yield this.onSocketConnect(socket, dbo, db);
                    /*  RUN Client request from Publish.
                        Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy
                    */
                    socket.removeAllListeners(prostgles_types_1.CHANNELS.DEFAULT);
                    socket.on(prostgles_types_1.CHANNELS.DEFAULT, ({ tableName, command, param1, param2, param3 }, cb = (...callback) => { }) => __awaiter(this, void 0, void 0, function* () {
                        try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                            if (!socket) {
                                console.error("socket missing??!!");
                                throw "socket missing??!!";
                            }
                            const user = yield this.getUser(socket);
                            let valid_table_command_rules = yield this.publishParser.getValidatedRequestRule({ tableName, command, socket }, user);
                            if (valid_table_command_rules) {
                                let res = yield this.dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true });
                                cb(null, res);
                            }
                            else
                                throw `Invalid OR disallowed request: ${tableName}.${command} `;
                        }
                        catch (err) {
                            // const _err_msg = err.toString();
                            // cb({ msg: _err_msg, err });
                            console.trace(err);
                            cb(err);
                            // console.warn("runPublishedRequest ERROR: ", err, socket._user);
                        }
                    }));
                    socket.on("disconnect", () => {
                        this.dbEventsManager.removeNotice(socket);
                        this.dbEventsManager.removeNotify(socket);
                        this.connectedSockets = this.connectedSockets.filter(s => s.id !== socket.id);
                        // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                        if (this.onSocketDisconnect) {
                            this.onSocketDisconnect(socket, dbo);
                        }
                        ;
                    });
                    socket.removeAllListeners(prostgles_types_1.CHANNELS.METHOD);
                    socket.on(prostgles_types_1.CHANNELS.METHOD, ({ method, params }, cb = (...callback) => { }) => __awaiter(this, void 0, void 0, function* () {
                        try {
                            const methods = yield this.publishParser.getMethods(socket);
                            if (!methods || !methods[method]) {
                                cb("Invalid method");
                            }
                            else {
                                try {
                                    const res = yield methods[method](...params);
                                    cb(null, res);
                                }
                                catch (err) {
                                    makeSocketError(cb, err);
                                }
                            }
                        }
                        catch (err) {
                            makeSocketError(cb, err);
                            console.warn("method ERROR: ", err, socket._user);
                        }
                    }));
                    this.pushSocketSchema(socket);
                }
                catch (e) {
                    console.trace("setSocketEvents: ", e);
                }
            }));
        });
    }
}
exports.Prostgles = Prostgles;
function makeSocketError(cb, err) {
    const err_msg = err.toString(), e = { err_msg, err };
    cb(e);
}
// const insertParams: Array<keyof InsertRule> = ["fields", "forcedData", "returningFields", "validate"];
const RULE_TO_METHODS = [
    {
        rule: "insert",
        methods: ["insert", "upsert"],
        no_limits: { fields: "*" },
        table_only: true,
        allowed_params: ["fields", "forcedData", "returningFields", "validate", "preValidate"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "update",
        methods: ["update", "upsert", "updateBatch"],
        no_limits: { fields: "*", filterFields: "*", returningFields: "*" },
        table_only: true,
        allowed_params: ["fields", "filterFields", "forcedFilter", "forcedData", "returningFields", "validate"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "select",
        methods: ["findOne", "find", "count", "getColumns", "getInfo"],
        no_limits: { fields: "*", filterFields: "*" },
        allowed_params: ["fields", "filterFields", "forcedFilter", "validate", "maxLimit"],
        hint: ` expecting "*" | true | { fields: ( string | string[] | {} )  }`
    },
    {
        rule: "delete",
        methods: ["delete", "remove"],
        no_limits: { filterFields: "*" },
        table_only: true,
        allowed_params: ["filterFields", "forcedFilter", "returningFields", "validate"],
        hint: ` expecting "*" | true | { filterFields: ( string | string[] | {} ) } \n Will use "select", "update", "delete" and "insert" rules`
    },
    {
        rule: "sync", methods: ["sync", "unsync"],
        no_limits: null,
        table_only: true,
        allowed_params: ["id_fields", "synced_field", "sync_type", "allow_delete", "throttle", "batch_size"],
        hint: ` expecting "*" | true | { id_fields: string[], synced_field: string }`
    },
    {
        rule: "subscribe", methods: ["unsubscribe", "subscribe", "subscribeOne"],
        no_limits: { throttle: 0 },
        table_only: true,
        allowed_params: ["throttle"],
        hint: ` expecting "*" | true | { throttle: number } \n Will use "select" rules`
    }
];
// const ALL_PUBLISH_METHODS = ["update", "upsert", "delete", "insert", "find", "findOne", "subscribe", "unsubscribe", "sync", "unsync", "remove"];
// const ALL_PUBLISH_METHODS = RULE_TO_METHODS.map(r => r.methods).flat();
function flat(arr) {
    // let res = arr.reduce((acc, val) => [ ...acc, ...val ], []);
    let res = arr.reduce(function (farr, toFlatten) {
        return farr.concat(Array.isArray(toFlatten) ? flat(toFlatten) : toFlatten);
    }, []);
    // console.log(arr, res)
    return res;
}
exports.flat = flat;
class PublishParser {
    constructor(publish, publishMethods, publishRawSQL, dbo, db, prostgles) {
        this.publish = publish;
        this.publishMethods = publishMethods;
        this.publishRawSQL = publishRawSQL;
        this.dbo = dbo;
        this.db = db;
        this.prostgles = prostgles;
        if (!this.dbo || !this.publish)
            throw "INTERNAL ERROR: dbo and/or publish missing";
    }
    getMethods(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            let methods = {};
            const user = yield this.prostgles.getUser(socket);
            const _methods = yield applyParamsIfFunc(this.publishMethods, socket, this.dbo, this.db, user);
            if (_methods && Object.keys(_methods).length) {
                Object.keys(_methods).map(key => {
                    if (_methods[key] && (typeof _methods[key] === "function" || typeof _methods[key].then === "function")) {
                        methods[key] = _methods[key];
                    }
                    else {
                        throw `invalid publishMethods item -> ${key} \n Expecting a function or promise`;
                    }
                });
            }
            return methods;
        });
    }
    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket
     * @param user
     */
    getPublish(socket, user) {
        return __awaiter(this, void 0, void 0, function* () {
            let _publish = yield applyParamsIfFunc(this.publish, socket, this.dbo, this.db, user);
            if (_publish === "*") {
                let publish = {};
                this.prostgles.dboBuilder.tablesOrViews.map(tov => {
                    publish[tov.name] = "*";
                });
                return publish;
            }
            return _publish;
        });
    }
    getValidatedRequestRuleWusr({ tableName, command, socket }) {
        return __awaiter(this, void 0, void 0, function* () {
            const user = yield this.prostgles.getUser(socket);
            return yield this.getValidatedRequestRule({ tableName, command, socket }, user);
        });
    }
    getValidatedRequestRule({ tableName, command, socket }, user) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.dbo)
                throw "INTERNAL ERROR: dbo is missing";
            if (!command || !tableName)
                throw "command OR tableName are missing";
            let rtm = RULE_TO_METHODS.find(rtms => rtms.methods.includes(command));
            if (!rtm) {
                throw "Invalid command: " + command;
            }
            /* Must be local request -> allow everything */
            if (!socket)
                return undefined;
            /* Must be from socket. Must have a publish */
            if (!this.publish)
                throw "publish is missing";
            /* Get any publish errors for socket */
            const schm = utils_1.get(socket, `prostgles.schema.${tableName}.${command}`);
            // console.log(schm, get(socket, `prostgles.schema`));
            if (schm && schm.err)
                throw schm.err;
            let table_rule = yield this.getTableRules({ tableName, socket }, user);
            if (!table_rule)
                throw "Invalid or disallowed table: " + tableName;
            if (command === "upsert") {
                if (!table_rule.update || !table_rule.insert) {
                    throw `Invalid or disallowed command: upsert`;
                }
            }
            if (rtm && table_rule && table_rule[rtm.rule]) {
                return table_rule;
            }
            else
                throw `Invalid or disallowed command: ${command}`;
        });
    }
    getTableRules({ tableName, socket }, user) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!socket || !tableName)
                    throw "publish OR socket OR dbo OR tableName are missing";
                let _publish = yield this.getPublish(socket, user);
                let table_rules = applyParamsIfFunc(_publish[tableName], socket, this.dbo, this.db, user);
                /* Get view or table specific rules */
                const is_view = this.dbo[tableName].is_view, MY_RULES = RULE_TO_METHODS.filter(r => !is_view || !r.table_only);
                // if(tableName === "various") console.warn(1033, MY_RULES)
                if (table_rules) {
                    /* All methods allowed. Add no limits for table rules */
                    if ([true, "*"].includes(table_rules)) {
                        table_rules = {};
                        MY_RULES.map(r => {
                            table_rules[r.rule] = Object.assign({}, r.no_limits);
                        });
                        // if(tableName === "various") console.warn(1042, table_rules)
                    }
                    /* Add implied methods if not falsy */
                    MY_RULES.map(r => {
                        if ([true, "*"].includes(table_rules[r.rule]) && r.no_limits) {
                            table_rules[r.rule] = Object.assign({}, r.no_limits);
                        }
                        if (table_rules[r.rule]) {
                            r.methods.map(method => {
                                if (table_rules[method] === undefined) {
                                    if (method === "updateBatch" && !table_rules.update) {
                                    }
                                    else if (method === "upsert" && (!table_rules.update || !table_rules.insert)) {
                                        // return;
                                    }
                                    else {
                                        table_rules[method] = {};
                                    }
                                }
                            });
                        }
                        // if(tableName === "v_various") console.warn(table_rules, r)
                    });
                    /*
                        Add defaults
                        Check for invalid params
                    */
                    if (Object.keys(table_rules).length) {
                        const ruleKeys = Object.keys(table_rules);
                        ruleKeys.filter(m => table_rules[m])
                            .find(method => {
                            let rm = MY_RULES.find(r => r.rule === method || r.methods.includes(method));
                            if (!rm) {
                                throw `Invalid rule in publish.${tableName} -> ${method} \nExpecting any of: ${flat(MY_RULES.map(r => [r.rule, ...r.methods])).join(", ")}`;
                            }
                            /* Check RULES for invalid params */
                            /* Methods do not have params -> They use them from rules */
                            if (method === rm.rule) {
                                let method_params = Object.keys(table_rules[method]);
                                let iparam = method_params.find(p => !rm.allowed_params.includes(p));
                                if (iparam) {
                                    throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${rm.allowed_params.join(", ")}`;
                                }
                            }
                            /* Add default params (if missing) */
                            if (method === "sync") {
                                if ([true, "*"].includes(table_rules[method])) {
                                    throw "Invalid sync rule. Expecting { id_fields: string[], synced_field: string } ";
                                }
                                if (typeof utils_1.get(table_rules, [method, "throttle"]) !== "number") {
                                    table_rules[method].throttle = 100;
                                }
                                if (typeof utils_1.get(table_rules, [method, "batch_size"]) !== "number") {
                                    table_rules[method].batch_size = PubSubManager_1.DEFAULT_SYNC_BATCH_SIZE;
                                }
                            }
                            /* Enable subscribe if not explicitly disabled */
                            if (method === "select" && !ruleKeys.includes("subscribe")) {
                                const sr = MY_RULES.find(r => r.rule === "subscribe");
                                if (sr) {
                                    table_rules[sr.rule] = Object.assign({}, sr.no_limits);
                                }
                            }
                        });
                    }
                }
                return table_rules;
            }
            catch (e) {
                throw e;
            }
        });
    }
    /* Prepares schema for client. Only allowed views and commands will be present */
    getSchemaFromPublish(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            let schema = {};
            try {
                /* Publish tables and views based on socket */
                const user = yield this.prostgles.getUser(socket);
                let _publish = yield this.getPublish(socket, user);
                if (_publish && Object.keys(_publish).length) {
                    let txKey = "tx";
                    if (!this.prostgles.transactions)
                        txKey = "";
                    if (typeof this.prostgles.transactions === "string")
                        txKey = this.prostgles.transactions;
                    const tableNames = Object.keys(_publish).filter(k => !txKey || txKey !== k);
                    yield Promise.all(tableNames
                        .map((tableName) => __awaiter(this, void 0, void 0, function* () {
                        if (!this.dbo[tableName]) {
                            throw `Table ${tableName} does not exist
                            Expecting one of: ${this.prostgles.dboBuilder.tablesOrViews.map(tov => tov.name).join(", ")}
                            DBO tables: ${Object.keys(this.dbo).filter(k => this.dbo[k].find).join(", ")}
                            `;
                        }
                        const table_rules = yield this.getTableRules({ socket, tableName }, user);
                        if (table_rules && Object.keys(table_rules).length) {
                            schema[tableName] = {};
                            let methods = [];
                            if (typeof table_rules === "object") {
                                methods = Object.keys(table_rules);
                            }
                            yield Promise.all(methods.filter(m => m !== "select").map((method) => __awaiter(this, void 0, void 0, function* () {
                                if (method === "sync" && table_rules[method]) {
                                    /* Pass sync info */
                                    schema[tableName][method] = table_rules[method];
                                }
                                else {
                                    schema[tableName][method] = {};
                                    /* Test for issues with the publish rules */
                                    if (["update", "find", "findOne", "insert", "delete", "upsert"].includes(method)) {
                                        let err = null;
                                        try {
                                            let valid_table_command_rules = yield this.getValidatedRequestRule({ tableName, command: method, socket }, user);
                                            yield this.dbo[tableName][method]({}, {}, {}, valid_table_command_rules, { socket, has_rules: true, testRule: true });
                                        }
                                        catch (e) {
                                            err = "INTERNAL PUBLISH ERROR";
                                            schema[tableName][method] = { err };
                                            throw `publish.${tableName}.${method}: \n   -> ${e}`;
                                        }
                                    }
                                }
                            })));
                        }
                        return true;
                    })));
                }
            }
            catch (e) {
                console.error("Prostgles \nERRORS IN PUBLISH: ", JSON.stringify(e));
                throw e;
            }
            // console.log(schema)
            return schema;
        });
    }
}
exports.PublishParser = PublishParser;
function applyParamsIfFunc(maybeFunc, ...params) {
    if ((maybeFunc !== null && maybeFunc !== undefined) &&
        (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")) {
        return maybeFunc(...params);
    }
    return maybeFunc;
}
function isSuperUser(db) {
    return __awaiter(this, void 0, void 0, function* () {
        return db.oneOrNone("select usesuper from pg_user where usename = CURRENT_USER;").then(r => r.usesuper);
    });
}
exports.isSuperUser = isSuperUser;
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=Prostgles.js.map
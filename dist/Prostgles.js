"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperUser = exports.PublishParser = exports.flat = exports.Prostgles = exports.JOIN_TYPES = void 0;
const promise = require("bluebird");
const pgPromise = require("pg-promise");
const FileManager_1 = require("./FileManager");
const pkgj = require('../package.json');
const version = pkgj.version;
const AuthHandler_1 = require("./AuthHandler");
console.log("Add a basic auth mode where user and sessions table are created");
const TableConfig_1 = require("./TableConfig");
const utils_1 = require("./utils");
const DboBuilder_1 = require("./DboBuilder");
const PubSubManager_1 = require("./PubSubManager");
const prostgles_types_1 = require("prostgles-types");
const DBEventsManager_1 = require("./DBEventsManager");
let currConnection;
function getDbConnection(dbConnection, options, debugQueries = false, onNotice) {
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
    return {
        db: pgp(dbConnection),
        pgp
    };
}
exports.JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"];
const DEFAULT_KEYWORDS = {
    $filter: "$filter",
    $and: "$and",
    $or: "$or",
    $not: "$not"
};
const fs = require("fs");
class Prostgles {
    constructor(params) {
        var _a, _b, _c;
        this.opts = {
            DEBUG_MODE: false,
            dbConnection: {
                host: "localhost",
                port: 5432,
                application_name: "prostgles_app"
            },
            onReady: () => { },
            schema: "public",
            watchSchema: false,
        };
        this.keywords = DEFAULT_KEYWORDS;
        this.loaded = false;
        this.destroyed = false;
        this.refreshDBO = async () => {
            if (this._dboBuilder)
                this._dboBuilder.destroy();
            this.dboBuilder = await DboBuilder_1.DboBuilder.create(this);
            if (!this.dboBuilder)
                throw "this.dboBuilder";
            this.dbo = this.dboBuilder.dbo;
            return this.dbo;
        };
        this.connectedSockets = [];
        this.pushSocketSchema = async (socket) => {
            var _a;
            let auth = await ((_a = this.authHandler) === null || _a === void 0 ? void 0 : _a.makeSocketAuth(socket)) || {};
            // let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
            // let DATA_TYPES = !needType? [] : await this.db.any("SELECT oid, typname FROM pg_type");
            // let USER_TABLES = !needType? [] :  await this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");
            let schema = {};
            let publishValidationError;
            let rawSQL = false;
            const { dbo, db, pgp, publishParser } = this;
            try {
                schema = await publishParser.getSchemaFromPublish(socket);
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
            if (this.opts.publishRawSQL && typeof this.opts.publishRawSQL === "function") {
                const canRunSQL = async () => {
                    const publishParams = await this.publishParser.getPublishParams({ socket });
                    let res = await this.opts.publishRawSQL(publishParams);
                    return Boolean(res && typeof res === "boolean" || res === "*");
                };
                if (await canRunSQL()) {
                    socket.removeAllListeners(prostgles_types_1.CHANNELS.SQL);
                    socket.on(prostgles_types_1.CHANNELS.SQL, async ({ query, params, options }, cb = (...callback) => { }) => {
                        if (!this.dbo.sql)
                            throw "Internal error: sql handler missing";
                        this.dbo.sql(query, params, options, { socket }).then(res => {
                            cb(null, res);
                        }).catch(err => {
                            makeSocketError(cb, err);
                        });
                        // if(!(await canRunSQL())) {
                        //     cb("Dissallowed", null);
                        //     return;
                        // }
                        // const { returnType }: SQLOptions = options || ({} as any);
                        // if(returnType === "noticeSubscription"){
                        //     const sub = await this.dbEventsManager.addNotice(socket);
                        //     cb(null, sub);
                        // } else if(returnType === "statement"){
                        //     try {
                        //         cb(null, pgp.as.format(query, params));
                        //     } catch (err){
                        //         cb(err.toString());
                        //     }
                        // } else if(db) {
                        //     db.result(query, params)
                        //         .then(async (qres: any) => {
                        //             const { duration, fields, rows, command } = qres;
                        //             if(command === "LISTEN"){
                        //                 const sub = await this.dbEventsManager.addNotify(query, socket);
                        //                 cb(null, sub);
                        //             } else if(returnType === "rows") {
                        //                 cb(null, rows);
                        //             } else if(returnType === "row") {
                        //                 cb(null, rows[0]);
                        //             } else if(returnType === "value") {
                        //                 cb(null, Object.values(rows[0])[0]);
                        //             } else if(returnType === "values") {
                        //                 cb(null, rows.map(r => Object.values(r[0])));
                        //             } else {
                        //                 if(fields && DATA_TYPES.length){
                        //                     qres.fields = fields.map(f => {
                        //                         const dataType = DATA_TYPES.find(dt => +dt.oid === +f.dataTypeID),
                        //                             tableName = USER_TABLES.find(t => +t.relid === +f.tableID);
                        //                         return {
                        //                             ...f,
                        //                             ...(dataType? { dataType: dataType.typname } : {}),
                        //                             ...(tableName? { tableName: tableName.relname } : {}),
                        //                         }
                        //                     });
                        //                 }
                        //                 cb(null, qres)
                        //             }
                        //         })
                        //         .catch(err => { 
                        //             makeSocketError(cb, err);
                        //             // Promise.reject(err.toString());
                        //         });
                        // } else console.error("db missing");
                    });
                    if (db) {
                        // let allTablesViews = await db.any(STEP2_GET_ALL_TABLES_AND_COLUMNS);
                        fullSchema = allTablesViews;
                        rawSQL = true;
                    }
                    else
                        console.error("db missing");
                }
            }
            // let joinTables = [];
            let joinTables2 = [];
            if (this.opts.joins) {
                // joinTables = Array.from(new Set(flat(this.dboBuilder.getJoins().map(j => j.tables)).filter(t => schema[t])));
                let _joinTables2 = this.dboBuilder.getJoinPaths()
                    .filter(jp => ![jp.t1, jp.t2].find(t => !schema[t] || !schema[t].findOne)).map(jp => [jp.t1, jp.t2].sort());
                _joinTables2.map(jt => {
                    if (!joinTables2.find(_jt => _jt.join() === jt.join())) {
                        joinTables2.push(jt);
                    }
                });
            }
            const methods = await publishParser.getMethods(socket);
            socket.emit(prostgles_types_1.CHANNELS.SCHEMA, Object.assign(Object.assign({ schema, methods: Object.keys(methods) }, (fullSchema ? { fullSchema } : {})), { rawSQL, joinTables: joinTables2, auth,
                version, err: publishValidationError }));
        };
        if (!params)
            throw "ProstglesInitOptions missing";
        if (!params.io)
            console.warn("io missing. WebSockets will not be set up");
        // TODO: find an exact keyof T<->arr TS matching method
        let config = [
            "transactions", "joins", "tsGeneratedTypesDir",
            "onReady", "dbConnection", "dbOptions", "publishMethods", "io",
            "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect",
            "onSocketDisconnect", "sqlFilePath", "auth", "DEBUG_MODE", "watchSchema",
            "fileTable", "tableConfig"
        ];
        const unknownParams = Object.keys(params).filter((key) => !config.includes(key));
        if (unknownParams.length) {
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        Object.assign(this.opts, params);
        /* set defaults */
        if ((_a = this.opts) === null || _a === void 0 ? void 0 : _a.fileTable) {
            this.opts.fileTable.tableName = ((_c = (_b = this.opts) === null || _b === void 0 ? void 0 : _b.fileTable) === null || _c === void 0 ? void 0 : _c.tableName) || "media";
        }
        this.opts.schema = this.opts.schema || "public";
        this.keywords = Object.assign(Object.assign({}, DEFAULT_KEYWORDS), params.keywords);
    }
    get dboBuilder() {
        if (!this._dboBuilder)
            throw "get dboBuilder: it's undefined";
        return this._dboBuilder;
    }
    set dboBuilder(d) {
        this._dboBuilder = d;
    }
    isMedia(tableName) {
        var _a, _b;
        return ((_b = (_a = this.opts) === null || _a === void 0 ? void 0 : _a.fileTable) === null || _b === void 0 ? void 0 : _b.tableName) === tableName;
    }
    async onSchemaChange(event) {
        const { watchSchema, onReady, tsGeneratedTypesDir } = this.opts;
        if (watchSchema && this.loaded) {
            console.log("Schema changed");
            if (typeof watchSchema === "function") {
                /* Only call the provided func */
                watchSchema(event);
            }
            else if (watchSchema === "hotReloadMode") {
                if (tsGeneratedTypesDir) {
                    /* Hot reload integration. Will only touch tsGeneratedTypesDir */
                    console.log("watchSchema: Re-writing TS schema");
                    await this.refreshDBO();
                    this.writeDBSchema(true);
                }
            }
            else if (watchSchema === true) {
                /* Full re-init. Sockets must reconnect */
                console.log("watchSchema: Full re-initialisation");
                this.init(onReady);
            }
        }
    }
    checkDb() {
        if (!this.db || !this.db.connect)
            throw "something went wrong getting a db connection";
    }
    getTSFileName() {
        const fileName = "DBoGenerated.d.ts"; //`dbo_${this.schema}_types.ts`;
        const fullPath = (this.opts.tsGeneratedTypesDir || "") + fileName;
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
        if (this.opts.tsGeneratedTypesDir) {
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
        else if (force) {
            console.error("Schema changed. tsGeneratedTypesDir needs to be set to reload server");
        }
    }
    async init(onReady) {
        this.loaded = false;
        if (this.opts.watchSchema === "hotReloadMode" && !this.opts.tsGeneratedTypesDir) {
            throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
        }
        else if (this.opts.watchSchema &&
            typeof this.opts.watchSchema === "object" &&
            "checkIntervalMillis" in this.opts.watchSchema &&
            typeof this.opts.watchSchema.checkIntervalMillis === "number") {
            if (this.schema_checkIntervalMillis) {
                clearInterval(this.schema_checkIntervalMillis);
                this.schema_checkIntervalMillis = setInterval(async () => {
                    const dbuilder = await DboBuilder_1.DboBuilder.create(this);
                    if (dbuilder.tsTypesDefinition !== this.dboBuilder.tsTypesDefinition) {
                        this.refreshDBO();
                    }
                }, this.opts.watchSchema.checkIntervalMillis);
            }
        }
        /* 1. Connect to db */
        if (!this.db) {
            const { db, pgp } = getDbConnection(this.opts.dbConnection, this.opts.dbOptions, this.opts.DEBUG_MODE, notice => {
                if (this.opts.onNotice)
                    this.opts.onNotice(notice);
                if (this.dbEventsManager) {
                    this.dbEventsManager.onNotice(notice);
                }
            });
            this.db = db;
            this.pgp = pgp;
        }
        this.checkDb();
        const { db, pgp } = this;
        /* 2. Execute any SQL file if provided */
        if (this.opts.sqlFilePath) {
            await this.runSQLFile(this.opts.sqlFilePath);
        }
        try {
            await this.refreshDBO();
            if (this.opts.tableConfig) {
                this.tableConfigurator = new TableConfig_1.default(this);
                try {
                    await this.tableConfigurator.init();
                }
                catch (e) {
                    console.error("TableConfigurator: ", e);
                    throw e;
                }
            }
            /* 3. Make DBO object from all tables and views */
            await this.refreshDBO();
            /* Create media table if required */
            if (this.opts.fileTable) {
                const { awsS3Config, localConfig, imageOptions } = this.opts.fileTable;
                await this.refreshDBO();
                if (!awsS3Config && !localConfig)
                    throw "fileTable missing param: Must provide awsS3Config OR localConfig";
                //@ts-ignore
                this.fileManager = new FileManager_1.default(awsS3Config || localConfig, imageOptions);
                try {
                    await this.fileManager.init(this);
                }
                catch (e) {
                    console.error("FileManager: ", e);
                    throw e;
                }
            }
            await this.refreshDBO();
            if (this.opts.publish) {
                if (!this.opts.io)
                    console.warn("IO missing. Publish has no effect without io");
                /* 3.9 Check auth config */
                this.authHandler = new AuthHandler_1.default(this);
                await this.authHandler.init();
                this.publishParser = new PublishParser(this.opts.publish, this.opts.publishMethods, this.opts.publishRawSQL, this.dbo, this.db, this);
                this.dboBuilder.publishParser = this.publishParser;
                /* 4. Set publish and auth listeners */
                await this.setSocketEvents();
            }
            else if (this.opts.auth)
                throw "Auth config does not work without publish";
            // if(this.watchSchema){
            //     if(!(await isSuperUser(db))) throw "Cannot watchSchema without a super user schema. Set watchSchema=false or provide a super user";
            // }
            this.dbEventsManager = new DBEventsManager_1.DBEventsManager(db, pgp);
            this.writeDBSchema();
            /* 5. Finish init and provide DBO object */
            try {
                if (this.destroyed) {
                    console.trace(1);
                }
                onReady(this.dbo, this.db);
            }
            catch (err) {
                console.error("Prostgles: Error within onReady: \n", err);
            }
            this.loaded = true;
            return {
                db: this.dbo,
                _db: db,
                pgp,
                io: this.opts.io,
                destroy: async () => {
                    var _a;
                    console.log("destroying prgl instance");
                    this.destroyed = true;
                    if (this.opts.io) {
                        this.opts.io.on("connection", () => {
                            console.log("Socket connected to destroyed instance");
                        });
                        if (typeof this.opts.io.close === "function") {
                            this.opts.io.close();
                            console.log("this.io.close");
                        }
                    }
                    (_a = this.dboBuilder) === null || _a === void 0 ? void 0 : _a.destroy();
                    this.dbo = undefined;
                    this.db = undefined;
                    await db.$pool.end();
                    await sleep(1000);
                    return true;
                }
            };
        }
        catch (e) {
            console.trace(e);
            throw "init issues: " + e.toString();
        }
    }
    async runSQLFile(filePath) {
        const fileContent = await this.getFileText(filePath); //.then(console.log);
        return this.db.multi(fileContent).then((data) => {
            console.log("Prostgles: SQL file executed successfuly \n    -> " + filePath);
            return data;
        }).catch((err) => {
            const { position, length } = err, lines = fileContent.split("\n");
            let errMsg = filePath + " error: ";
            if (position && length && fileContent) {
                const startLine = Math.max(0, fileContent.substring(0, position).split("\n").length - 2), endLine = startLine + 3;
                errMsg += "\n\n";
                errMsg += lines.slice(startLine, endLine).map((txt, i) => `${startLine + i + 1} ${i === 1 ? "->" : "  "} ${txt}`).join("\n");
                errMsg += "\n\n";
            }
            console.error(errMsg, err);
            throw err;
        });
    }
    async setSocketEvents() {
        this.checkDb();
        if (!this.dbo)
            throw "dbo missing";
        let publishParser = new PublishParser(this.opts.publish, this.opts.publishMethods, this.opts.publishRawSQL, this.dbo, this.db, this);
        this.publishParser = publishParser;
        if (!this.opts.io)
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
        this.opts.io.on('connection', async (socket) => {
            if (this.destroyed) {
                console.log("Socket connected to destroyed instance");
                socket.disconnect();
                return;
            }
            this.connectedSockets.push(socket);
            if (!this.db || !this.dbo)
                throw "db/dbo missing";
            let { dbo, db, pgp } = this;
            try {
                if (this.opts.onSocketConnect)
                    await this.opts.onSocketConnect(socket, dbo, db);
                /*  RUN Client request from Publish.
                    Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy
                */
                socket.removeAllListeners(prostgles_types_1.CHANNELS.DEFAULT);
                socket.on(prostgles_types_1.CHANNELS.DEFAULT, async ({ tableName, command, param1, param2, param3 }, cb = (...callback) => { }) => {
                    try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                        if (!socket) {
                            console.error("socket missing??!!");
                            throw "socket missing??!!";
                        }
                        const clientInfo = await this.authHandler.getClientInfo({ socket });
                        let valid_table_command_rules = await this.publishParser.getValidatedRequestRule({ tableName, command, localParams: { socket } }, clientInfo);
                        if (valid_table_command_rules) {
                            let res = await this.dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true });
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
                });
                socket.on("disconnect", () => {
                    this.dbEventsManager.removeNotice(socket);
                    this.dbEventsManager.removeNotify(socket);
                    this.connectedSockets = this.connectedSockets.filter(s => s.id !== socket.id);
                    // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                    if (this.opts.onSocketDisconnect) {
                        this.opts.onSocketDisconnect(socket, dbo);
                    }
                    ;
                });
                socket.removeAllListeners(prostgles_types_1.CHANNELS.METHOD);
                socket.on(prostgles_types_1.CHANNELS.METHOD, async ({ method, params }, cb = (...callback) => { }) => {
                    try {
                        const methods = await this.publishParser.getMethods(socket);
                        if (!methods || !methods[method]) {
                            cb("Disallowed/missing method " + JSON.stringify(method));
                        }
                        else {
                            try {
                                const res = await methods[method](...params);
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
                });
                this.pushSocketSchema(socket);
            }
            catch (e) {
                console.trace("setSocketEvents: ", e);
            }
        });
    }
}
exports.Prostgles = Prostgles;
function makeSocketError(cb, err) {
    const err_msg = (err instanceof Error) ?
        err.toString() :
        DboBuilder_1.isPlainObject(err) ?
            JSON.stringify(err, null, 2) :
            err.toString(), e = { err_msg, err };
    cb(e);
}
// const insertParams: Array<keyof InsertRule> = ["fields", "forcedData", "returningFields", "validate"];
const RULE_TO_METHODS = [
    {
        rule: "getColumns",
        methods: ["getColumns"],
        no_limits: true,
        allowed_params: [],
        hint: ` expecting false | true | undefined`
    },
    {
        rule: "getInfo",
        methods: ["getInfo"],
        no_limits: true,
        allowed_params: [],
        hint: ` expecting false | true | undefined`
    },
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
        methods: ["findOne", "find", "count"],
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
    async getPublishParams(localParams, clientInfo) {
        return Object.assign(Object.assign({}, (clientInfo || await this.prostgles.authHandler.getClientInfo(localParams))), { dbo: this.dbo, db: this.db, socket: localParams.socket });
    }
    async getMethods(socket) {
        let methods = {};
        const publishParams = await this.getPublishParams({ socket });
        const _methods = await applyParamsIfFunc(this.publishMethods, publishParams);
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
    }
    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket
     * @param user
     */
    async getPublish(localParams, clientInfo) {
        const publishParams = await this.getPublishParams(localParams, clientInfo);
        let _publish = await applyParamsIfFunc(this.publish, publishParams);
        if (_publish === "*") {
            let publish = {};
            this.prostgles.dboBuilder.tablesOrViews.map(tov => {
                publish[tov.name] = "*";
            });
            return publish;
        }
        return _publish;
    }
    async getValidatedRequestRuleWusr({ tableName, command, localParams }) {
        const clientInfo = await this.prostgles.authHandler.getClientInfo(localParams);
        return await this.getValidatedRequestRule({ tableName, command, localParams }, clientInfo);
    }
    async getValidatedRequestRule({ tableName, command, localParams }, clientInfo) {
        var _a, _b, _c, _d;
        if (!this.dbo)
            throw "INTERNAL ERROR: dbo is missing";
        if (!command || !tableName)
            throw "command OR tableName are missing";
        let rtm = RULE_TO_METHODS.find(rtms => rtms.methods.includes(command));
        if (!rtm) {
            throw "Invalid command: " + command;
        }
        /* Must be local request -> allow everything */
        if (!localParams || (!localParams.socket && !localParams.httpReq)) {
            return RULE_TO_METHODS.reduce((a, v) => (Object.assign(Object.assign({}, a), { [v.rule]: v.no_limits })), {});
        }
        /* Must be from socket. Must have a publish */
        if (!this.publish)
            throw "publish is missing";
        /* Get any publish errors for socket */
        const schm = (_d = (_c = (_b = (_a = localParams === null || localParams === void 0 ? void 0 : localParams.socket) === null || _a === void 0 ? void 0 : _a.prostgles) === null || _b === void 0 ? void 0 : _b.schema) === null || _c === void 0 ? void 0 : _c[tableName]) === null || _d === void 0 ? void 0 : _d[command];
        if (schm && schm.err)
            throw schm.err;
        let table_rule = await this.getTableRules({ tableName, localParams }, clientInfo);
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
            throw `Invalid or disallowed command: ${tableName}.${command}`;
    }
    async getTableRules({ tableName, localParams }, clientInfo) {
        try {
            if (!localParams || !tableName)
                throw "publish OR socket OR dbo OR tableName are missing";
            let _publish = await this.getPublish(localParams, clientInfo);
            let table_rules = _publish[tableName]; // applyParamsIfFunc(_publish[tableName],  localParams, this.dbo, this.db, user);
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
                /* Add missing implied rules */
                MY_RULES.map(r => {
                    if (["getInfo", "getColumns"].includes(r.rule) && ![null, false, 0].includes(table_rules[r.rule])) {
                        table_rules[r.rule] = r.no_limits;
                        return;
                    }
                    /* Add nested properties for fully allowed rules */
                    if ([true, "*"].includes(table_rules[r.rule]) && r.no_limits) {
                        table_rules[r.rule] = Object.assign({}, r.no_limits);
                    }
                    if (table_rules[r.rule]) {
                        /* Add implied methods if not falsy */
                        r.methods.map(method => {
                            if (table_rules[method] === undefined) {
                                const publishedTable = table_rules;
                                if (method === "updateBatch" && !publishedTable.update) {
                                }
                                else if (method === "upsert" && (!publishedTable.update || !publishedTable.insert)) {
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
                                table_rules.subscribeOne = Object.assign({}, sr.no_limits);
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
    }
    /* Prepares schema for client. Only allowed views and commands will be present */
    async getSchemaFromPublish(socket) {
        let schema = {};
        try {
            /* Publish tables and views based on socket */
            const clientInfo = await this.prostgles.authHandler.getClientInfo({ socket });
            let _publish = await this.getPublish(socket, clientInfo);
            if (_publish && Object.keys(_publish).length) {
                let txKey = "tx";
                if (!this.prostgles.opts.transactions)
                    txKey = "";
                if (typeof this.prostgles.opts.transactions === "string")
                    txKey = this.prostgles.opts.transactions;
                const tableNames = Object.keys(_publish).filter(k => !txKey || txKey !== k);
                await Promise.all(tableNames
                    .map(async (tableName) => {
                    if (!this.dbo[tableName]) {
                        throw `Table ${tableName} does not exist
                            Expecting one of: ${this.prostgles.dboBuilder.tablesOrViews.map(tov => tov.name).join(", ")}
                            DBO tables: ${Object.keys(this.dbo).filter(k => this.dbo[k].find).join(", ")}
                            `;
                    }
                    const table_rules = await this.getTableRules({ localParams: { socket }, tableName }, clientInfo);
                    // if(tableName === "insert_rule") throw {table_rules}
                    if (table_rules && Object.keys(table_rules).length) {
                        schema[tableName] = {};
                        let methods = [];
                        if (typeof table_rules === "object") {
                            methods = Object.keys(table_rules);
                        }
                        await Promise.all(methods.filter(m => m !== "select").map(async (method) => {
                            if (method === "sync" && table_rules[method]) {
                                /* Pass sync info */
                                schema[tableName][method] = table_rules[method];
                            }
                            else if (table_rules[method]) {
                                schema[tableName][method] = {};
                                /* Test for issues with the publish rules */
                                if (["update", "find", "findOne", "insert", "delete", "upsert"].includes(method)) {
                                    let err = null;
                                    try {
                                        let valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, localParams: { socket } }, clientInfo);
                                        await this.dbo[tableName][method]({}, {}, {}, valid_table_command_rules, { socket, has_rules: true, testRule: true });
                                    }
                                    catch (e) {
                                        err = "INTERNAL PUBLISH ERROR";
                                        schema[tableName][method] = { err };
                                        throw `publish.${tableName}.${method}: \n   -> ${e}`;
                                    }
                                }
                            }
                        }));
                    }
                    return true;
                }));
            }
        }
        catch (e) {
            console.error("Prostgles \nERRORS IN PUBLISH: ", JSON.stringify(e));
            throw e;
        }
        return schema;
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
async function isSuperUser(db) {
    return db.oneOrNone("select usesuper from pg_user where usename = CURRENT_USER;").then(r => r.usesuper);
}
exports.isSuperUser = isSuperUser;
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=Prostgles.js.map
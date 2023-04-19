"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSuperUser = exports.Prostgles = exports.JOIN_TYPES = exports.TABLE_METHODS = void 0;
const promise = require("bluebird");
const pgPromise = require("pg-promise");
const FileManager_1 = require("./FileManager/FileManager");
const { version } = require('../package.json');
const AuthHandler_1 = require("./AuthHandler");
const TableConfig_1 = require("./TableConfig/TableConfig");
const utils_1 = require("./utils");
const DboBuilder_1 = require("./DboBuilder");
const PubSubManager_1 = require("./PubSubManager/PubSubManager");
const prostgles_types_1 = require("prostgles-types");
const PublishParser_1 = require("./PublishParser");
const DBEventsManager_1 = require("./DBEventsManager");
exports.TABLE_METHODS = ["update", "find", "findOne", "insert", "delete", "upsert"];
function getDbConnection(dbConnection, options, debugQueries = false, onNotice) {
    const pgp = pgPromise({
        promiseLib: promise,
        ...(debugQueries ? {
            query: function (ctx) {
                console.log({
                    ...(0, PubSubManager_1.pickKeys)(ctx, ["params", "query"]),
                });
            },
            error: (error, ctx) => {
                console.log({
                    ...(0, PubSubManager_1.pickKeys)(ctx, ["params", "query"]),
                    error
                });
            }
        } : {}),
        ...((onNotice || debugQueries) ? {
            connect: function ({ client, dc, useCount }) {
                const isFresh = !useCount;
                if (isFresh && !client.listeners('notice').length) {
                    client.on('notice', function (msg) {
                        if (onNotice) {
                            onNotice(msg, (0, utils_1.get)(msg, "message"));
                        }
                        else {
                            console.log("notice: %j", (0, utils_1.get)(msg, "message"));
                        }
                    });
                }
                if (isFresh && !client.listeners('error').length) {
                    client.on('error', function (msg) {
                        if (onNotice) {
                            onNotice(msg, (0, utils_1.get)(msg, "message"));
                        }
                        else {
                            console.log("error: %j", (0, utils_1.get)(msg, "message"));
                        }
                    });
                }
            },
        } : {})
    });
    pgp.pg.defaults.max = 70;
    // /* Casts count/sum/max to bigint. Needs rework to remove casting "+count" and other issues; */
    // pgp.pg.types.setTypeParser(20, BigInt);
    /**
     * Prevent timestamp casting to ensure we don't lose the microseconds.
     * This is needed to ensure the filters work as expected for a given row
     *
    register(1114, parseTimestamp) // timestamp without time zone
    register(1184, parseTimestampTz) // timestamp with time zone
     */
    // pgp.pg.types.setTypeParser(1114, v => v); // timestamp without time zone
    // pgp.pg.types.setTypeParser(1184, v => v); // timestamp with time zone
    // pgp.pg.types.setTypeParser(1182, v => v); // date
    pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMP, v => v); // timestamp without time zone
    pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMPTZ, v => v); // timestamp with time zone
    pgp.pg.types.setTypeParser(pgp.pg.types.builtins.DATE, v => v); // date
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
    opts = {
        DEBUG_MODE: false,
        dbConnection: {
            host: "localhost",
            port: 5432,
            application_name: "prostgles_app"
        },
        onReady: () => {
            //empty 
        },
        schema: "public",
        watchSchema: false,
        watchSchemaType: "DDL_trigger",
    };
    db;
    pgp;
    dbo;
    _dboBuilder;
    get dboBuilder() {
        if (!this._dboBuilder)
            throw "get dboBuilder: it's undefined";
        return this._dboBuilder;
    }
    set dboBuilder(d) {
        this._dboBuilder = d;
    }
    publishParser;
    authHandler;
    schemaWatch;
    keywords = DEFAULT_KEYWORDS;
    loaded = false;
    dbEventsManager;
    fileManager;
    tableConfigurator;
    isMedia(tableName) {
        return this.opts?.fileTable?.tableName === tableName;
    }
    constructor(params) {
        if (!params)
            throw "ProstglesInitOptions missing";
        if (!params.io)
            console.warn("io missing. WebSockets will not be set up");
        const config = {
            transactions: 1, joins: 1, tsGeneratedTypesDir: 1,
            onReady: 1, dbConnection: 1, dbOptions: 1, publishMethods: 1,
            io: 1, publish: 1, schema: 1, publishRawSQL: 1, wsChannelNamePrefix: 1,
            onSocketConnect: 1, onSocketDisconnect: 1, sqlFilePath: 1, auth: 1,
            DEBUG_MODE: 1, watchSchema: 1, watchSchemaType: 1, fileTable: 1,
            tableConfig: 1, tableConfigMigrations: 1, keywords: 1, onNotice: 1
        };
        const unknownParams = Object.keys(params).filter((key) => !Object.keys(config).includes(key));
        if (unknownParams.length) {
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        Object.assign(this.opts, params);
        /* set defaults */
        if (this.opts?.fileTable) {
            this.opts.fileTable.tableName = this.opts?.fileTable?.tableName || "media";
        }
        this.opts.schema = this.opts.schema || "public";
        this.keywords = {
            ...DEFAULT_KEYWORDS,
            ...params.keywords,
        };
    }
    destroyed = false;
    async onSchemaChange(event) {
        const { watchSchema, watchSchemaType, onReady, tsGeneratedTypesDir } = this.opts;
        if (watchSchema && this.loaded) {
            (0, PubSubManager_1.log)("Schema changed");
            const { query } = event;
            if (typeof query === "string" && query.includes(PubSubManager_1.PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID)) {
                (0, PubSubManager_1.log)("Schema change event excluded from triggers due to EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID");
                return;
            }
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
            else if (watchSchema === true || (0, prostgles_types_1.isObject)(watchSchemaType) && "checkIntervalMillis" in watchSchemaType) {
                /* Full re-init. Sockets must reconnect */
                console.log("watchSchema: Full re-initialisation", { query });
                this.init(onReady, query);
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
    getTSFileContent = () => {
        const header = `/* This file was generated by Prostgles \n` +
            // `* ${(new Date).toUTCString()} \n` 
            `*/ \n\n `;
        return header + this.dboBuilder.tsTypesDefinition;
    };
    /**
     * Will write the Schema Typescript definitions to file (tsGeneratedTypesDir)
     */
    writeDBSchema(force = false) {
        if (this.opts.tsGeneratedTypesDir) {
            const { fullPath, fileName } = this.getTSFileName();
            const fileContent = this.getTSFileContent();
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
    /**
     * Will re-create the dbo object
     */
    refreshDBO = async () => {
        if (this._dboBuilder) {
            await this._dboBuilder.build();
            // this._dboBuilder.destroy();
        }
        else {
            this.dboBuilder = await DboBuilder_1.DboBuilder.create(this);
        }
        if (!this.dboBuilder)
            throw "this.dboBuilder";
        this.dbo = this.dboBuilder.dbo;
        return this.dbo;
    };
    initWatchSchema = (onReady) => {
        if (this.opts.watchSchema === "hotReloadMode" && !this.opts.tsGeneratedTypesDir) {
            throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
        }
        else if (this.opts.watchSchema &&
            typeof this.opts.watchSchemaType === "object" &&
            "checkIntervalMillis" in this.opts.watchSchemaType &&
            typeof this.opts.watchSchemaType.checkIntervalMillis === "number") {
            if (this.schema_checkIntervalMillis) {
                clearInterval(this.schema_checkIntervalMillis);
            }
            this.schema_checkIntervalMillis = setInterval(async () => {
                if (!this.loaded)
                    return;
                const dbuilder = await DboBuilder_1.DboBuilder.create(this);
                if (dbuilder.tsTypesDefinition !== this.dboBuilder.tsTypesDefinition) {
                    await this.refreshDBO();
                    this.init(onReady, "schema_checkIntervalMillis tsTypesDefinition changed");
                }
            }, this.opts.watchSchemaType.checkIntervalMillis);
        }
    };
    /* Create media table if required */
    initFileTable = async () => {
        if (this.opts.fileTable) {
            const { awsS3Config, localConfig, imageOptions } = this.opts.fileTable;
            await this.refreshDBO();
            if (!awsS3Config && !localConfig)
                throw "fileTable missing param: Must provide awsS3Config OR localConfig";
            this.fileManager = new FileManager_1.FileManager(awsS3Config || localConfig, imageOptions);
            try {
                await this.fileManager.init(this);
            }
            catch (e) {
                console.error("FileManager: ", e);
                throw e;
            }
        }
        await this.refreshDBO();
    };
    isSuperUser = false;
    schema_checkIntervalMillis;
    async init(onReady, reason) {
        this.loaded = false;
        this.initWatchSchema(onReady);
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
            this.isSuperUser = await isSuperUser(db);
        }
        this.checkDb();
        const db = this.db;
        const pgp = this.pgp;
        /* 2. Execute any SQL file if provided */
        if (this.opts.sqlFilePath) {
            await this.runSQLFile(this.opts.sqlFilePath);
        }
        try {
            await this.refreshDBO();
            if (this.opts.tableConfig) {
                if (this.tableConfigurator?.initialising) {
                    console.error("TableConfigurator WILL deadlock", { reason });
                }
                this.tableConfigurator = new TableConfig_1.default(this);
                try {
                    await this.tableConfigurator.init();
                }
                catch (e) {
                    if (this.opts.tableConfigMigrations?.silentFail === false) {
                        console.error("TableConfigurator silentFail: ", e);
                    }
                    else {
                        throw e;
                    }
                }
            }
            /* 3. Make DBO object from all tables and views */
            // await this.refreshDBO();
            /* Create media table if required */
            await this.initFileTable();
            if (this.opts.publish) {
                if (!this.opts.io)
                    console.warn("IO missing. Publish has no effect without io");
                /* 3.9 Check auth config */
                this.authHandler = new AuthHandler_1.default(this);
                await this.authHandler.init();
                this.publishParser = new PublishParser_1.PublishParser(this.opts.publish, this.opts.publishMethods, this.opts.publishRawSQL, this.dbo, this.db, this);
                this.dboBuilder.publishParser = this.publishParser;
                /* 4. Set publish and auth listeners */
                await this.setSocketEvents();
            }
            else if (this.opts.auth) {
                throw "Auth config does not work without publish";
            }
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
                getTSSchema: this.getTSFileContent,
                update: async (newOpts) => {
                    this.opts.fileTable = newOpts.fileTable;
                    await this.initFileTable();
                    await this.init(onReady, "prgl.update");
                },
                restart: () => this.init(onReady, "prgl.restart"),
                destroy: async () => {
                    console.log("destroying prgl instance");
                    this.destroyed = true;
                    if (this.opts.io) {
                        this.opts.io.on("connection", () => {
                            console.log("Socket connected to destroyed instance");
                        });
                        /** Try to close IO without stopping http server */
                        if (this.opts.io.sockets.constructor.name === "Namespace") {
                            for (const socket of this.opts.io.sockets.sockets.values()) {
                                socket._onclose("server shutting down");
                            }
                        }
                        if (this.opts.io.engine.constructor.name === 'Server') {
                            this.opts.io.engine.close();
                        }
                        // if (typeof this.opts.io.close === "function") {
                        //   this.opts.io.close();
                        //   console.log("this.io.close")
                        // }
                    }
                    this.fileManager?.destroy();
                    this.dboBuilder?.destroy();
                    this.authHandler?.destroy();
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
        return this.db?.multi(fileContent).then((data) => {
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
    connectedSockets = [];
    async setSocketEvents() {
        this.checkDb();
        if (!this.dbo)
            throw "dbo missing";
        const publishParser = new PublishParser_1.PublishParser(this.opts.publish, this.opts.publishMethods, this.opts.publishRawSQL, this.dbo, this.db, this);
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
                throw new Error("db/dbo missing");
            const { dbo, db } = this;
            try {
                if (this.opts.onSocketConnect) {
                    try {
                        const getUser = async () => { return await this.authHandler?.getClientInfo({ socket }); };
                        await this.opts.onSocketConnect({ socket, dbo: dbo, db, getUser });
                    }
                    catch (error) {
                        const connectionError = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
                        socket.emit(prostgles_types_1.CHANNELS.CONNECTION, { connectionError });
                        socket.disconnect();
                        return;
                    }
                }
                /*  RUN Client request from Publish.
                    Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy
                */
                socket.removeAllListeners(prostgles_types_1.CHANNELS.DEFAULT);
                socket.on(prostgles_types_1.CHANNELS.DEFAULT, async ({ tableName, command, param1, param2, param3 }, cb = (..._callback) => { }) => {
                    try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                        if (!socket || !this.authHandler || !this.publishParser || !this.dbo) {
                            console.error("socket or authhandler missing??!!");
                            throw "socket or authhandler missing??!!";
                        }
                        const clientInfo = await this.authHandler.getClientInfo({ socket });
                        const valid_table_command_rules = await this.publishParser.getValidatedRequestRule({ tableName, command, localParams: { socket } }, clientInfo);
                        if (valid_table_command_rules) {
                            const res = await this.dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, isRemoteRequest: true });
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
                    this.dbEventsManager?.removeNotice(socket);
                    this.dbEventsManager?.removeNotify(undefined, socket);
                    this.connectedSockets = this.connectedSockets.filter(s => s.id !== socket.id);
                    // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                    if (this.opts.onSocketDisconnect) {
                        const getUser = async () => { return await this.authHandler?.getClientInfo({ socket }); };
                        this.opts.onSocketDisconnect({ socket, dbo: dbo, db, getUser });
                    }
                });
                socket.removeAllListeners(prostgles_types_1.CHANNELS.METHOD);
                socket.on(prostgles_types_1.CHANNELS.METHOD, async ({ method, params }, cb = (..._callback) => { }) => {
                    try {
                        const methods = await this.publishParser?.getAllowedMethods(socket);
                        if (!methods || !methods[method]) {
                            cb("Disallowed/missing method " + JSON.stringify(method));
                        }
                        else {
                            try {
                                const methodDef = methods[method];
                                const onRun = (typeof methodDef === "function" || typeof methodDef.then === "function") ? methodDef : methodDef.run;
                                const res = await onRun(...params);
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
    pushSocketSchema = async (socket) => {
        try {
            const { auth, userData } = await this.authHandler?.makeSocketAuth(socket) || {};
            // let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
            // let DATA_TYPES = !needType? [] : await this.db.any("SELECT oid, typname FROM pg_type");
            // let USER_TABLES = !needType? [] :  await this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");
            const { db, publishParser } = this;
            let fullSchema;
            let publishValidationError;
            let rawSQL = false;
            try {
                if (!publishParser)
                    throw "publishParser undefined";
                fullSchema = await publishParser.getSchemaFromPublish(socket, userData);
            }
            catch (e) {
                publishValidationError = "Server Error: PUBLISH VALIDATION ERROR";
                console.error(`\nProstgles PUBLISH VALIDATION ERROR (after socket connected):\n    ->`, e);
            }
            socket.prostgles = socket.prostgles || {};
            socket.prostgles.schema = fullSchema?.schema;
            /*  RUN Raw sql from client IF PUBLISHED
            */
            if (this.opts.publishRawSQL && typeof this.opts.publishRawSQL === "function") {
                const canRunSQL = async () => {
                    const publishParams = await this.publishParser?.getPublishParams({ socket });
                    const res = await this.opts.publishRawSQL?.(publishParams);
                    return Boolean(res && typeof res === "boolean" || res === "*");
                };
                if (await canRunSQL()) {
                    socket.removeAllListeners(prostgles_types_1.CHANNELS.SQL);
                    socket.on(prostgles_types_1.CHANNELS.SQL, async ({ query, params, options }, cb = (..._callback) => { }) => {
                        if (!this.dbo?.sql)
                            throw "Internal error: sql handler missing";
                        this.dbo.sql(query, params, options, { socket }).then(res => {
                            cb(null, res);
                        }).catch(err => {
                            makeSocketError(cb, err);
                        });
                    });
                    if (db) {
                        // let allTablesViews = await db.any(STEP2_GET_ALL_TABLES_AND_COLUMNS);
                        // fullSchema = allTablesViews;
                        rawSQL = true;
                    }
                    else
                        console.error("db missing");
                }
            }
            const { schema, tables } = fullSchema ?? { schema: {}, tables: [] };
            const joinTables2 = [];
            if (this.opts.joins) {
                const _joinTables2 = this.dboBuilder.getJoinPaths()
                    .filter(jp => ![jp.t1, jp.t2].find(t => !schema[t] || !schema[t]?.findOne)).map(jp => [jp.t1, jp.t2].sort());
                _joinTables2.map(jt => {
                    if (!joinTables2.find(_jt => _jt.join() === jt.join())) {
                        joinTables2.push(jt);
                    }
                });
            }
            const methods = await publishParser?.getAllowedMethods(socket, userData);
            const methodSchema = !methods ? [] : (0, prostgles_types_1.getKeys)(methods).map(methodName => {
                const method = methods[methodName];
                if ((0, prostgles_types_1.isObject)(method) && "run" in method) {
                    return {
                        name: methodName,
                        ...(0, prostgles_types_1.omitKeys)(method, ["run"])
                    };
                }
                return methodName;
            });
            const clientSchema = {
                schema,
                methods: methodSchema,
                tableSchema: tables,
                rawSQL,
                joinTables: joinTables2,
                auth,
                version,
                err: publishValidationError
            };
            socket.emit(prostgles_types_1.CHANNELS.SCHEMA, clientSchema);
        }
        catch (err) {
            socket.emit(prostgles_types_1.CHANNELS.SCHEMA, { err });
        }
    };
}
exports.Prostgles = Prostgles;
function makeSocketError(cb, err) {
    const err_msg = (err instanceof Error) ?
        err.toString() :
        (0, DboBuilder_1.isPlainObject)(err) ?
            JSON.stringify(err, null, 2) :
            err.toString(), e = { err_msg, err };
    cb(e);
}
// const ALL_PUBLISH_METHODS = ["update", "upsert", "delete", "insert", "find", "findOne", "subscribe", "unsubscribe", "sync", "unsync", "remove"];
// const ALL_PUBLISH_METHODS = RULE_TO_METHODS.map(r => r.methods).flat();
// export function flat(arr){
//     // let res = arr.reduce((acc, val) => [ ...acc, ...val ], []);
//     let res =  arr.reduce(function (farr, toFlatten) {
//         return farr.concat(Array.isArray(toFlatten) ? flat(toFlatten) : toFlatten);
//       }, []);
//     return res;
// }
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
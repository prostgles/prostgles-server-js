"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublishParser = exports.flat = exports.Prostgles = exports.JOIN_TYPES = void 0;
const promise = require("bluebird");
const pgPromise = require("pg-promise");
'use strict';
const utils_1 = require("./utils");
const DboBuilder_1 = require("./DboBuilder");
let pgp = pgPromise({
    promiseLib: promise
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});
function getDbConnection(dbConnection, options) {
    pgp.pg.defaults.max = 70;
    if (options) {
        Object.assign(pgp.pg.defaults, options);
    }
    const db = pgp(dbConnection);
    return db;
}
const QueryFile = require('pg-promise').QueryFile;
exports.JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"];
const fs = require('fs');
class Prostgles {
    constructor(params) {
        this.dbConnection = {
            host: "localhost",
            port: 5432
        };
        this.schema = "public";
        this.wsChannelNamePrefix = "_psqlWS_";
        if (!params)
            throw "ProstglesInitOptions missing";
        if (!params.io)
            console.warn("io missing. WebSockets will not be set up");
        const unknownParams = Object.keys(params).filter(key => !["joins", "tsGeneratedTypesDir", "onReady", "dbConnection", "dbOptions", "publishMethods", "io", "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect", "onSocketDisconnect", "sqlFilePath"].includes(key));
        if (unknownParams.length) {
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        Object.assign(this, params);
    }
    checkDb() {
        if (!this.db || !this.db.connect)
            throw "something went wrong getting a db connection";
    }
    async init(onReady) {
        /* 1. Connect to db */
        this.db = getDbConnection(this.dbConnection, this.dbOptions);
        this.checkDb();
        /* 2. Execute any SQL file if provided */
        if (this.sqlFilePath) {
            await this.runSQLFile(this.sqlFilePath);
        }
        try {
            /* 3. Make DBO object from all tables and views */
            this.dboBuilder = new DboBuilder_1.DboBuilder(this);
            this.dbo = await this.dboBuilder.init();
            if (this.tsGeneratedTypesDir) {
                const fileName = "DBoGenerated.ts"; //`dbo_${this.schema}_types.ts`;
                console.log("typescript schema definition file ready -> " + fileName);
                fs.writeFileSync(this.tsGeneratedTypesDir + fileName, this.dboBuilder.tsTypesDefinition);
            }
            if (this.publish) {
                this.publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db);
                this.dboBuilder.publishParser = this.publishParser;
                /* 4. Set publish and auth listeners */ //makeDBO(db, allTablesViews, pubSubManager, false)
                await this.setSocketEvents();
            }
            /* 5. Finish init and provide DBO object */
            try {
                onReady(this.dbo, this.db);
            }
            catch (err) {
                console.error("Prostgles: Error within onReady: \n", err);
            }
            return true;
        }
        catch (e) {
            throw "init issues: " + e.toString();
        }
    }
    runSQLFile(filePath) {
        // console.log(module.parent.path);
        let _actualFilePath = sql(filePath); // module.parent.path + filePath;
        return this.db.multi(_actualFilePath).then((data) => {
            console.log("Prostgles: SQL file executed successfuly -> " + filePath);
        }).catch((err) => {
            console.log(filePath + "    file error: ", err);
        });
        // Helper for linking to external query files:
        function sql(fullPath) {
            return new QueryFile(fullPath, { minify: false });
        }
    }
    async setSocketEvents() {
        this.checkDb();
        if (!this.dbo)
            throw "dbo missing";
        let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
        let DATA_TYPES = !needType ? [] : await this.db.any("SELECT oid, typname FROM pg_type");
        let USER_TABLES = !needType ? [] : await this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");
        const WS_CHANNEL_NAME = {
            DEFAULT: `${this.wsChannelNamePrefix}.`,
            SQL: `${this.wsChannelNamePrefix}.sql`,
            METHOD: `${this.wsChannelNamePrefix}.method`,
            SCHEMA: `${this.wsChannelNamePrefix}.schema`
        };
        let publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db);
        if (!this.io)
            return;
        this.io.on('connection', async (socket) => {
            if (!this.db || !this.dbo)
                throw "db/dbo missing";
            let dbo = this.dbo;
            let db = this.db;
            let allTablesViews = this.dboBuilder.tablesOrViews;
            try {
                if (this.onSocketConnect)
                    await this.onSocketConnect(socket, dbo, db);
                /*  RUN Client request from Publish.
                    Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy
                */
                socket.on(WS_CHANNEL_NAME.DEFAULT, async ({ tableName, command, param1, param2, param3 }, cb = (...callback) => { }) => {
                    try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                        if (!socket)
                            throw "socket missing??!!";
                        let valid_table_command_rules = await this.publishParser.getValidatedRequestRule({ tableName, command, socket });
                        if (valid_table_command_rules) {
                            let res = await dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true });
                            cb(null, res);
                        }
                        else
                            throw `Invalid OR disallowed request: ${tableName}.${command} `;
                    }
                    catch (err) {
                        // const _err_msg = err.toString();
                        // cb({ msg: _err_msg, err });
                        cb(err);
                        // console.warn("runPublishedRequest ERROR: ", err, socket._user);
                    }
                });
                /*
                    TODO FINISH

                    auth: {
                        login: (data, { socket, dbo }) => {},
                        register: (data, { socket, dbo }) => {},
                        logout: (data, { socket, dbo }) => {},
                        onChange: (state, { socket, dbo }) => {},
                    }
                */
                socket.on("disconnect", function () {
                    // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                    if (this.onSocketDisconnect) {
                        this.onSocketDisconnect(socket, dbo);
                    }
                });
                socket.on(WS_CHANNEL_NAME.METHOD, async function ({ method, params }, cb = (...callback) => { }) {
                    try {
                        const methods = await publishParser.getMethods(socket);
                        if (!methods || !methods[method]) {
                            cb("Invalid method");
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
                let schema = {};
                try {
                    schema = await publishParser.getSchemaFromPublish(socket);
                }
                catch (e) {
                    console.error(`\nProstgles PUBLISH VALIDATION ERROR (after socket connected):\n    ->`, e);
                }
                socket.prostgles = socket.prostgles || {};
                socket.prostgles.schema = schema;
                /*  RUN Raw sql from client IF PUBLISHED
                */
                let fullSchema = [];
                if (this.publishRawSQL && typeof this.publishRawSQL === "function") {
                    const canRunSQL = await this.publishRawSQL(socket, dbo, db);
                    // console.log("canRunSQL", canRunSQL, socket.handshake.headers["x-real-ip"]);//, allTablesViews);
                    if (canRunSQL && typeof canRunSQL === "boolean" || canRunSQL === "*") {
                        socket.on(WS_CHANNEL_NAME.SQL, function ({ query, params, options, justRows = false }, cb = (...callback) => { }) {
                            // console.log(query, options)
                            if (options && options.statement) {
                                try {
                                    cb(null, pgp.as.format(query, params));
                                }
                                catch (err) {
                                    cb(err.toString());
                                }
                            }
                            else if (db) {
                                db.result(query, params)
                                    .then((qres) => {
                                    const { duration, fields, rows, rowCount } = qres;
                                    if (fields && DATA_TYPES.length) {
                                        qres.fields = fields.map(f => {
                                            const dataType = DATA_TYPES.find(dt => +dt.oid === +f.dataTypeID), tableName = USER_TABLES.find(t => +t.relid === +f.tableID), { name } = f;
                                            return {
                                                name,
                                                ...(dataType ? { dataType: dataType.typname } : {}),
                                                ...(tableName ? { tableName: tableName.relname } : {}),
                                            };
                                        });
                                    }
                                    cb(null, qres);
                                    // return qres;//{ duration, fields, rows, rowCount };
                                })
                                    .catch(err => {
                                    makeSocketError(cb, err);
                                    // Promise.reject(err.toString());
                                });
                            }
                            else
                                console.error("db missing");
                        });
                        if (db) {
                            // let allTablesViews = await db.any(STEP2_GET_ALL_TABLES_AND_COLUMNS);
                            fullSchema = allTablesViews;
                            schema.sql = {};
                        }
                        else
                            console.error("db missing");
                    }
                }
                const methods = await publishParser.getMethods(socket);
                let joinTables = [];
                if (this.joins) {
                    joinTables = Array.from(new Set(flat(this.joins.map(j => j.tables)).filter(t => schema[t])));
                }
                socket.emit(WS_CHANNEL_NAME.SCHEMA, {
                    schema,
                    methods: Object.keys(methods),
                    ...(fullSchema ? { fullSchema } : {}),
                    joinTables
                });
                function makeSocketError(cb, err) {
                    const err_msg = err.toString(), e = { err_msg, err };
                    cb(e);
                }
            }
            catch (e) {
                console.error("setSocketEvents: ", e);
            }
        });
    }
}
exports.Prostgles = Prostgles;
const insertParams = ["fields", "forcedData", "returningFields", "validate"];
const RULE_TO_METHODS = [
    {
        rule: "insert",
        methods: ["insert", "upsert"],
        no_limits: { fields: "*" },
        allowed_params: ["fields", "forcedData", "returningFields", "validate"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "update",
        methods: ["update", "upsert"],
        no_limits: { fields: "*", filterFields: "*", returningFields: "*" },
        allowed_params: ["fields", "filterFields", "forcedFilter", "forcedData", "returningFields", "validate"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "select",
        methods: ["findOne", "find", "subscribe", "unsubscribe", "count"],
        no_limits: { fields: "*", filterFields: "*" },
        allowed_params: ["fields", "filterFields", "forcedFilter", "validate", "maxLimit"],
        hint: ` expecting "*" | true | { fields: ( string | string[] | {} )  }`
    },
    {
        rule: "delete",
        methods: ["delete", "remove"],
        no_limits: { filterFields: "*" },
        allowed_params: ["filterFields", "forcedFilter", "returningFields", "validate"],
        hint: ` expecting "*" | true | { filterFields: ( string | string[] | {} ) } \n Will use "select", "update", "delete" and "insert" rules`
    },
    {
        rule: "sync", methods: ["sync", "unsync"],
        no_limits: null,
        allowed_params: ["id_fields", "synced_field", "sync_type", "allow_delete", "min_throttle"],
        hint: ` expecting "*" | true | { id_fields: string[], synced_field: string }`
    },
    {
        rule: "subscribe", methods: ["subscribe", "subscribeOne"],
        no_limits: { throttle: 0 },
        allowed_params: ["throttle"],
        hint: ` expecting "*" | true | { throttle: number } \n Will use "select" rules`
    }
];
// const ALL_PUBLISH_METHODS = ["update", "upsert", "delete", "insert", "find", "findOne", "subscribe", "unsubscribe", "sync", "unsync", "remove"];
// const ALL_PUBLISH_METHODS = RULE_TO_METHODS.map(r => r.methods).flat();
function flat(arr) {
    return arr.reduce((acc, val) => [...acc, ...val], []);
}
exports.flat = flat;
class PublishParser {
    constructor(publish, publishMethods, publishRawSQL, dbo, db) {
        this.publish = publish;
        this.publishMethods = publishMethods;
        this.publishRawSQL = publishRawSQL;
        this.dbo = dbo;
        this.db = db;
        if (!this.dbo || !this.publish)
            throw "INTERNAL ERROR: dbo and/or publish missing";
    }
    async getMethods(socket) {
        let methods = {};
        const _methods = await applyParamsIfFunc(this.publishMethods, socket, this.dbo, this.db);
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
    /* Should only be called once on socket connection */
    async getSchemaFromPublish(socket) {
        let schema = {};
        try {
            /* Publish tables and views based on socket */
            const _publish = await applyParamsIfFunc(this.publish, socket, this.dbo, this.db);
            if (_publish && Object.keys(_publish).length) {
                await Promise.all(Object.keys(_publish).map(async (tableName) => {
                    if (!this.dbo[tableName])
                        throw `Table ${tableName} does not exist\nExpecting one of: ${Object.keys(this.dbo).join(", ")}`;
                    const table_rules = await this.getTableRules({ socket, tableName });
                    if (table_rules) {
                        schema[tableName] = {};
                        let methods = [];
                        if (typeof table_rules === "object") {
                            /* apply method if not falsy */
                            RULE_TO_METHODS.map(rtms => {
                                if (table_rules[rtms.rule])
                                    methods = [...methods, ...rtms.methods];
                            });
                            /* Infer methods if not specified */
                            if (methods.includes("insert") && methods.includes("update") && methods.includes("select") && table_rules.upsert !== false) {
                                methods = [...methods, "upsert"];
                            }
                            else {
                                methods = methods.filter(m => m !== "upsert");
                            }
                            if (methods.includes("find") && table_rules.count !== false)
                                methods = [...methods, "count"];
                            if (methods.includes("find") && table_rules.subscribe !== false)
                                methods = [...methods, "subscribe"];
                        }
                        await Promise.all(methods.map(async (method) => {
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
                                        let valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, socket });
                                        await this.dbo[tableName][method]({}, {}, {}, valid_table_command_rules, { socket, has_rules: true, testRule: true });
                                    }
                                    catch (e) {
                                        err = "INTERNAL PUBLISH ERROR";
                                        schema[tableName][method] = { err };
                                        if (["find", "findOne"].includes(method)) {
                                            if (schema[tableName].subscribe) {
                                                schema[tableName].subscribe = schema[tableName][method];
                                            }
                                            if (schema[tableName].count) {
                                                schema[tableName].count = schema[tableName][method];
                                            }
                                        }
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
            console.error("Prostgles \nERRORS IN PUBLISH: ", e);
            throw e;
        }
        return schema;
    }
    async getValidatedRequestRule({ tableName, command, socket }) {
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
        /* Get any publish errors for socket */
        const schm = utils_1.get(socket, `prostgles.schema.${tableName}.${command}`);
        // console.log(schm, get(socket, `prostgles.schema`));
        if (schm && schm.err)
            throw schm.err;
        let table_rule = await this.getTableRules({ tableName, socket });
        if (!table_rule)
            throw "Invalid or disallowed table: " + tableName;
        if (command === "upsert") {
            if (!table_rule.update || !table_rule.insert) {
                throw `Invalid or disallowed command: upsert`;
            }
        }
        if (!this.publish)
            throw "publish is missing";
        if (rtm && table_rule && table_rule[rtm.rule]) {
            return table_rule;
        }
        else
            throw `Invalid or disallowed command: ${command}`;
    }
    async getTableRules({ tableName, socket }) {
        try {
            if (!socket || !tableName)
                throw "publish OR socket OR dbo OR tableName are missing";
            let _publish = await applyParamsIfFunc(this.publish, socket, this.dbo);
            let table_rules = applyParamsIfFunc(_publish[tableName], socket, this.dbo);
            if (table_rules) {
                /* Add no limits */
                if (typeof table_rules === "boolean" || table_rules === "*") {
                    table_rules = {};
                    RULE_TO_METHODS.map(r => {
                        table_rules[r.rule] = { ...r.no_limits };
                    });
                    /* Check for invalid limits */
                }
                else if (Object.keys(table_rules).length) {
                    if (table_rules.select && table_rules.subscribe !== false) {
                        table_rules.subscribe = {
                            ...RULE_TO_METHODS.find(r => r.rule === "subscribe").no_limits,
                            ...(typeof table_rules.subscribe !== "string" ? table_rules.subscribe : {})
                        };
                    }
                    Object.keys(table_rules)
                        .filter(m => table_rules[m])
                        .find(method => {
                        let rm = RULE_TO_METHODS.find(r => r.rule === method);
                        if (!rm) {
                            throw `Invalid rule in publish.${tableName} -> ${method} \nExpecting any of: ${RULE_TO_METHODS.map(r => r.rule).join(", ")}`;
                        }
                        if (typeof table_rules[method] === "boolean" || table_rules[method] === "*") {
                            table_rules[method] = { ...rm.no_limits };
                        }
                        let method_params = Object.keys(table_rules[method]);
                        let iparam = method_params.find(p => !rm.allowed_params.includes(p));
                        if (iparam) {
                            throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${rm.allowed_params.join(", ")}`;
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
}
exports.PublishParser = PublishParser;
function applyParamsIfFunc(maybeFunc, ...params) {
    if ((maybeFunc !== null && maybeFunc !== undefined) &&
        (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")) {
        return maybeFunc(...params);
    }
    return maybeFunc;
}
//# sourceMappingURL=Prostgles.js.map
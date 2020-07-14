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
exports.PublishParser = exports.Prostgles = void 0;
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
        const unknownParams = Object.keys(params).filter(key => !["tsGeneratedTypesDir", "isReady", "dbConnection", "dbOptions", "publishMethods", "io", "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect", "onSocketDisconnect", "sqlFilePath"].includes(key));
        if (unknownParams.length) {
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        Object.assign(this, params);
    }
    checkDb() {
        if (!this.db || !this.db.connect)
            throw "something went wrong getting a db connection";
    }
    init(isReady) {
        return __awaiter(this, void 0, void 0, function* () {
            /* 1. Connect to db */
            this.db = getDbConnection(this.dbConnection, this.dbOptions);
            this.checkDb();
            /* 2. Execute any SQL file if provided */
            if (this.sqlFilePath) {
                yield this.runSQLFile(this.sqlFilePath);
            }
            try {
                /* 3. Make DBO object from all tables and views */
                this.dboBuilder = new DboBuilder_1.DboBuilder(this.db, this.schema);
                this.dbo = yield this.dboBuilder.init();
                if (this.tsGeneratedTypesDir) {
                    const fileName = "DBoGenerated.ts"; //`dbo_${this.schema}_types.ts`;
                    console.log("typescript schema definition file ready -> " + fileName);
                    fs.writeFileSync(this.tsGeneratedTypesDir + fileName, this.dboBuilder.tsTypesDefinition);
                }
                /* 4. Set publish and auth listeners */ //makeDBO(db, allTablesViews, pubSubManager, false)
                yield this.setSocketEvents();
                /* 5. Finish init and provide DBO object */
                isReady(this.dbo, this.db);
                return true;
            }
            catch (e) {
                throw "init issues: " + e.toString();
            }
        });
    }
    runSQLFile(filePath) {
        // console.log(module.parent.path);
        let _actualFilePath = sql(filePath); // module.parent.path + filePath;
        return this.db.multi(_actualFilePath).then((data) => {
            console.log(filePath + "    file run successfuly");
        }).catch((err) => {
            console.log(filePath + "    file error: ", err);
        });
        // Helper for linking to external query files:
        function sql(fullPath) {
            return new QueryFile(fullPath, { minify: false });
        }
    }
    setSocketEvents() {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkDb();
            if (!this.dbo)
                throw "dbo missing";
            let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
            let DATA_TYPES = !needType ? [] : yield this.db.any("SELECT oid, typname FROM pg_type");
            let USER_TABLES = !needType ? [] : yield this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");
            const WS_CHANNEL_NAME = {
                DEFAULT: `${this.wsChannelNamePrefix}.`,
                SQL: `${this.wsChannelNamePrefix}.sql`,
                METHOD: `${this.wsChannelNamePrefix}.method`,
                SCHEMA: `${this.wsChannelNamePrefix}.schema`
            };
            let publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo);
            if (!this.io)
                return;
            this.io.on('connection', (socket) => __awaiter(this, void 0, void 0, function* () {
                if (!this.db || !this.dbo)
                    throw "db/dbo missing";
                let dbo = this.dbo;
                let db = this.db;
                let allTablesViews = this.dboBuilder.tablesOrViews;
                try {
                    if (this.onSocketConnect)
                        yield this.onSocketConnect({ socket, dbo });
                    // let schema: any = await getSchemaFromPublish({ publish, socket, dbo, forSchema: true });
                    let schema = yield publishParser.getSchemaFromPublish(socket);
                    /*  RUN Client request from Publish.
                        Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy
                    */
                    socket.on(WS_CHANNEL_NAME.DEFAULT, function ({ tableName, command, param1, param2, param3 }, cb = (...callback) => { }) {
                        return __awaiter(this, void 0, void 0, function* () {
                            if (!dbo) {
                                cb("Internal error");
                                throw "INTERNAL ERROR: DBO missing";
                            }
                            else {
                                try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                                    let valid_table_command_rules = yield publishParser.getDboRequestRules({ tableName, command, socket });
                                    if (valid_table_command_rules) {
                                        let res = yield dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true, socketDb: utils_1.get(socket, "prostgles.db") });
                                        cb(null, res);
                                    }
                                    else
                                        throw `Invalid OR disallowed request: ${tableName}.${command} `;
                                }
                                catch (err) {
                                    const _err_msg = err.toString();
                                    cb(_err_msg);
                                    console.warn("runPublishedRequest ERROR: ", err, socket._user);
                                }
                            }
                        });
                    });
                    /*  RUN Raw sql from client IF PUBLISHED
                    */
                    let fullSchema = [];
                    if (this.publishRawSQL && typeof this.publishRawSQL === "function") {
                        const canRunSQL = yield this.publishRawSQL({ socket, dbo });
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
                                                return Object.assign(Object.assign({ name }, (dataType ? { dataType: dataType.typname } : {})), (tableName ? { tableName: tableName.relname } : {}));
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
                            this.onSocketDisconnect({ socket, dbo });
                        }
                    });
                    socket.on(WS_CHANNEL_NAME.METHOD, function ({ method, params }, cb = (...callback) => { }) {
                        return __awaiter(this, void 0, void 0, function* () {
                            try {
                                const methods = yield publishParser.getMethods({ publishMethods: this.publishMethods, socket, dbo });
                                if (!methods || !methods[method]) {
                                    cb("Invalid method");
                                }
                                else {
                                    try {
                                        const res = yield methods[method](params);
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
                    });
                    const methods = yield publishParser.getMethods({ publishMethods: this.publishMethods, socket, dbo });
                    socket.emit(WS_CHANNEL_NAME.SCHEMA, Object.assign({ schema, methods: Object.keys(methods) }, (fullSchema ? { fullSchema } : {})));
                    function makeSocketError(cb, err) {
                        const err_msg = err.toString();
                        cb({ err_msg, err });
                    }
                }
                catch (e) {
                    console.error("setSocketEvents: ", e);
                }
            }));
        });
    }
}
exports.Prostgles = Prostgles;
const ALL_PUBLISH_METHODS = ["update", "upsert", "delete", "insert", "find", "findOne", "subscribe", "unsubscribe", "sync", "unsync", "remove"];
const RULE_TO_METHODS = [
    {
        rule: "insert",
        methods: ["insert"],
        no_limits: { fields: "*" },
        allowed_params: ["fields", "forcedData", "returningFields", "validate"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "update",
        methods: ["update"],
        no_limits: { fields: "*", filterFields: "*", returningFields: "*" },
        allowed_params: ["fields", "filterFields", "forcedFilter", "returningFields", "validate"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "select",
        methods: ["findOne", "find", "subscribe", "unsubscribe"],
        no_limits: { fields: "*", filterFields: "*" },
        allowed_params: ["fields", "filterFields", "forcedFilter", "validate", "maxLimit"],
        hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
    {
        rule: "delete",
        methods: ["delete"],
        no_limits: { filterFields: "*" },
        allowed_params: ["filterFields", "forcedFilter", "returningFields", "validate"],
        hint: ` expecting "*" | true | { filterFields: string | string[] | {} }`
    },
    {
        rule: "sync", methods: ["sync", "unsync"],
        no_limits: null,
        allowed_params: ["id_fields", "synced_field", "sync_type", "allow_delete"],
        hint: ` expecting "*" | true | { id_fields: [string], synced_field: string }`
    },
    {
        rule: "subscribe", methods: ["subscribe"],
        no_limits: {
            throttle: 10
        },
        allowed_params: ["throttle"],
        hint: ` expecting "*" | true | { throttle: number }`
    }
];
class PublishParser {
    constructor(publish, publishMethods, publishRawSQL, dbo) {
        this.publish = publish;
        this.publishMethods = publishMethods;
        this.publishRawSQL = publishRawSQL;
        this.dbo = dbo;
        if (!this.dbo || !this.publish)
            throw "INTERNAL ERROR: dbo and/or publish missing";
    }
    getDboRequestRules({ tableName, command, socket }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!ALL_PUBLISH_METHODS.includes(command)) {
                throw "Invalid command";
            }
            let table_rules = yield this.getTableRules({ tableName, socket });
            let command_rules = yield this.getCommandRules({ tableName, command, socket });
            if (table_rules && command_rules) {
                return table_rules;
            }
            return null;
        });
    }
    getMethods(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            let methods = {};
            const _methods = yield applyParamsIfFunc(this.publishMethods, { socket, dbo: this.dbo });
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
    getSchemaFromPublish(socket) {
        return __awaiter(this, void 0, void 0, function* () {
            let schema = {};
            try {
                /* Publish tables and views based on socket */
                const _publish = yield applyParamsIfFunc(this.publish, { socket, dbo: this.dbo });
                if (_publish && Object.keys(_publish).length) {
                    yield Promise.all(Object.keys(_publish).map((tableName) => __awaiter(this, void 0, void 0, function* () {
                        const table_rules = yield this.getTableRules({ socket, tableName });
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
                                if (methods.includes("insert") && methods.includes("update") && table_rules.upsert !== false)
                                    methods = [...methods, "upsert"];
                                if (methods.includes("find") && table_rules.count !== false)
                                    methods = [...methods, "count"];
                                if (methods.includes("find") && table_rules.subscribe !== false)
                                    methods = [...methods, "subscribe"];
                                /* Not sure what's this doing here */
                                // if(table_rules.methods) methods = validateKeys(table_rules.methods, methods, false);
                            }
                            methods.map(method => {
                                if (method === "sync" && table_rules[method]) {
                                    /* Pass sync info */
                                    schema[tableName][method] = table_rules[method];
                                }
                                else {
                                    schema[tableName][method] = {};
                                }
                            });
                        }
                        return true;
                    })));
                }
            }
            catch (e) {
                console.error("getSchemaFromPublish: ", e);
            }
            return schema;
        });
    }
    getCommandRules({ tableName, command, socket }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!command || !socket || !tableName)
                throw "command OR publish OR socket OR dbo OR tableName are missing";
            let table_rules = yield this.getTableRules({ tableName, socket });
            let rtms = RULE_TO_METHODS.find(rtms => rtms.methods.includes(command));
            if (rtms && table_rules && table_rules[rtms.rule]) {
                return table_rules[rtms.rule];
            }
            else
                throw `Invalid or disallowed request: ${tableName}.${command}`;
        });
    }
    getTableRules({ tableName, socket }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!socket || !tableName)
                    throw "publish OR socket OR dbo OR tableName are missing";
                let _publish = yield applyParamsIfFunc(this.publish, { socket, dbo: this.dbo });
                let table_rules = applyParamsIfFunc(_publish[tableName], { socket, dbo: this.dbo });
                if (table_rules) {
                    /* Add no limits */
                    if (typeof table_rules === "boolean" || table_rules === "*") {
                        table_rules = {};
                        RULE_TO_METHODS.map(r => {
                            table_rules[r.rule] = Object.assign({}, r.no_limits);
                        });
                        /* Check for invalid limits */
                    }
                    else if (Object.keys(table_rules).length) {
                        if (table_rules.select && table_rules.subscribe !== false) {
                            table_rules.subscribe = Object.assign({}, RULE_TO_METHODS.find(r => r.rule === "subscribe").no_limits);
                        }
                        Object.keys(table_rules)
                            .filter(m => table_rules[m])
                            .find(method => {
                            let rm = RULE_TO_METHODS.find(r => r.rule === method);
                            if (!rm) {
                                throw `Invalid table_rule method found for ${tableName} -> ${method} `;
                            }
                            if (typeof table_rules[method] === "boolean" || table_rules[method] === "*") {
                                table_rules[method] = Object.assign({}, rm.no_limits);
                            }
                            let method_params = Object.keys(table_rules[method]);
                            let iparam = method_params.find(p => !rm.allowed_params.includes(p));
                            if (iparam) {
                                throw `Invalid table_rule param found for ${tableName}.${method} -> ${iparam}`;
                            }
                        });
                    }
                }
                return table_rules;
            }
            catch (e) {
                throw "getTableRules failed: " + e;
            }
        });
    }
}
exports.PublishParser = PublishParser;
function applyParamsIfFunc(maybeFunc, params) {
    if ((maybeFunc !== null && maybeFunc !== undefined) &&
        (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")) {
        return maybeFunc(params);
    }
    return maybeFunc;
}
//# sourceMappingURL=Prostgles.js.map
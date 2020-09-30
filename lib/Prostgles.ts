/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as promise from "bluebird";
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { strict } from "assert";
'use strict';

import { get } from "./utils";
import { DboBuilder, DbHandler } from "./DboBuilder";
import { PubSubManager } from "./PubSubManager";

type PGP = pgPromise.IMain<{}, pg.IClient>;
let pgp: PGP = pgPromise({
    promiseLib: promise
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});

export type DB = pgPromise.IDatabase<{}, pg.IClient>;
type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
type DbConnectionOpts = pg.IDefaults;


function getDbConnection(dbConnection: DbConnection, options: DbConnectionOpts): DB {
    pgp.pg.defaults.max = 70;

    if(options){
        Object.assign(pgp.pg.defaults, options);
    }
    
    const db = pgp(dbConnection);
    
    return db;
}


const QueryFile = require('pg-promise').QueryFile;

/**
 * [{ field_name: (true | false) }]
 * true -> ascending
 * false -> descending
 * Array order is maintained
 */
export type OrderBy = { key: string, asc: boolean}[] | { [key: string]: boolean }[] | string | string[];

// /**
//  * @example
//  * { field_name: (true | false) }
//  * 
//  * ["field_name1", "field_name2"]
//  * 
//  * field_name: false -> means all fields except this
//  */
// type FieldFilter = object | string[] | "*";
import { FieldFilter } from "./DboBuilder";
import { Socket } from "dgram";

export type SelectParams = {
    select?: FieldFilter;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    // agg?: { min?: FieldFilter, max?: FieldFilter, sum?: FieldFilter, avg?: FieldFilter, distinct?: FieldFilter };
    expectOne?: boolean;
}
export type UpdateParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
    multi?: boolean;
}
export type InsertParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
}
export type DeleteParams = {
    returning?: FieldFilter;
}

export type InsertRequestData = {
    data: object | object[]
    returning: FieldFilter;
}
export type SelectRequestData = {
    filter: object;
    params: SelectParams;
}
export type DeleteRequestData = {
    filter: object;
    returning: FieldFilter;
}
export type UpdateRequestDataOne = {
    filter: object;
    data: object;
    returning: FieldFilter;
}
export type UpdateReq = {
    filter: object;
    data: object;
}
export type UpdateRequestDataBatch = {
    data: UpdateReq[];
}
export type UpdateRequestData = UpdateRequestDataOne | UpdateRequestDataBatch;

export type SelectRule = {
    // Fields allowed to be selected.   Tip: Use false to exclude field
    fields: FieldFilter;

    maxLimit?: number;

    // Filter added to every query (e.g. user_id) to restrict access
    forcedFilter?: object;

    // Fields user can filter by
    filterFields?: FieldFilter;

    // Validation logic to check/update data for each request
    validate?(...SelectRequestData): SelectRequestData
}
export type InsertRule = {

    // Fields allowed to be inserted.   Tip: Use false to exclude field
    fields: FieldFilter;

    // Data to include/overwrite on each insert
    forcedData?: object;

    // Fields user can view after inserting
    returningFields?: FieldFilter;

    // Validation logic to check/update data for each request
    validate?(...InsertRequestData): InsertRequestData
}
export type UpdateRule = {

    // Fields allowed to be updated.   Tip: Use false to exclude field
    fields: FieldFilter;

    // Filter added to every query (e.g. user_id) to restrict access
    // This filter cannot be updated
    forcedFilter?: object;

    // Data to include/overwrite on each update
    forcedData?: object;

    // Fields user can use to find the updates
    filterFields?: FieldFilter;

    // Fields user can view after updating
    returningFields?: FieldFilter;

    // Validation logic to check/update data for each request
    validate?(...UpdateRequestData): UpdateRequestData
}
export type DeleteRule = {
    
    // Filter added to every query (e.g. user_id) to restrict access
    forcedFilter?: object;

    // Fields user can filter by
    filterFields?: FieldFilter;

    // Fields user can view after deleting
    returningFields?: FieldFilter;

    // Validation logic to check/update data for each request
    validate?(...UpdateRequestData): UpdateRequestData
}
export type SyncRule = {
    
    /* Id of the table */
    id_fields: string[];

    /* Numerical incrementing (last updated timestamp) fieldname used to sync items */
    synced_field: string;

    allow_delete?: boolean;
}
export type SubscribeRule = {
    throttle?: number;
}

export type TableRule = {
    select?: SelectRule;
    insert?: InsertRule;
    update?: UpdateRule;
    delete?: DeleteRule;
    sync?: SyncRule;
    subscribe?: SubscribeRule;
};
export type ViewRule = {
    select: SelectRule;
};
export type PublishTableRule = {
    select?: SelectRule | "*";
    insert?: InsertRule | "*";
    update?: UpdateRule | "*";
    delete?: DeleteRule | "*";
    sync?: SyncRule;
    subscribe?: SubscribeRule | "*";
};
export type PublishViewRule = {
    select: SelectRule | "*";
};
// export type Publish = {
//     tablesOrViews: {[key:string]: TableRule | ViewRule | "*" }
// }
export type RequestParams = { dbo?: DbHandler, socket?: any };

export type PublishedTablesAndViews = { [key:string]: PublishTableRule | PublishViewRule | "*" } | "*" ;
export type Publish = PublishedTablesAndViews | ((socket?: any, dbo?: DbHandler, db?: DB) => (PublishedTablesAndViews | Promise<PublishedTablesAndViews>)); 

export type Method = (...args: any) => ( any | Promise<any> );
export const JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"] as const;
export type Join = {
    tables: [string, string];
    on: { [key: string]: string };
    type: typeof JOIN_TYPES[number];
};
export type Joins = Join[];

export type publishMethods = (socket?: any, dbo?: DbHandler | any, db?: DB) => { [key:string]: Method } | Promise<{ [key:string]: Method }>;

export type ProstglesInitOptions = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    publishMethods?: publishMethods,
    tsGeneratedTypesDir?: string;
    io?: any,
    publish?: Publish,
    joins?: Joins,
    schema?: string;
    sqlFilePath?: string;
    isReady(dbo: any, db: DB): void;
    // auth, 
    publishRawSQL?(socket: Socket, dbo: any, db?: DB): any;
    wsChannelNamePrefix?: string;
    onSocketConnect?(socket: Socket, dbo: any, db?: DB);
    onSocketDisconnect?(socket: Socket, dbo: any, db?: DB);
}

// interface ISocketSetup {
//     db: DB;
//     dbo: DbHandler;
//     io: any;
//     onSocketConnect?(socket: Socket, dbo: any);
//     onSocketDisconnect?(socket: Socket, dbo: any);
//     publish: Publish,
//     publishMethods: any;
//     publishRawSQL?: any,
// }
/*
    1. Connect to db
    2. Execute any SQL file if provided
    3. Make DBO object from all tables and views
    4. Set publish listeners
    5. Finish init and provide DBO object
*/

export type OnReady = {
    dbo: DbHandler;
    db: DB;
}

const fs = require('fs');
export class Prostgles {
    dbConnection: DbConnection = {
        host: "localhost",
        port: 5432
    };
    dbOptions: DbConnectionOpts;
    db: DB;
    dbo: DbHandler;
    dboBuilder: DboBuilder;

    publishMethods?: publishMethods;
    io: any;
    publish?: Publish;
    joins?: Joins;
    schema: string = "public";
    // auth, 
    publishRawSQL?: any;
    wsChannelNamePrefix: string = "_psqlWS_";
    onSocketConnect?(socket: Socket | any, dbo: any, db?: DB);
    onSocketDisconnect?(socket: Socket | any, dbo: any, db?: DB);
    sqlFilePath?: string;
    tsGeneratedTypesDir?: string;
    publishParser: PublishParser;

    constructor(params: ProstglesInitOptions){
        if(!params) throw "ProstglesInitOptions missing";
        if(!params.io) console.warn("io missing. WebSockets will not be set up");
        const unknownParams = Object.keys(params).filter(key => !["joins", "tsGeneratedTypesDir", "isReady", "dbConnection", "dbOptions", "publishMethods", "io", "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect", "onSocketDisconnect", "sqlFilePath"].includes(key))
        if(unknownParams.length){ 
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        
        Object.assign(this, params);
    }

    checkDb(){
        if(!this.db || !this.db.connect) throw "something went wrong getting a db connection";
    }

    async init(isReady: (dbo: DbHandler, db: DB) => any){

        /* 1. Connect to db */
        this.db = getDbConnection(this.dbConnection, this.dbOptions);
        this.checkDb();

        /* 2. Execute any SQL file if provided */
        if(this.sqlFilePath){
            await this.runSQLFile(this.sqlFilePath);
        }

        try {
            /* 3. Make DBO object from all tables and views */
            
            this.dboBuilder = new DboBuilder(this);
            this.dbo = await this.dboBuilder.init();

            if(this.tsGeneratedTypesDir){
                const fileName = "DBoGenerated.ts" //`dbo_${this.schema}_types.ts`;
                console.log("typescript schema definition file ready -> " + fileName)
                fs.writeFileSync(this.tsGeneratedTypesDir + fileName, this.dboBuilder.tsTypesDefinition);
            }

            if(this.publish){
                this.publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db);
                this.dboBuilder.publishParser = this.publishParser;
                /* 4. Set publish and auth listeners */ //makeDBO(db, allTablesViews, pubSubManager, false)
                await this.setSocketEvents();
            }


            /* 5. Finish init and provide DBO object */
            isReady(this.dbo, this.db);

            return true;
        } catch (e) {
            throw "init issues: " + e.toString();
        }
    }

    runSQLFile(filePath: string){
        // console.log(module.parent.path);
        let _actualFilePath = sql(filePath)  // module.parent.path + filePath;
        return this.db.multi(_actualFilePath).then((data)=>{
            console.log("Prostgles: SQL file executed successfuly -> " + filePath);
        }).catch((err)=>{
            console.log(filePath + "    file error: ", err);
        });

        // Helper for linking to external query files:
        function sql(fullPath: string) {
            return new QueryFile(fullPath, { minify: false });
        }
    }

    async setSocketEvents(){
        this.checkDb();

        if(!this.dbo) throw "dbo missing";
        
        let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
        let DATA_TYPES = !needType? [] : await this.db.any("SELECT oid, typname FROM pg_type");
        let USER_TABLES = !needType? [] :  await this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");

        const WS_CHANNEL_NAME = {
            DEFAULT: `${this.wsChannelNamePrefix}.`,
            SQL: `${this.wsChannelNamePrefix}.sql`,
            METHOD: `${this.wsChannelNamePrefix}.method`,
            SCHEMA: `${this.wsChannelNamePrefix}.schema`
        }

        let publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db);

        if(!this.io) return;

        this.io.on('connection', async (socket) => {

            if(!this.db || !this.dbo) throw "db/dbo missing";
            let dbo = this.dbo;
            let db = this.db;
            let allTablesViews = this.dboBuilder.tablesOrViews;

            try {
                if(this.onSocketConnect) await this.onSocketConnect(socket, dbo, db);
                
                /*  RUN Client request from Publish.
                    Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy 
                */
                socket.on(WS_CHANNEL_NAME.DEFAULT, async ({ tableName, command, param1, param2, param3 }: SocketRequestParams, cb = (...callback) => {} ) => {
                    
                    try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                        if(!socket) throw "socket missing??!!";

                        let valid_table_command_rules = await this.publishParser.getValidatedRequestRule({ tableName, command, socket });
                        if(valid_table_command_rules){
                            let res = await dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true }); 
                            cb(null, res);
                        } else throw `Invalid OR disallowed request: ${tableName}.${command} `;
                            
                    } catch(err) {
                        const _err_msg = err.toString();
                        cb(_err_msg);
                        // console.warn("runPublishedRequest ERROR: ", err, socket._user);
                    }


                    // OLD
                    // if(!dbo){
                    //     cb("Internal error");
                    //     throw "INTERNAL ERROR: DBO missing";
                    // } else {
                    //     let valid_table_command_rules = null;

                    //     try {
                    //         valid_table_command_rules = await publishParser.getDboRequestRules({ tableName, command, socket });
                    //         const schm = get(socket, `prostgles.schema.${tableName}.${command}`);
                    //         // console.log(schm, get(socket, `prostgles.schema`));
                    //         if(schm && schm.err) throw schm.err;


                    //     } catch(e) {
                    //         console.error("Published rules error", e);
                    //         cb("INTERNAL PUBLISH ERROR");
                    //         // return null;
                    //     }

                    //     try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                    //         if(valid_table_command_rules){
                    //             let res = await dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true }); 
                    //             cb(null, res);
                    //         } else throw `Invalid OR disallowed request: ${tableName}.${command} `;
                                
                    //     } catch(err) {
                    //         const _err_msg = err.toString();
                    //         cb(_err_msg);
                    //         // console.warn("runPublishedRequest ERROR: ", err, socket._user);
                    //     }
                    // }
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


                socket.on("disconnect", function(){
                    // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                    if(this.onSocketDisconnect){
                        this.onSocketDisconnect( socket, dbo);
                    }
                });

                
                socket.on(WS_CHANNEL_NAME.METHOD, async function({ method, params }: SocketMethodRequest, cb = (...callback) => {} ){
                    try {
                        const methods = await publishParser.getMethods(socket);
                        
                        if(!methods || !methods[method]){
                            cb("Invalid method");
                        } else {
                            try {
                                const res = await methods[method](...params);
                                cb(null, res);
                            } catch(err){
                                makeSocketError(cb, err);
                            }
                        }
                    } catch(err) {
                        makeSocketError(cb, err);
                        console.warn("method ERROR: ", err, socket._user);
                    }
                });
                
                let schema: any = {};
                
                try {
                    schema = await publishParser.getSchemaFromPublish(socket);
                } catch(e){
                    console.error(`\nProstgles PUBLISH VALIDATION ERROR (after socket connected):\n    ->`, e);
                }
                socket.prostgles = socket.prostgles || {};
                socket.prostgles.schema = schema;
                /*  RUN Raw sql from client IF PUBLISHED
                */
                let fullSchema = [];
                if(this.publishRawSQL && typeof this.publishRawSQL === "function"){
                    const canRunSQL = await this.publishRawSQL(socket, dbo, db);

                    // console.log("canRunSQL", canRunSQL, socket.handshake.headers["x-real-ip"]);//, allTablesViews);

                    if(canRunSQL && typeof canRunSQL === "boolean" || canRunSQL === "*"){
                        socket.on(WS_CHANNEL_NAME.SQL, function({ query, params, options, justRows = false }, cb = (...callback) => {}){

                            // console.log(query, options)
                            if(options && options.statement){
                                try {
                                    cb(null, pgp.as.format(query, params));
                                } catch (err){
                                    cb(err.toString());
                                }
                            } else if(db) {

                                db.result(query, params)
                                    .then((qres: any) => {
                                        const { duration, fields, rows, rowCount } = qres;
                                        if(fields && DATA_TYPES.length){
                                            qres.fields = fields.map(f => {
                                                const dataType = DATA_TYPES.find(dt => +dt.oid === +f.dataTypeID),
                                                    tableName = USER_TABLES.find(t => +t.relid === +f.tableID),
                                                    { name } = f;
        
                                                return {
                                                    name,
                                                    ...(dataType? { dataType: dataType.typname } : {}),
                                                    ...(tableName? { tableName: tableName.relname } : {}),
                                                }
                                            });
                                        }
                                        cb(null, qres)
                                        // return qres;//{ duration, fields, rows, rowCount };
                                    })
                                    .catch(err =>{ 
                                        makeSocketError(cb, err);
                                        // Promise.reject(err.toString());
                                    });

                            } else console.error("db missing");
                        });
                        if(db){
                            // let allTablesViews = await db.any(STEP2_GET_ALL_TABLES_AND_COLUMNS);
                            fullSchema = allTablesViews;
                            schema.sql = {};
                        } else console.error("db missing");
                    }
                }
                const methods = await publishParser.getMethods(socket);
                let joinTables = [];
                if(this.joins){
                    joinTables = Array.from(new Set(this.joins.map(j => j.tables).flat().filter(t => schema[t])));
                }
                socket.emit(WS_CHANNEL_NAME.SCHEMA, { 
                    schema, 
                    methods: Object.keys(methods), 
                    ...(fullSchema? { fullSchema } : {}),
                    joinTables
                });

                function makeSocketError(cb, err){
                    const err_msg = err.toString();
                    cb({ err_msg, err });
                }
            } catch(e) {
                console.error("setSocketEvents: ", e)
            }        
        });
    }
}

type SocketRequestParams = {
    tableName: string;
    command: string;
    param1: any;
    param2: any;
    param3: any;
}
type SocketMethodRequest = {
    method: string;
    params: any;
}


type callback = {
    (err: { err: any, err_msg: string }, res: any)
}


type Request = {
    socket: any;
}

type DboTable = Request & {
    tableName: string;
}
type DboTableCommand = Request & DboTable & {
    command: string;
}


const RULE_TO_METHODS = [
   { 
       rule: "insert",
       methods: ["insert", "upsert"], 
       no_limits: { fields: "*" }, 
       allowed_params: ["fields", "forcedData", "returningFields", "validate"] ,
       hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
   { 
       rule: "update", 
       methods: ["update", "upsert"], 
       no_limits: { fields: "*", filterFields: "*", returningFields: "*"  }, 
       allowed_params: ["fields", "filterFields", "forcedFilter", "forcedData", "returningFields", "validate"] ,
       hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
   { 
       rule: "select", 
       methods: ["findOne", "find", "subscribe", "unsubscribe", "count"], 
       no_limits: { fields: "*", filterFields: "*" }, 
       allowed_params: ["fields", "filterFields", "forcedFilter", "validate", "maxLimit"] ,
       hint: ` expecting "*" | true | { fields: ( string | string[] | {} )  }`
    },
   { 
       rule: "delete", 
       methods: ["delete", "remove"], 
       no_limits: { filterFields: "*" } , 
       allowed_params: ["filterFields", "forcedFilter", "returningFields", "validate"] ,
       hint: ` expecting "*" | true | { filterFields: ( string | string[] | {} ) }`
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
// const ALL_PUBLISH_METHODS = ["update", "upsert", "delete", "insert", "find", "findOne", "subscribe", "unsubscribe", "sync", "unsync", "remove"];
const ALL_PUBLISH_METHODS = RULE_TO_METHODS.map(r => r.methods).flat();

export class PublishParser {
    publish: any;
    publishMethods?: any;
    publishRawSQL?: any;
    dbo: DbHandler;
    db: DB

    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler, db: DB){
        this.publish = publish;
        this.publishMethods = publishMethods;
        this.publishRawSQL = publishRawSQL;
        this.dbo = dbo;
        this.db = db;

        if(!this.dbo || !this.publish) throw "INTERNAL ERROR: dbo and/or publish missing";
    }

    async getMethods(socket: any){
        let methods = {};
    
        const _methods = await applyParamsIfFunc(this.publishMethods, socket, this.dbo, this.db);
    
        if(_methods && Object.keys(_methods).length){
            Object.keys(_methods).map(key => {
                if(_methods[key] && (typeof _methods[key] === "function" || typeof _methods[key].then === "function")){
                    methods[key] = _methods[key];
                } else {
                    throw `invalid publishMethods item -> ${key} \n Expecting a function or promise`
                }
            });
        }
    
        return methods;
    }
    
    /* Should only be called once on socket connection */
    async getSchemaFromPublish(socket: any){
        let schema = {};
        
        try {
            /* Publish tables and views based on socket */
            const _publish = await applyParamsIfFunc(this.publish, socket, this.dbo, this.db);
    
            if(_publish && Object.keys(_publish).length){
                await Promise.all(
                    Object.keys(_publish).map(async tableName => {
                        if(!this.dbo[tableName]) throw `Table ${tableName} does not exist\nExpecting one of: ${Object.keys(this.dbo).join(", ")}`;

                        const table_rules = await this.getTableRules({ socket, tableName });
            
                        if(table_rules){
                            schema[tableName] = {};
                            let methods = [];
        
                            if(typeof table_rules === "object"){
        
                                /* apply method if not falsy */
                                RULE_TO_METHODS.map(rtms => {
                                    if(table_rules[rtms.rule]) methods = [ ...methods, ...rtms.methods ];
                                });
        
                                /* Infer methods if not specified */
                                if(methods.includes("insert") && methods.includes("update") && methods.includes("select") && table_rules.upsert !== false) { 
                                    methods = [ ...methods, "upsert" ];
                                } else {
                                    methods = methods.filter(m => m !== "upsert");
                                }
                                if(methods.includes("find") && table_rules.count !== false) methods = [ ...methods, "count"];
                                if(methods.includes("find") && table_rules.subscribe !== false) methods = [ ...methods, "subscribe" ];
                            }
                            
                            await Promise.all(methods.map(async method => {
                                if(method === "sync" && table_rules[method]){
                                    /* Pass sync info */
                                    schema[tableName][method] = table_rules[method];
                                } else {
                                    schema[tableName][method] = {};

                                    /* Test for issues with the publish rules */
                                    if(["update", "find", "findOne", "insert", "delete", "upsert"].includes(method)){

                                        let err = null;
                                        try {
                                            let valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, socket });
                                            await this.dbo[tableName][method]({}, {}, {}, valid_table_command_rules, { socket, has_rules: true, testRule: true }); 
                                                
                                        } catch(e) {
                                            err = "INTERNAL PUBLISH ERROR";
                                            schema[tableName][method] = { err };

                                            if(["find", "findOne"].includes(method)){
                                                if(schema[tableName].subscribe){
                                                    schema[tableName].subscribe = schema[tableName][method];
                                                }
                                                if(schema[tableName].count){
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
                    })
                );
            }
            
    
        } catch (e) {
            console.error("Prostgles \nERRORS IN PUBLISH: ", e);
            throw e;
        }
    
        return schema;
    }
    
    async getValidatedRequestRule({ tableName, command, socket }: DboTableCommand): Promise<TableRule>{
        if(!this.dbo) throw "INTERNAL ERROR: dbo is missing";

        if(!command || !tableName) throw "command OR tableName are missing";

        let rtm = RULE_TO_METHODS.find(rtms => rtms.methods.includes(command));
        if(!rtm){
            throw "Invalid command: " + command;
        }

        /* Must be local request -> allow everything */
        if(!socket) return undefined;

        /* Get any publish errors for socket */
        const schm = get(socket, `prostgles.schema.${tableName}.${command}`);
        // console.log(schm, get(socket, `prostgles.schema`));
        if(schm && schm.err) throw schm.err;

        let table_rule = await this.getTableRules({ tableName, socket });
        if(!table_rule) throw "Invalid or disallowed table: " + tableName;

        if(command === "upsert"){
            if(!table_rule.update || !table_rule.insert){
                throw `Invalid or disallowed command: upsert`;
            }
        }

        if(!this.publish) throw "publish is missing";

        if(rtm && table_rule && table_rule[rtm.rule]){
            return table_rule;
        } else throw `Invalid or disallowed command: ${command}`;
    }
    
    async getTableRules({ tableName, socket }: DboTable){
        
        try {
            if(!socket || !tableName) throw "publish OR socket OR dbo OR tableName are missing";
    
            let _publish = await applyParamsIfFunc(this.publish, socket, this.dbo );
    
            let table_rules = applyParamsIfFunc(_publish[tableName],  socket, this.dbo );
            if(table_rules){
                /* Add no limits */
                if(typeof table_rules === "boolean" || table_rules === "*"){
                    table_rules = {};
                    RULE_TO_METHODS.map(r => { 
                        table_rules[r.rule] = { ...r.no_limits };
                    });
    
                /* Check for invalid limits */
                } else if(Object.keys(table_rules).length){
                    
                    if(table_rules.select && table_rules.subscribe !== false){
                        table_rules.subscribe = { ...RULE_TO_METHODS.find(r => r.rule === "subscribe").no_limits };
                    }
                    Object.keys(table_rules)
                        .filter(m => table_rules[m])
                        .find(method => {
                            let rm = RULE_TO_METHODS.find(r => r.rule === method);
                            if(!rm){
                                throw `Invalid rule in publish.${tableName} -> ${method} \nExpecting any of: ${RULE_TO_METHODS.map(r => r.rule).join(", ")}`;
                            }
                            
                            if(typeof table_rules[method] === "boolean" || table_rules[method] === "*"){
                                table_rules[method] = { ...rm.no_limits };
                            }
                            let method_params = Object.keys(table_rules[method]);
    
    
                            let iparam = method_params.find(p => !rm.allowed_params.includes(p));
                            if(iparam){
                                throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${rm.allowed_params.join(", ")}`;
                            }
                        });                
                }
            }
                
               
            return table_rules;
        } catch (e) {
            throw e;
        }
    }

}


                            
function applyParamsIfFunc(maybeFunc: any, ...params: any): any{
    if(
        (maybeFunc !== null && maybeFunc !== undefined) &&
        (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")
    ){
        return maybeFunc(...params);
    }

    return maybeFunc;
}



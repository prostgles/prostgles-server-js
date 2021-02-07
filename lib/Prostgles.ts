/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as promise from "bluebird";
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');

const pkgj = require('../package.json');
const version = pkgj.version;

import { get } from "./utils";
import { DboBuilder, DbHandler, DbHandlerTX, TableHandler, ViewHandler } from "./DboBuilder";
import { PubSubManager, DEFAULT_SYNC_BATCH_SIZE } from "./PubSubManager";
 
type PGP = pgPromise.IMain<{}, pg.IClient>;


export { DbHandler, DbHandlerTX } from "./DboBuilder";
import { SQLRequest, SQLOptions } from "prostgles-types";

export type DB = pgPromise.IDatabase<{}, pg.IClient>;
type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
type DbConnectionOpts = pg.IDefaults;


function getDbConnection(dbConnection: DbConnection, options: DbConnectionOpts, debugQueries = false): { db: DB, pgp: PGP } {
    let pgp: PGP = pgPromise({
        promiseLib: promise,
        ...(debugQueries? {
            query: function (e) { 
                console.log({psql: e.query, params: e.params}); 
            }
        } : {})
    });
    pgp.pg.defaults.max = 70;

    // /* Casts count/sum/max to bigint. Needs rework to remove casting "+count" and other issues; */
    // pgp.pg.types.setTypeParser(20, BigInt);

    if(options){
        Object.assign(pgp.pg.defaults, options);
    }
    
    const db = pgp(dbConnection);
    
    return { db, pgp };
}


const QueryFile = require('pg-promise').QueryFile;


import { Socket } from "dgram";
import { type } from "os";
import { FieldFilter, SelectParams } from "prostgles-types";
import { spawn } from "child_process";

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
    /**
     * Fields allowed to be selected.   Tip: Use false to exclude field
     */
    fields: FieldFilter;

    maxLimit?: number;

    // Filter added to every query (e.g. user_id) to restrict access
    forcedFilter?: object;

    // Fields user can filter by
    filterFields?: FieldFilter;

    // Validation logic to check/update data for each request
    validate?(SelectRequestData): SelectRequestData
}
export type InsertRule = {

    // Fields allowed to be inserted.   Tip: Use false to exclude field
    fields: FieldFilter;

    // Data to include/overwrite on each insert
    forcedData?: object;

    // Fields user can view after inserting
    returningFields?: FieldFilter;

    // Validation logic to check/update data for each request. Happens before field check
    preValidate?: (row: object) => object | Promise<object>

    // Validation logic to check/update data for each request. Happens after field check
    validate?: (row: object) => object | Promise<object>
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
    validate?: (row: object) => object | Promise<object>
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
    
    /**
     * Primary keys used in updating data
     */
    id_fields: string[];
    
    /**
     * Numerical incrementing fieldname (last updated timestamp) used to sync items
     */
    synced_field: string;

    /**
     * EXPERIMENTAL. Disabled by default. If true then server will attempt to delete any records missing from client.
     */
    allow_delete?: boolean;

     /**
      * Throttle replication transmission in milliseconds. Defaults to 100
      */
    throttle?: number;

    /**
     * Number of rows to send per trip. Defaults to 50 
     */
    batch_size?: number;
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
    select?: SelectRule | "*" | false | null;
    insert?: InsertRule | "*" | false | null;
    update?: UpdateRule | "*" | false | null;
    delete?: DeleteRule | "*" | false | null;
    sync?: SyncRule;
    subscribe?: SubscribeRule | "*";
};
export type PublishViewRule = {
    select: SelectRule | "*" | false | null;
    getColumns: boolean;
};
// export type Publish = {
//     tablesOrViews: {[key:string]: TableRule | ViewRule | "*" }
// }
export type RequestParams = { dbo?: DbHandler, socket?: any };
export type PublishAllOrNothing = string | "*" | false | null;
export type PublishedTablesAndViews = PublishAllOrNothing | { [key: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing ) } ;
export type Publish = PublishedTablesAndViews | ((socket?: any, dbo?: DbHandler | DbHandlerTX | any, db?: DB, user?: any) => (PublishedTablesAndViews | Promise<PublishedTablesAndViews>)); 

export type Method = (...args: any) => ( any | Promise<any> );
export const JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"] as const;
export type Join = {
    tables: [string, string];
    on: { [key: string]: string };
    type: typeof JOIN_TYPES[number];
};
export type Joins = Join[] | "inferred";

export type publishMethods = (socket?: any, dbo?: DbHandler | DbHandlerTX | any, db?: DB, user?: any) => { [key:string]: Method } | Promise<{ [key:string]: Method }>;

export type BasicSession = { sid: string, expires: number };
export type SessionIDs = { sidCookie?: string; sidQuery?: string; sid: string; };
export type Auth = {
    sidQueryParamName?: string; /* Name of the websocket handshake query parameter that represents the session id. Takes precedence over cookie. If provided, Prostgles will attempt to get the user on socket connection */
    sidCookieName?: string; /* Name of the cookie that represents the session id. If provided, Prostgles will attempt to get the user on socket connection */
    getUser: (params: SessionIDs, dbo: any, db: DB, socket: any) => Promise<object | null | undefined>;    /* User data used on server */
    getClientUser: (params: SessionIDs, dbo: any, db: DB, socket: any) => Promise<object>;                 /* User data sent to client */
    register?: (params, dbo: any, db: DB, socket: any) => Promise<BasicSession>;
    login?: (params, dbo: any, db: DB, socket: any) => Promise<BasicSession>;
    logout?: (params: SessionIDs, dbo: any, db: DB, socket: any) => Promise<any>;
}

export type ProstglesInitOptions = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    tsGeneratedTypesDir?: string;
    io?: any;
    publish?: Publish;
    publishMethods?: publishMethods;
    publishRawSQL?(socket?: any, dbo?: DbHandler | DbHandlerTX | any, db?: DB, user?: any): ( (boolean | "*") | Promise<(boolean | "*")>);
    joins?: Joins;
    schema?: string;
    sqlFilePath?: string;
    onReady(dbo: any, db: DB): void;
    // auth, 
    transactions?: string | boolean;
    wsChannelNamePrefix?: string;
    onSocketConnect?(socket: Socket, dbo: any, db?: DB);
    onSocketDisconnect?(socket: Socket, dbo: any, db?: DB);
    auth?: Auth;
    DEBUG_MODE?: boolean;
    watchSchema?: boolean | Function;
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
    pgp: PGP;
    dbo: DbHandler | DbHandlerTX;
    dboBuilder: DboBuilder;

    publishMethods?: publishMethods;
    io: any;
    publish?: Publish;
    joins?: Joins;
    schema: string = "public";
    transactions?: string | boolean;
    // auth, 
    publishRawSQL?: any;
    wsChannelNamePrefix: string = "_psqlWS_";
    onSocketConnect?(socket: Socket | any, dbo: any, db?: DB);
    onSocketDisconnect?(socket: Socket | any, dbo: any, db?: DB);
    sqlFilePath?: string;
    tsGeneratedTypesDir?: string;
    publishParser: PublishParser;
    auth?: Auth;
    DEBUG_MODE?: boolean = false;
    watchSchema?: boolean | ((event: { command: string; query: string }) => void) = false;
    private loaded = false;

    constructor(params: ProstglesInitOptions){
        if(!params) throw "ProstglesInitOptions missing";
        if(!params.io) console.warn("io missing. WebSockets will not be set up");
        
        // TODO: find an exact keyof T<->arr TS matching method
        let config: Array<keyof ProstglesInitOptions> = [
            "transactions", "joins", "tsGeneratedTypesDir",
            "onReady", "dbConnection", "dbOptions", "publishMethods", "io", 
            "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect", 
            "onSocketDisconnect", "sqlFilePath", "auth", "DEBUG_MODE", "watchSchema"
        ];
        const unknownParams = Object.keys(params).filter((key: string) => !(config as string[]).includes(key))
        if(unknownParams.length){ 
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        
        Object.assign(this, params);
    }

    onSchemaChange(event: { command: string; query: string }){
        if(this.watchSchema && this.loaded){
            if(typeof this.watchSchema === "function"){
                this.watchSchema(event);
            } else {
                // spawn(process.argv[1], process.argv.slice(2), {
                //     detached: true, 
                //     stdio: ['ignore']//, out, err]
                //   }).unref()
                //   process.exit()
                // if(this.io) {
                //     Object.values(this.io.of("/").connected).forEach(function(s: any) {
                //        if(s && s.disconnect) s.disconnect(true);
                //     });
                // }

                /* Rewrite schema if different */
                this.writeDBSchema();

                // const { fullPath, fileName } = this.getTSFileName();
                // fs.readFile(fullPath, 'utf8', function(err, data) {
                //     console.log("Prostgles: Schema changed");
                //     fs.writeFileSync(fullPath, "/* Schema changed... */\n" + data);
                // });
            }
        }  
    }

    checkDb(){
        if(!this.db || !this.db.connect) throw "something went wrong getting a db connection";
    }

    getTSFileName(){
        const fileName = "DBoGenerated.d.ts" //`dbo_${this.schema}_types.ts`;
        const fullPath = (this.tsGeneratedTypesDir || "") + fileName;
        return { fileName, fullPath }
    }

    writeDBSchema(){

        if(this.tsGeneratedTypesDir){
            const { fullPath, fileName } = this.getTSFileName();
            const header = `/* This file was generated by Prostgles \n` +
            // `* ${(new Date).toUTCString()} \n` 
            `*/ \n\n `;
            const fileContent = header + this.dboBuilder.tsTypesDefinition;
            fs.readFile(fullPath, 'utf8', function(err, data) {
                if (err || data !== fileContent) {
                    fs.writeFileSync(fullPath, fileContent);
                    console.log("Prostgles: Created typescript schema definition file -> " + fileName)
                }
            });                
        }
    }

    async init(onReady: (dbo: DbHandler | DbHandlerTX, db: DB) => any){
        this.loaded = false;

        if(this.watchSchema && !this.tsGeneratedTypesDir) throw "tsGeneratedTypesDir option is needed for watchSchema to work ";

        /* 1. Connect to db */
        const { db, pgp } = getDbConnection(this.dbConnection, this.dbOptions, this.DEBUG_MODE);
        this.db = db;
        this.pgp = pgp;
        this.checkDb();

        /* 2. Execute any SQL file if provided */
        if(this.sqlFilePath){
            await this.runSQLFile(this.sqlFilePath);
        }

        try {
            /* 3. Make DBO object from all tables and views */
            
            this.dboBuilder = new DboBuilder(this);
            this.dbo = await this.dboBuilder.init();

            this.writeDBSchema();

            if(this.publish){
                /* 3.9 Check auth config */
                if(this.auth){
                    const { sidCookieName, login, getUser, getClientUser } = this.auth;
                    if(typeof sidCookieName !== "string" && !login){
                        throw "Invalid auth: Provide { sidCookieName: string } OR  { login: Function } ";
                    }
                    if(!getUser || !getClientUser) throw "getUser OR getClientUser missing from auth config";
                }

                this.publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db, this);
                this.dboBuilder.publishParser = this.publishParser;
                /* 4. Set publish and auth listeners */ //makeDBO(db, allTablesViews, pubSubManager, false)
                await this.setSocketEvents();

            } else if(this.auth) throw "Auth config does not work without publish";
            
            if(this.watchSchema){
                if(!(await isSuperUser(db))) throw "Cannot watchSchema without a super user schema. Set watchSchema=false or provide a super user";
                
            }


            /* 5. Finish init and provide DBO object */
            try {
                onReady(this.dbo, this.db);
            } catch(err){
                console.error("Prostgles: Error within onReady: \n", err)
            }

            this.loaded = true;
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
            return true
        }).catch((err)=>{
            console.log(filePath + "    file error: ", err);
        });

        // Helper for linking to external query files:
        function sql(fullPath: string) {
            return new QueryFile(fullPath, { minify: false });
        }
    }

    getSID(socket: any): SessionIDs {
        if(!this.auth) return null;

        const { sidCookieName, sidQueryParamName } = this.auth;

        if(!sidCookieName && !sidQueryParamName) return null;

        let result = {
            sidCookie: null, 
            sidQuery: null,
            sid: null
        }

        if(sidQueryParamName){
            result.sidQuery = get(socket, `handshake.query.${sidQueryParamName}`);
        }

        if(sidCookieName){
            const cookie_str = get(socket, "handshake.headers.cookie");
            const cookie = parseCookieStr(cookie_str);
            if(socket && cookie){
                result.sidCookie = cookie[sidCookieName];
            }
        }

        function parseCookieStr(cookie_str: string): any {
            if(!cookie_str || typeof cookie_str !== "string") return {}
            return cookie_str.replace(/\s/g, '').split(";").reduce((prev, current) => {
                const [name, value] = current.split('=');
                prev[name] = value;
                return prev
            }, {});
        }

        result.sid = result.sidQuery || result.sidCookie;

        return result;
    }

    async getUser(socket: any){

        if(this.auth){
            const { getUser } = this.auth;
    
            if(getUser){
                const params = this.getSID(socket);
                return await getUser(params, this.dbo, this.db, socket);
            }
        }

        return null;
    }

    async getUserFromCookieSession(socket: any): Promise<null | { user: any, clientUser: any }>{
       
        // console.log("conn", socket.handshake.query, socket._session)
        const params = this.getSID(socket);

        const { getUser, getClientUser } = this.auth;

        const user = await getUser(params, this.dbo, this.db, socket);
        const clientUser = await getClientUser(params, this.dbo, this.db, socket);

        if(!user) return undefined;
        return { user, clientUser };
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
            SCHEMA: `${this.wsChannelNamePrefix}.schema`,

            /* Auth channels */
            REGISTER: `${this.wsChannelNamePrefix}.register`,
            LOGIN: `${this.wsChannelNamePrefix}.login`,
            LOGOUT: `${this.wsChannelNamePrefix}.logout`,
        }

        let publishParser = new PublishParser(this.publish, this.publishMethods, this.publishRawSQL, this.dbo, this.db, this);

        if(!this.io) return;
        
        this.io.on('connection', async (socket) => {
            if(!this.db || !this.dbo) throw "db/dbo missing";
            let { dbo, db, pgp } = this;
            
            let allTablesViews = this.dboBuilder.tablesOrViews;
            try {
                if(this.onSocketConnect) await this.onSocketConnect(socket, dbo, db);

                let auth: any = {};
                if(this.auth){
                    const { register, login, logout, sidQueryParamName } = this.auth;
                    if(sidQueryParamName === "sid") throw "sidQueryParamName cannot be 'sid' please provide another name."
                    let handlers = [
                        { func: register,   ch: WS_CHANNEL_NAME.REGISTER,   name: "register"    },
                        { func: login,      ch: WS_CHANNEL_NAME.LOGIN,      name: "login"       },
                        { func: logout,     ch: WS_CHANNEL_NAME.LOGOUT,     name: "logout"      }
                    ].filter(h => h.func);

                    const usrData = await this.getUserFromCookieSession(socket);
                    if(usrData){
                        auth.user = usrData.clientUser;
                        handlers = handlers.filter(h => h.name === "logout");
                    }

                    handlers.map(({ func, ch, name }) => {
                        auth[name] = true;
                        socket.on(ch, async (params: any, cb = (...callback) => {} ) => {
                            
                            try {
                                if(!socket) throw "socket missing??!!";
        
                                const res = await func(params, dbo, db, socket);
                                if(name === "login" && res && res.sid){
                                    /* TODO: Re-send schema to client */
                                }

                                cb(null, true);
                                    
                            } catch(err) {
                                console.error(name + " err", err);
                                cb(err)
                            }
                        });
                    });

                }
                
                /*  RUN Client request from Publish.
                    Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy 
                */
                socket.on(WS_CHANNEL_NAME.DEFAULT, async ({ tableName, command, param1, param2, param3 }: SocketRequestParams, cb = (...callback) => {} ) => {
                    
                    try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                        if(!socket) throw "socket missing??!!";

                        const user = await this.getUser(socket);
                        let valid_table_command_rules = await this.publishParser.getValidatedRequestRule({ tableName, command, socket }, user);
                        if(valid_table_command_rules){
                            let res = await dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true }); 
                            cb(null, res);
                        } else throw `Invalid OR disallowed request: ${tableName}.${command} `;
                            
                    } catch(err) {
                        // const _err_msg = err.toString();
                        // cb({ msg: _err_msg, err });
                        // console.trace(err)
                        cb(err)
                        // console.warn("runPublishedRequest ERROR: ", err, socket._user);
                    }
                });


                socket.on("disconnect", () => {
                    // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                    if(this.onSocketDisconnect){
                        this.onSocketDisconnect(socket, dbo);
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
                let publishValidationError;
                let rawSQL = false;
                
                try {
                    schema = await publishParser.getSchemaFromPublish(socket);
                } catch(e){
                    publishValidationError = "Server Error: PUBLISH VALIDATION ERROR";
                    console.error(`\nProstgles PUBLISH VALIDATION ERROR (after socket connected):\n    ->`, e);
                }
                socket.prostgles = socket.prostgles || {};
                socket.prostgles.schema = schema;
                /*  RUN Raw sql from client IF PUBLISHED
                */
                let fullSchema = [];
                if(this.publishRawSQL && typeof this.publishRawSQL === "function"){
                    const canRunSQL = await this.publishRawSQL(socket, dbo, db, await this.getUser(socket));

                    // console.log("canRunSQL", canRunSQL, socket.handshake.headers["x-real-ip"]);//, allTablesViews);

                    if(canRunSQL && typeof canRunSQL === "boolean" || canRunSQL === "*"){
                        socket.on(WS_CHANNEL_NAME.SQL, function({ query, params, options }: SQLRequest, cb = (...callback) => {}){
                            const { returnType }: SQLOptions = options || ({} as any);

                            // console.log(query, options)
                            if(returnType === "statement"){
                                try {
                                    cb(null, pgp.as.format(query, params));
                                } catch (err){
                                    cb(err.toString());
                                }
                            } else if(db) {

                                db.result(query, params)
                                    .then((qres: any) => {
                                        const { duration, fields, rows, rowCount } = qres;
                                        if(returnType === "rows") {
                                            cb(null, rows);
                                            return;
                                        }

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
                            rawSQL = true;
                        } else console.error("db missing");
                    }
                }
                const methods = await publishParser.getMethods(socket);
                // let joinTables = [];
                let joinTables2 = [];
                if(this.joins){
                    // joinTables = Array.from(new Set(flat(this.dboBuilder.getJoins().map(j => j.tables)).filter(t => schema[t])));
                    let _joinTables2 = this.dboBuilder.getJoinPaths()
                    .filter(jp => 
                        ![jp.t1, jp.t2].find(t => !schema[t] || !schema[t].findOne)
                    ).map(jp => [jp.t1, jp.t2].sort());
                    _joinTables2.map(jt => {
                        if(!joinTables2.find(_jt => _jt.join() === jt.join())){
                            joinTables2.push(jt);
                        }
                    });
                }
                // console.log(joinTables2)
                socket.emit(WS_CHANNEL_NAME.SCHEMA, {
                    schema, 
                    methods: Object.keys(methods), 
                    ...(fullSchema? { fullSchema } : {}),
                    rawSQL,
                    joinTables: joinTables2,
                    auth,
                    version,
                    err: publishValidationError
                });

            } catch(e) {
                console.trace("setSocketEvents: ", e)
            }        
        });
    }
}
function makeSocketError(cb, err){
    const err_msg = err.toString(),
        e = { err_msg, err };
    cb(e);
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

// const insertParams: Array<keyof InsertRule> = ["fields", "forcedData", "returningFields", "validate"];

const RULE_TO_METHODS = [
    // { 
    //     rule: "getColumns",
    //     methods: ["getColumns"], 
    //     no_limits: {}, 
    //     table_only: false,
    //     allowed_params: [],
    //     hint: `  `
    // },
   { 
       rule: "insert",
       methods: ["insert", "upsert"], 
       no_limits: <SelectRule>{ fields: "*" }, 
       table_only: true,
       allowed_params: <Array<keyof InsertRule>>["fields", "forcedData", "returningFields", "validate", "preValidate"] ,
       hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
   { 
       rule: "update", 
       methods: ["update", "upsert"], 
       no_limits: <UpdateRule>{ fields: "*", filterFields: "*", returningFields: "*"  },
       table_only: true, 
       allowed_params: <Array<keyof UpdateRule>>["fields", "filterFields", "forcedFilter", "forcedData", "returningFields", "validate"] ,
       hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
   { 
       rule: "select", 
       methods: ["findOne", "find", "subscribe", "unsubscribe", "count", "getColumns"], 
       no_limits: <SelectRule>{ fields: "*", filterFields: "*" }, 
       allowed_params: <Array<keyof SelectRule>>["fields", "filterFields", "forcedFilter", "validate", "maxLimit"] ,
       hint: ` expecting "*" | true | { fields: ( string | string[] | {} )  }`
    },
   { 
       rule: "delete", 
       methods: ["delete", "remove"], 
       no_limits: <DeleteRule>{ filterFields: "*" } , 
       table_only: true,
       allowed_params: <Array<keyof DeleteRule>>["filterFields", "forcedFilter", "returningFields", "validate"] ,
       hint: ` expecting "*" | true | { filterFields: ( string | string[] | {} ) } \n Will use "select", "update", "delete" and "insert" rules`
    },
   { 
       rule: "sync", methods: ["sync", "unsync"], 
       no_limits: null,
       table_only: true,
       allowed_params: <Array<keyof SyncRule>>["id_fields", "synced_field", "sync_type", "allow_delete", "throttle", "batch_size"],
       hint: ` expecting "*" | true | { id_fields: string[], synced_field: string }`
    },
    { 
        rule: "subscribe", methods: ["subscribe", "subscribeOne"], 
        no_limits: <SubscribeRule>{  throttle: 0  },
        table_only: true,
        allowed_params: <Array<keyof SubscribeRule>>["throttle"],
        hint: ` expecting "*" | true | { throttle: number } \n Will use "select" rules`
    }
];
// const ALL_PUBLISH_METHODS = ["update", "upsert", "delete", "insert", "find", "findOne", "subscribe", "unsubscribe", "sync", "unsync", "remove"];
// const ALL_PUBLISH_METHODS = RULE_TO_METHODS.map(r => r.methods).flat();

export function flat(arr){
    // let res = arr.reduce((acc, val) => [ ...acc, ...val ], []);
    let res =  arr.reduce(function (farr, toFlatten) {
        return farr.concat(Array.isArray(toFlatten) ? flat(toFlatten) : toFlatten);
      }, []);
    // console.log(arr, res)
    return res;
}

export class PublishParser {
    publish: any;
    publishMethods?: any;
    publishRawSQL?: any;
    dbo: DbHandler | DbHandlerTX;
    db: DB
    prostgles: Prostgles;

    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler | DbHandlerTX, db: DB, prostgles: Prostgles){
        this.publish = publish;
        this.publishMethods = publishMethods;
        this.publishRawSQL = publishRawSQL;
        this.dbo = dbo;
        this.db = db;
        this.prostgles = prostgles;

        if(!this.dbo || !this.publish) throw "INTERNAL ERROR: dbo and/or publish missing";
    }

    async getMethods(socket: any){
        let methods = {};
    
        const user = await this.prostgles.getUser(socket);
        const _methods = await applyParamsIfFunc(this.publishMethods, socket, this.dbo, this.db, user);
    
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

    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket 
     * @param user 
     */
    async getPublish(socket, user){
        let _publish = await applyParamsIfFunc(this.publish, socket, this.dbo, this.db, user);

        if(_publish === "*"){
            let publish = {}
            this.prostgles.dboBuilder.tablesOrViews.map(tov => {
                publish[tov.name] = "*";
            });
            return publish;
        }

        return _publish;
    }
    async getValidatedRequestRuleWusr({ tableName, command, socket }: DboTableCommand): Promise<TableRule>{
        const user = await this.prostgles.getUser(socket);
        return await this.getValidatedRequestRule({ tableName, command, socket }, user);
    }
    
    async getValidatedRequestRule({ tableName, command, socket }: DboTableCommand, user): Promise<TableRule>{
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

        let table_rule = await this.getTableRules({ tableName, socket }, user);
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
    
    async getTableRules({ tableName, socket }: DboTable, user){
        
        try {
            if(!socket || !tableName) throw "publish OR socket OR dbo OR tableName are missing";
    
            let _publish = await this.getPublish(socket, user);
    
            let table_rules = applyParamsIfFunc(_publish[tableName],  socket, this.dbo, this.db, user);
            if(table_rules){

                /* All methods allowed. Add no limits for table rules */
                if([true, "*"].includes(table_rules)){
                    table_rules = {};
                    RULE_TO_METHODS
                        .filter(r => !(this.dbo[tableName] as TableHandler | ViewHandler).is_view || !r.table_only)
                        .map(r => {
                            table_rules[r.rule] = { ...r.no_limits };
                        });
                } 
                /* Add implied methods if not falsy */
                RULE_TO_METHODS
                    .filter(r => !(this.dbo[tableName] as TableHandler | ViewHandler).is_view || !r.table_only)
                    .map(r => {

                        if ([true, "*"].includes(table_rules[r.rule]) && r.no_limits) {
                            table_rules[r.rule] = Object.assign({}, r.no_limits);
                        }
                        if(table_rules[r.rule]){
                            r.methods.map(method => {
                                if(table_rules[method] === undefined){
                                    if(method === "upsert" && !(table_rules.update && table_rules.insert)){
                                        // return;
                                    } else {
                                        table_rules[method] = {};
                                    }
                                }
                            });
                        }
                    });
                
                /*
                    Add defaults
                    Check for invalid params 
                */
                if(Object.keys(table_rules).length){
                    

                    // let methods = Object.keys(table_rules);

                    // /* Add implied secondary methods if not falsy */
                    // RULE_TO_METHODS.map(rtms => {
                    //     if(table_rules[rtms.rule]){
                    //         rtms.methods.map(method => {
                    //             if(table_rules[method] !== false){
                    //                 table_rules[method] = {};
                    //             }
                    //         })
                    //         methods = [ ...methods, ...rtms.methods ];
                    //     }
                    // });
                    // /* Add complex implied methods unless specifically disabled */
                    // if(methods.includes("insert") && methods.includes("update") && methods.includes("select") && table_rules.upsert !== false) { 
                    //     methods = [ ...methods, "upsert" ];
                    // } else {
                    //     methods = methods.filter(m => m !== "upsert");
                    // }
                    // if(table_rules.select){
                    //     ["count", "find", ]
                    //     if(table_rules.count !== false) table_rules.count = {};
                    //     if(table_rules.subscribe !== false) methods = [ ...methods, "subscribe" ];
                    //     if(table_rules.getColumns !== false) methods = [ ...methods, "getColumns"];
                    // }

                    // if(table_rules.select && table_rules.subscribe !== false){
                    //     table_rules.subscribe = { 
                    //         ...RULE_TO_METHODS.find(r => r.rule === "subscribe").no_limits,
                    //         ...(typeof table_rules.subscribe !== "string"? table_rules.subscribe : {})
                    //     };
                    // }
                    Object.keys(table_rules)
                        .filter(m => table_rules[m])
                        .find(method => {
                            let rm = RULE_TO_METHODS.find(r => r.rule === method || r.methods.includes(method));
                            if(!rm){
                                throw `Invalid rule in publish.${tableName} -> ${method} \nExpecting any of: ${flat(RULE_TO_METHODS.map(r => [r.rule, ...r.methods])).join(", ")}`;
                            }

                            /* Check RULES for invalid params */
                            /* Methods do not have params -> They use them from rules */
                            if(method === rm.rule){
                                let method_params = Object.keys(table_rules[method]);
                                let iparam = method_params.find(p => !rm.allowed_params.includes(<never>p));
                                if(iparam){
                                    throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${rm.allowed_params.join(", ")}`;
                                }
                            }

                            /* Add default params (if missing) */
                            if(method === "sync"){
                            
                                if([true, "*"].includes(table_rules[method])){
                                    throw "Invalid sync rule. Expecting { id_fields: string[], synced_field: string } ";
                                }
                                if(typeof get(table_rules, [method, "throttle"]) !== "number"){
                                    table_rules[method].throttle = 100;
                                }
                                if(typeof get(table_rules, [method, "batch_size"]) !== "number"){
                                    table_rules[method].batch_size = DEFAULT_SYNC_BATCH_SIZE;
                                }
                            }
                        });                
                }
            }
                
               
            return table_rules;
        } catch (e) {
            throw e;
        }
    }


    
    /* Prepares schema for client. Only allowed views and commands will be present */
    async getSchemaFromPublish(socket: any){
        let schema = {};
        
        try {
            /* Publish tables and views based on socket */
            const user = await this.prostgles.getUser(socket);
            let _publish = await this.getPublish(socket, user);

    
            if(_publish && Object.keys(_publish).length){
                let txKey = "tx";
                if(!this.prostgles.transactions) txKey = "";
                if(typeof this.prostgles.transactions === "string") txKey = this.prostgles.transactions;
                
                const tableNames = Object.keys(_publish).filter(k => !txKey || txKey !== k);
                
                await Promise.all(tableNames                 
                    .map(async tableName => {
                        if(!this.dbo[tableName]) throw `Table ${tableName} does not exist\nExpecting one of: ${this.prostgles.dboBuilder.tablesOrViews.map(tov => tov.name).join(", ")}`;

                        const table_rules = await this.getTableRules({ socket, tableName }, user);
            
                        if(table_rules && Object.keys(table_rules).length){
                            schema[tableName] = {};
                            let methods = [];
        
                            if(typeof table_rules === "object"){
                                methods = Object.keys(table_rules);
                                // /* Add simple implied methods methods if not falsy */
                                // RULE_TO_METHODS.map(rtms => {
                                //     if(table_rules[rtms.rule]) methods = [ ...methods, ...rtms.methods ];
                                // });
        
                                // /* Add complex implied methods unless specifically disabled */
                                // if(methods.includes("insert") && methods.includes("update") && methods.includes("select") && 
                                //     table_rules.upsert !== false
                                // ) { 
                                //     methods = [ ...methods, "upsert" ];
                                // } else {
                                //     methods = methods.filter(m => m !== "upsert");
                                // }
                                // if(methods.includes("find") && table_rules.count !== false) methods = [ ...methods, "count"];
                                // if(methods.includes("find") && table_rules.subscribe !== false) methods = [ ...methods, "subscribe" ];
                                // if(methods.includes("find") && table_rules.getColumns !== false) methods = [ ...methods, "getColumns"];
                            }
                            
                            await Promise.all(methods.filter(m => m !== "select").map(async method => {
                                if(method === "sync" && table_rules[method]){

                                    /* Pass sync info */
                                    schema[tableName][method] = table_rules[method];
                                } else {

                                    schema[tableName][method] = {};

                                    /* Test for issues with the publish rules */
                                    if(["update", "find", "findOne", "insert", "delete", "upsert"].includes(method)){

                                        let err = null;
                                        try {
                                            let valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, socket }, user);
                                            await this.dbo[tableName][method]({}, {}, {}, valid_table_command_rules, { socket, has_rules: true, testRule: true }); 
                                                
                                        } catch(e) {
                                            err = "INTERNAL PUBLISH ERROR";
                                            schema[tableName][method] = { err };

                                            /* What is going on here???? */
                                            // if(["find", "findOne"].includes(method)){
                                            //     if(schema[tableName].subscribe){
                                            //         schema[tableName].subscribe = schema[tableName][method];
                                            //     }
                                            //     if(schema[tableName].count){
                                            //         schema[tableName].count = schema[tableName][method];
                                            //     }
                                            // }
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
            console.error("Prostgles \nERRORS IN PUBLISH: ", JSON.stringify(e));
            throw e;
        }
    
        return schema;
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

export async function isSuperUser(db: DB): Promise<boolean>{
    return db.oneOrNone("select usesuper from pg_user where usename = CURRENT_USER;").then(r => r.usesuper);
}


function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
} 
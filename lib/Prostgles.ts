/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as promise from "bluebird";
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import FileManager, { ImageOptions, LocalConfig, S3Config } from "./FileManager";

const pkgj = require('../package.json');
const version = pkgj.version;

console.log("Add a basic auth mode where user and sessions table are created");

import { get } from "./utils";
import { DboBuilder, DbHandler, TableHandler, ViewHandler, isPlainObject, LocalParams } from "./DboBuilder";
import { PubSubManager, DEFAULT_SYNC_BATCH_SIZE, asValue } from "./PubSubManager";
export { DbHandler }
export type PGP = pgPromise.IMain<{}, pg.IClient>;

import { SQLRequest, SQLOptions, CHANNELS, AnyObject } from "prostgles-types";

import { DBEventsManager } from "./DBEventsManager";

export type DB = pgPromise.IDatabase<{}, pg.IClient>;
type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
type DbConnectionOpts = pg.IDefaults;

let currConnection: { db: DB, pgp: PGP };
function getDbConnection(dbConnection: DbConnection, options: DbConnectionOpts, debugQueries = false, onNotice = null): { db: DB, pgp: PGP } {
    let pgp: PGP = pgPromise({
        
        promiseLib: promise,
        ...(debugQueries? {
            query: function (e) { 
                console.log({psql: e.query, params: e.params}); 
            },
        } : {}),
        ...((onNotice || debugQueries)? {
            connect: function (client, dc, isFresh) {
                if (isFresh && !client.listeners('notice').length) {
                    client.on('notice', function (msg) {
                        if(onNotice){
                            onNotice(msg, get(msg, "message"));
                        } else {
                            console.log("notice: %j", get(msg, "message"));
                        }
                    });
                }
            },
        } : {})
    });
    pgp.pg.defaults.max = 70;

    // /* Casts count/sum/max to bigint. Needs rework to remove casting "+count" and other issues; */
    // pgp.pg.types.setTypeParser(20, BigInt);

    if(options){
        Object.assign(pgp.pg.defaults, options);
    }
    
    return { 
        db: pgp(dbConnection), 
        pgp 
    };
}


import { Socket } from "dgram";
import { FieldFilter, SelectParamsBasic as SelectParams } from "prostgles-types";

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

export type ValidateRow = (row: AnyObject) => AnyObject | Promise<AnyObject>;

export type SelectRule = {

    /**
     * Fields allowed to be selected.   Tip: Use false to exclude field
     */
    fields: FieldFilter;

    /**
     * The maximum number of rows a user can get in a select query. 1000 by default. Unless a higher limit is specified 100 rows are returned by the default
     */
    maxLimit?: number;

    /**
     * Filter added to every query (e.g. user_id) to restrict access
     */
    forcedFilter?: object;

    /**
     * Fields user can filter by 
     * */
    filterFields?: FieldFilter;

    /**
     * Validation logic to check/update data for each request
     */
    validate?(SelectRequestData): SelectRequestData;

    /**
     * Allows clients to get column information on any columns that are allowed in any rules. True by default. 
     */
    getColumns?: boolean;
    
    /**
     * Allows clients to get table information (oid, comment). True by default. 
     */
    getInfo?: boolean;
}
export type InsertRule = {

    /**
     * Fields allowed to be inserted.   Tip: Use false to exclude field
     */
    fields: FieldFilter;

    /**
     * Data to include/overwrite on each insert
     */
    forcedData?: object;

    /**
     * Fields user can view after inserting
     */
    returningFields?: FieldFilter;

    /**
     * Validation logic to check/update data for each request. Happens before publish rule checks (for fields, forcedData/forcedFilter)
     */
    preValidate?: ValidateRow

    /**
     * Validation logic to check/update data for each request. Happens after publish rule checks (for fields, forcedData/forcedFilter)
     */
    validate?: ValidateRow
}
export type UpdateRule = {

    /**
     * Fields allowed to be updated.   Tip: Use false to exclude field
     */
    fields: FieldFilter;

    /**
     * Filter added to every query (e.g. user_id) to restrict access
     * This filter cannot be updated
     */
    forcedFilter?: object;

    /**
     * Data to include/overwrite on each update
     */
    forcedData?: object;

    /**
     * Fields user can use to find the updates
     */
    filterFields?: FieldFilter;

    /**
     * Fields user can view after updating
     */
    returningFields?: FieldFilter;

    /**
     * Validation logic to check/update data for each request
     */
    validate?: ValidateRow
}
export type DeleteRule = {
    
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     */
    forcedFilter?: object;

    /**
     * Fields user can filter by
     */
    filterFields?: FieldFilter;

    /**
     * Fields user can view after deleting
     */
    returningFields?: FieldFilter;

    /**
     * Validation logic to check/update data for each request
     */
    validate?(...args): UpdateRequestData
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
};
// export type Publish = {
//     tablesOrViews: {[key:string]: TableRule | ViewRule | "*" }
// }
export type RequestParams = { dbo?: DbHandler, socket?: any };
export type PublishAllOrNothing = "*" | false | null;
export type PublishObject = { 
    [table_name: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing ) 
};
export type PublishTable = { 
    [table_name: string]: (PublishTableRule | PublishViewRule) 
};
export type PublishedResult = PublishAllOrNothing | PublishObject ;
export type PublishParams<DBO = DbHandler> = {
    sid?: string;
    dbo?: DBO;
    db?: DB;
    user?: AnyObject;
}
export type Publish<DBO> =(params: PublishParams<DBO>) => (PublishedResult | Promise<PublishedResult>); 

export type Method = (...args: any) => ( any | Promise<any> );
export const JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"] as const;
export type Join = {
    tables: [string, string];
    on: { [key: string]: string };
    type: typeof JOIN_TYPES[number];
};
export type Joins = Join[] | "inferred";

export type PublishMethods<DBO> = (params: PublishParams<DBO>) => { [key:string]: Method } | Promise<{ [key:string]: Method }>;

export type BasicSession = { sid: string, expires: number };

export type AuthClientRequest = { socket: any } | { httpReq: any }
export type Auth<DBO = DbHandler> = {
    /**
     * Name of the cookie or socket hadnshake query param that represents the session id. 
     * Defaults to "session_id"
     */
    sidKeyName?: string;
    expressConfig?: {
        /**
         * Express app instance. If provided Prostgles will attempt to set sidKeyName to user cookie
         */
        app: any;

        /**
         * Used in allowing logging in through express
         */
        loginPostPath: string;
    }

    /**
     * User data used on server
     */
    getUser: (sid: string, dbo: DBO, db: DB) => Promise<AnyObject | null | undefined>;

    /**
     * User data sent to client
     */
    getClientUser: (sid: string, dbo: DBO, db: DB) => Promise<AnyObject | null | undefined>;

    register?: (params: AnyObject, dbo: DBO, db: DB) => Promise<BasicSession>;
    login?: (params: AnyObject, dbo: DBO, db: DB) => Promise<BasicSession>;
    logout?: (sid: string, dbo: DBO, db: DB) => Promise<any>;
}

export type ClientInfo = {
    user?: AnyObject;
    clientUser?: AnyObject;
    sid?: string;
}

type Keywords = {
    $and: string;
    $or: string;
    $not: string;
};

export type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
};
export type I18N_CONFIG<LANG_IDS = { en: 1, fr: 1 }> = {
    fallbackLang: keyof LANG_IDS;
    column_labels?: DeepPartial<{
        [table_name: string]: {
            [column_name: string]: {
                [lang_id in keyof LANG_IDS]: string
            }
        }
    }>;
}

type ExpressApp = {
    get: (
        routePath: string, 
        cb: (
            req: { 
                params: { name: string },
                cookies: { sid: string }
            },
            res: {
                redirect: (redirectUrl: string) => any;
                contentType: (type: string) => void;
                sendFile: (fileName: string, opts?: { root: string }) => any;
                status: (code: number) => {
                    json: (response: AnyObject) => any;
                }
            }
        ) => any
    ) => any
};

/**
 * Allows uploading and downloading files.
 * Currently supports only S3.
 * 
 * @description
 * Will create a media table that contains file metadata and urls
 * Inserting a file into this table through prostgles will upload it to S3 and insert the relevant metadata into the media table
 * Requesting a file from HTTP GET {fileUrlPath}/{fileId} will:
 *  1. check auth (if provided) 
 *  2. check the permissions in publish (if provided)
 *  3. redirect the request to the signed url (if allowed)
 * 
 * Specifying referencedTables will:
 *  1. create a column in that table called media
 *  2. create a lookup table lookup_media_{referencedTable} that joins referencedTable to the media table 
 */
export type FileTableConfig = {
    tableName?: string; /* defaults to 'media' */
    fileUrlPath?: string; // defaults to tableName
    awsS3Config?: S3Config;
    localConfig?: LocalConfig;
    //  {
    //     region: string; 
    //     bucket: string; 
    //     accessKeyId: string;
    //     secretAccessKey: string;
    // },
    expressApp: ExpressApp;
    referencedTables?: {
        [tableName: string]: "one" | "many"
    },
    imageOptions?: ImageOptions
};

export type ProstglesInitOptions<DBO = DbHandler> = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    tsGeneratedTypesDir?: string;
    io?: any;
    publish?: Publish<DBO>;
    publishMethods?: PublishMethods<DBO>;
    publishRawSQL?(params: PublishParams<DBO>): ( (boolean | "*") | Promise<(boolean | "*")>);
    joins?: Joins;
    schema?: string;
    sqlFilePath?: string;
    onReady(dbo: DBO, db: DB): void;
    transactions?: string | boolean;
    wsChannelNamePrefix?: string;
    onSocketConnect?(socket: Socket, dbo: DBO, db?: DB);
    onSocketDisconnect?(socket: Socket, dbo: DBO, db?: DB);
    auth?: Auth<DBO>;
    DEBUG_MODE?: boolean;
    watchSchema?: boolean | "hotReloadMode" | ((event: { command: string; query: string }) => void);
    keywords?: Keywords;
    onNotice?: (msg: any) => void;
    i18n?: I18N_CONFIG<AnyObject>;
    fileTable?: FileTableConfig;
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

const DEFAULT_KEYWORDS = {
    $filter: "$filter",
    $and: "$and",
    $or: "$or",
    $not: "$not"
};

const fs = require('fs');
export class Prostgles<DBO = DbHandler> {

    opts: ProstglesInitOptions<DBO> = {
        DEBUG_MODE: false,
        dbConnection: {
            host: "localhost",
            port: 5432,
            application_name: "prostgles_app"
        },
        onReady: () => {},
        schema: "public",
        watchSchema: false,
    };

    // dbConnection: DbConnection = {
    //     host: "localhost",
    //     port: 5432,
    //     application_name: "prostgles_app"
    // };
    // dbOptions: DbConnectionOpts;
    db: DB;
    pgp: PGP;
    dbo: DbHandler;
    dboBuilder: DboBuilder;
    publishParser: PublishParser;

    // publishMethods?: ProstglesInitOptions<DBO>["publishMethods"];
    // io: any;
    // publish?: ProstglesInitOptions<DBO>["publish"];
    // joins?: Joins;
    // schema: string = "public";
    // transactions?: string | boolean;
    
    // publishRawSQL?: ProstglesInitOptions<DBO>["publishRawSQL"];
    // wsChannelNamePrefix: string = "_psqlWS_";
    // onSocketConnect?(socket: Socket | any, dbo: DBO, db?: DB);
    // onSocketDisconnect?(socket: Socket | any, dbo: DBO, db?: DB);
    // sqlFilePath?: string;
    // tsGeneratedTypesDir?: string;
    // auth?: ProstglesInitOptions["auth"];
    // DEBUG_MODE?: boolean = false;
    // watchSchema?: ProstglesInitOptions["watchSchema"];// boolean | "hotReloadMode" | ((event: { command: string; query: string }) => void) = false;
    // onReady: (dbo: any, db: DB) => void;
    // i18n?: ProstglesInitOptions["i18n"];
    // fileTable?: FileTableConfig;
    // /**
    //  * Postgres on notice callback
    //  */
    // onNotice?: ProstglesInitOptions["onNotice"];


    keywords = DEFAULT_KEYWORDS;
    private loaded = false;

    dbEventsManager: DBEventsManager;


    fileManager?: FileManager;

    isMedia(tableName: string){
        return this.opts?.fileTable?.tableName === tableName;
    }

    constructor(params: ProstglesInitOptions){
        if(!params) throw "ProstglesInitOptions missing";
        if(!params.io) console.warn("io missing. WebSockets will not be set up");
        
        // TODO: find an exact keyof T<->arr TS matching method
        let config: Array<keyof ProstglesInitOptions> = [
            "transactions", "joins", "tsGeneratedTypesDir",
            "onReady", "dbConnection", "dbOptions", "publishMethods", "io", 
            "publish", "schema", "publishRawSQL", "wsChannelNamePrefix", "onSocketConnect", 
            "onSocketDisconnect", "sqlFilePath", "auth", "DEBUG_MODE", "watchSchema", 
            "i18n", "fileTable"
        ];
        const unknownParams = Object.keys(params).filter((key: string) => !(config as string[]).includes(key))
        if(unknownParams.length){ 
            console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
        }
        
        Object.assign(this.opts, params);

        /* set defaults */
        if(this.opts?.fileTable){
            this.opts.fileTable.tableName = this.opts?.fileTable?.tableName || "media";
        }
        this.opts.schema = this.opts.schema || "public";

        this.keywords = {
            ...DEFAULT_KEYWORDS,
            ...params.keywords,
        }
    }

    destroyed = false;

    async onSchemaChange(event: { command: string; query: string }){
        const { watchSchema, onReady, tsGeneratedTypesDir } = this.opts;
        if(watchSchema && this.loaded){
            console.log("Schema changed");
            
            if(typeof watchSchema === "function"){
                /* Only call the provided func */
                watchSchema(event);

            } else if(watchSchema === "hotReloadMode") {
                if(tsGeneratedTypesDir) {
                    /* Hot reload integration. Will only touch tsGeneratedTypesDir */
                    console.log("watchSchema: Re-writing TS schema");

                    await this.refreshDBO();
                    this.writeDBSchema(true);
                }

            } else if(watchSchema === true){
                /* Full re-init. Sockets must reconnect */
                console.log("watchSchema: Full re-initialisation")
                this.init(onReady);
            }
        }  
    }

    checkDb(){
        if(!this.db || !this.db.connect) throw "something went wrong getting a db connection";
    }

    getTSFileName(){
        const fileName = "DBoGenerated.d.ts" //`dbo_${this.schema}_types.ts`;
        const fullPath = (this.opts.tsGeneratedTypesDir || "") + fileName;
        return { fileName, fullPath }
    }

    private getFileText(fullPath: string, format = "utf8"): Promise<string>{
        return new Promise((resolve, reject) => {
            fs.readFile(fullPath, 'utf8', function(err, data) {
                if(err) reject(err);
                else resolve(data);
            }); 
        })
    }

    writeDBSchema(force = false){

        if(this.opts.tsGeneratedTypesDir){
            const { fullPath, fileName } = this.getTSFileName();
            const header = `/* This file was generated by Prostgles \n` +
            // `* ${(new Date).toUTCString()} \n` 
            `*/ \n\n `;
            const fileContent = header + this.dboBuilder.tsTypesDefinition;
            fs.readFile(fullPath, 'utf8', function(err, data) {
                if (err || (force || data !== fileContent)) {
                    fs.writeFileSync(fullPath, fileContent);
                    console.log("Prostgles: Created typescript schema definition file: \n " + fileName)
                }
            });                
        } else if(force) {
            console.error("Schema changed. tsGeneratedTypesDir needs to be set to reload server")
        }
    }

    async refreshDBO(){
        this.dboBuilder = await DboBuilder.create(this as any) as any;
        this.dbo = this.dboBuilder.dbo as any;
    }

    async init(onReady: (dbo: DBO, db: DB) => any): Promise<{
        db: DbHandler;
        _db: DB;
        pgp: PGP;
        io?: any;
        destroy: () => Promise<boolean>;
    }> {
        this.loaded = false;


        if(this.opts.watchSchema === "hotReloadMode" && !this.opts.tsGeneratedTypesDir) {
            throw "tsGeneratedTypesDir option is needed for watchSchema: hotReloadMode to work ";
        }

        /* 1. Connect to db */
        if(!this.db){
            const { db, pgp } = getDbConnection(this.opts.dbConnection, this.opts.dbOptions, this.opts.DEBUG_MODE, notice => { 
                if(this.opts.onNotice) this.opts.onNotice(notice);
                if(this.dbEventsManager){
                    this.dbEventsManager.onNotice(notice)
                }
            });
            this.db = db;
            this.pgp = pgp;
        }
        this.checkDb();
        const { db, pgp } = this;

        /* 2. Execute any SQL file if provided */
        if(this.opts.sqlFilePath){
            await this.runSQLFile(this.opts.sqlFilePath);
        }

        try {
            /* 3. Make DBO object from all tables and views */
            await this.refreshDBO();
            /* Create media table if required */
            if(this.opts.fileTable){
                const { awsS3Config, localConfig, imageOptions } = this.opts.fileTable;
                if(!awsS3Config && !localConfig) throw "fileTable missing param: Must provide awsS3Config OR localConfig";
                await this.refreshDBO();
                this.fileManager = new FileManager(awsS3Config || localConfig, imageOptions);
                await this.fileManager.init(this as any);
            }
            await this.refreshDBO();


            if(this.opts.publish){

                if(!this.opts.io) console.warn("IO missing. Publish has no effect without io");

                /* 3.9 Check auth config */
                if(this.opts.auth){
                    this.opts.auth.sidKeyName = this.opts.auth.sidKeyName || "session_id";

                    const { sidKeyName, login, getUser, getClientUser } = this.opts.auth;
                    if(typeof sidKeyName !== "string" && !login){
                        throw "Invalid auth: Provide { sidKeyName: string } ";
                    }
                    if(!getUser || !getClientUser) throw "getUser OR getClientUser missing from auth config";
                }

                this.publishParser = new PublishParser(this.opts.publish, this.opts.publishMethods, this.opts.publishRawSQL, this.dbo, this.db, this as any);
                this.dboBuilder.publishParser = this.publishParser;
                /* 4. Set publish and auth listeners */ //makeDBO(db, allTablesViews, pubSubManager, false)
                await this.setSocketEvents();

            } else if(this.opts.auth) throw "Auth config does not work without publish";
            
            // if(this.watchSchema){
            //     if(!(await isSuperUser(db))) throw "Cannot watchSchema without a super user schema. Set watchSchema=false or provide a super user";
            // }

            this.dbEventsManager = new DBEventsManager(db, pgp);
            

            this.writeDBSchema();
            
            /* 5. Finish init and provide DBO object */
            try {
                if(this.destroyed) {
                    console.trace(1)
                }
                onReady(this.dbo as any, this.db);
            } catch(err){
                console.error("Prostgles: Error within onReady: \n", err)
            }

            this.loaded = true;
            return {
                db: this.dbo,
                _db: db,
                pgp,
                io: this.opts.io,
                destroy: async () => {
                    console.log("destroying prgl instance")
                    this.destroyed = true;
                    if(this.opts.io){
                        this.opts.io.on("connection", (socket) => {
                            console.log("Socket connected to destroyed instance")
                        });
                        if(typeof this.opts.io.close === "function"){
                            this.opts.io.close();
                            console.log("this.io.close")
                        }
                    }
                    if(this.dboBuilder.pubSubManager){
                        this.dboBuilder.pubSubManager.destroy();
                    }
                    this.dbo = undefined;
                    this.db = undefined;
                    await db.$pool.end();
                    await sleep(1000);
                    return true;
                }
            };
        } catch (e) {
            console.trace(e)
            throw "init issues: " + e.toString();
        }
    }

    async runSQLFile(filePath: string){
        
        const fileContent = await this.getFileText(filePath);//.then(console.log);

        return this.db.multi(fileContent).then((data)=>{
            console.log("Prostgles: SQL file executed successfuly \n    -> " + filePath, data);
            return true
        }).catch((err) => {
            const { position, length } = err,
                lines = fileContent.split("\n");
            let errMsg = filePath + " error: ";
            
            if(position && length && fileContent){
                const startLine = Math.max(0, fileContent.substring(0, position).split("\n").length - 2),
                    endLine = startLine + 3;

                errMsg += "\n\n";
                errMsg += lines.slice(startLine, endLine).map((txt, i) => `${startLine + i + 1} ${i === 1? "->" : "  "} ${txt}`).join("\n");
                errMsg += "\n\n";
            }
            console.error(errMsg, err);
            throw err;
        });
    }

    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams 
     * @returns string
     */
    getSID(localParams: LocalParams): string {
        if(!this.opts.auth) return null;

        const { sidKeyName } = this.opts.auth;

        if(!sidKeyName || !localParams) return null;

        if(localParams.socket){
            const querySid = localParams.socket?.handshake?.query?.[sidKeyName];
            if(!querySid){
                const cookie_str = get(localParams.socket, "handshake.headers.cookie");
                const cookie = parseCookieStr(cookie_str);
                return cookie[sidKeyName];
            }

        } else if(localParams.httpReq){
            return localParams.httpReq?.cookies?.[sidKeyName];

        } else throw "socket OR httpReq missing from localParams";

        function parseCookieStr(cookie_str: string): any {
            if(!cookie_str || typeof cookie_str !== "string") return {}
            return cookie_str.replace(/\s/g, '').split(";").reduce((prev, current) => {
                const [name, value] = current.split('=');
                prev[name] = value;
                return prev
            }, {});
        }
    }

    async getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<ClientInfo>{
        if(this.opts.auth){
            const { getUser, getClientUser } = this.opts.auth;
    
            if(getUser){
                const sid = this.getSID(localParams);
                return {
                    sid,
                    user: await getUser(sid, this.dbo as any, this.db),
                    clientUser: await getClientUser(sid, this.dbo as any, this.db)
                }
            }
        }

        return {};
    }

    // async getUserFromCookieSession(localParams: LocalParams): Promise<null | { user: any, clientUser: any }>{
       
    //     // console.log("conn", socket.handshake.query, socket._session)
    //     const sid = this.getSID(localParams);

    //     const { getUser, getClientUser } = this.auth;

    //     const user = await getUser(sid, this.dbo, this.db);
    //     const clientUser = await getClientUser(sid, this.dbo, this.db);

    //     if(!user) return undefined;
    //     return { user, clientUser };
    // }

    connectedSockets: any[] = [];
    async setSocketEvents(){
        this.checkDb();

        if(!this.dbo) throw "dbo missing";

        let publishParser = new PublishParser(this.opts.publish, this.opts.publishMethods, this.opts.publishRawSQL, this.dbo, this.db, this as any);
        this.publishParser = publishParser;

        if(!this.opts.io) return;

        /* Already initialised. Only reconnect sockets */
        if(this.connectedSockets.length){
            this.connectedSockets.forEach((s: any) => {
                s.emit(CHANNELS.SCHEMA_CHANGED);
                this.pushSocketSchema(s);
            });
            return;
        }
        
        /* Initialise */
        this.opts.io.on('connection', async (socket) => {
            if(this.destroyed){
                console.log("Socket connected to destroyed instance");
                socket.disconnect();
                return
            }
            this.connectedSockets.push(socket);

            if(!this.db || !this.dbo) throw "db/dbo missing";
            let { dbo, db, pgp } = this;
            
            try {
                if(this.opts.onSocketConnect) await this.opts.onSocketConnect(socket, dbo as any, db);

                
                /*  RUN Client request from Publish.
                    Checks request against publish and if OK run it with relevant publish functions. Local (server) requests do not check the policy 
                */
                socket.removeAllListeners(CHANNELS.DEFAULT)
                socket.on(CHANNELS.DEFAULT, async ({ tableName, command, param1, param2, param3 }: SocketRequestParams, cb = (...callback) => {} ) => {
                    
                    try { /* Channel name will only include client-sent params so we ignore table_rules enforced params */
                        if(!socket) {
                            console.error("socket missing??!!")
                            throw "socket missing??!!";
                        }

                        const clientInfo = await this.getClientInfo({ socket });
                        let valid_table_command_rules = await this.publishParser.getValidatedRequestRule({ tableName, command, localParams: { socket } }, clientInfo);
                        if(valid_table_command_rules){
                            let res = await this.dbo[tableName][command](param1, param2, param3, valid_table_command_rules, { socket, has_rules: true }); 
                            cb(null, res);
                        } else throw `Invalid OR disallowed request: ${tableName}.${command} `;
                            
                    } catch(err) {
                        // const _err_msg = err.toString();
                        // cb({ msg: _err_msg, err });
                        console.trace(err);
                        cb(err)
                        // console.warn("runPublishedRequest ERROR: ", err, socket._user);
                    }
                });

                socket.on("disconnect", () => {
                    this.dbEventsManager.removeNotice(socket);
                    this.dbEventsManager.removeNotify(socket);
                    this.connectedSockets = this.connectedSockets.filter(s => s.id !== socket.id);
                    // subscriptions = subscriptions.filter(sub => sub.socket.id !== socket.id);
                    if(this.opts.onSocketDisconnect){
                        this.opts.onSocketDisconnect(socket, dbo as any);
                    };
                });

                socket.removeAllListeners(CHANNELS.METHOD)
                socket.on(CHANNELS.METHOD, async ({ method, params }: SocketMethodRequest, cb = (...callback) => {} ) => {
                    try {
                        const methods = await this.publishParser.getMethods(socket);
                        
                        if(!methods || !methods[method]){
                            cb("Disallowed/missing method " + JSON.stringify(method));
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
                
                this.pushSocketSchema(socket);
            } catch(e) {
                console.trace("setSocketEvents: ", e)
            }        
        });
    }

    pushSocketSchema = async (socket: any) => {

        let auth: any = {};
        if(this.opts.auth){
            const { register, login, logout, sidKeyName } = this.opts.auth;

            /**
             * Why ??? Collision with socket.io ???
             */
            if(sidKeyName === "sid") throw "sidQueryParamName cannot be 'sid' please provide another name.";

            let handlers = [
                { func: register,   ch: CHANNELS.REGISTER,   name: "register"    },
                { func: login,      ch: CHANNELS.LOGIN,      name: "login"       },
                { func: logout,     ch: CHANNELS.LOGOUT,     name: "logout"      }
            ].filter(h => h.func);

            const usrData = await this.getClientInfo({ socket });
            if(usrData){
                auth.user = usrData.clientUser;
                handlers = handlers.filter(h => h.name === "logout");
            }

            handlers.map(({ func, ch, name }) => {
                auth[name] = true;
                
                socket.removeAllListeners(ch)
                socket.on(ch, async (params: any, cb = (...callback) => {} ) => {
                    
                    try {
                        if(!socket) throw "socket missing??!!";

                        const res = await func(params, dbo as any, db);
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
        
        // let needType = this.publishRawSQL && typeof this.publishRawSQL === "function";
        // let DATA_TYPES = !needType? [] : await this.db.any("SELECT oid, typname FROM pg_type");
        // let USER_TABLES = !needType? [] :  await this.db.any("SELECT relid, relname FROM pg_catalog.pg_statio_user_tables");

        let schema: any = {};
        let publishValidationError;
        let rawSQL = false;
        
        const { dbo, db, pgp, publishParser } = this;
        try {
            schema = await publishParser.getSchemaFromPublish(socket);
            // console.log("getSchemaFromPublish", Object.keys(schema), this.dboBuilder.tablesOrViews.map(t => `${t.name} (${t.columns.map(c => c.name).join(", ")})`))
        } catch(e){
            publishValidationError = "Server Error: PUBLISH VALIDATION ERROR";
            console.error(`\nProstgles PUBLISH VALIDATION ERROR (after socket connected):\n    ->`, e);
        }
        socket.prostgles = socket.prostgles || {};
        socket.prostgles.schema = schema;
        /*  RUN Raw sql from client IF PUBLISHED
        */
        let fullSchema = [];
        let allTablesViews = this.dboBuilder.tablesOrViews;
        if(this.opts.publishRawSQL && typeof this.opts.publishRawSQL === "function"){
            const canRunSQL = async () => {
                const publishParams = await this.publishParser.getPublishParams({ socket })
                let res = await this.opts.publishRawSQL(publishParams as any);
                return Boolean(res && typeof res === "boolean" || res === "*");
            } 

            // console.log("canRunSQL", canRunSQL, socket.handshake.headers["x-real-ip"]);//, allTablesViews);

            if(await canRunSQL()){
                socket.removeAllListeners(CHANNELS.SQL)
                socket.on(CHANNELS.SQL, async ({ query, params, options }: SQLRequest, cb = (...callback) => {}) => {

                    if(!this.dbo.sql) throw "Internal error: sql handler missing";

                    this.dbo.sql(query, params, options, { socket }).then(res => {
                        cb(null, res)
                    }).catch(err => {
                        makeSocketError(cb, err);
                    })

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
                if(db){
                    // let allTablesViews = await db.any(STEP2_GET_ALL_TABLES_AND_COLUMNS);
                    fullSchema = allTablesViews;
                    rawSQL = true;
                } else console.error("db missing");
            }
        }

        // let joinTables = [];
        let joinTables2 = [];
        if(this.opts.joins){
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
        
        const methods = await publishParser.getMethods(socket);
        
        socket.emit(CHANNELS.SCHEMA, {
            schema, 
            methods: Object.keys(methods), 
            ...(fullSchema? { fullSchema } : {}),
            rawSQL,
            joinTables: joinTables2,
            auth,
            version,
            err: publishValidationError
        });
    }
}
function makeSocketError(cb, err){
    const err_msg = (err instanceof Error)? 
    err.toString() : 
        isPlainObject(err)?
        JSON.stringify(err, null, 2) : 
            err.toString(),
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
    socket?: any;
    httpReq?: any;
}

type DboTable = Request & {
    tableName: string;
    localParams: LocalParams;
}
type DboTableCommand = Request & DboTable & {
    command: string;
    localParams: LocalParams;
}

// const insertParams: Array<keyof InsertRule> = ["fields", "forcedData", "returningFields", "validate"];

const RULE_TO_METHODS = [
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
       methods: ["update", "upsert", "updateBatch"], 
       no_limits: <UpdateRule>{ fields: "*", filterFields: "*", returningFields: "*"  },
       table_only: true, 
       allowed_params: <Array<keyof UpdateRule>>["fields", "filterFields", "forcedFilter", "forcedData", "returningFields", "validate"] ,
       hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
    },
   { 
       rule: "select", 
       methods: ["findOne", "find", "count", "getColumns", "getInfo"], 
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
        rule: "subscribe", methods: ["unsubscribe", "subscribe", "subscribeOne"], 
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
    dbo: DbHandler;
    db: DB
    prostgles: Prostgles;

    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler, db: DB, prostgles: Prostgles){
        this.publish = publish;
        this.publishMethods = publishMethods;
        this.publishRawSQL = publishRawSQL;
        this.dbo = dbo;
        this.db = db;
        this.prostgles = prostgles;

        if(!this.dbo || !this.publish) throw "INTERNAL ERROR: dbo and/or publish missing";
    }

    async getPublishParams(localParams: LocalParams, clientInfo?: ClientInfo): Promise<PublishParams> {
        return {
            ...(clientInfo || await this.prostgles.getClientInfo(localParams)),
            dbo: this.dbo,
            db: this.db
        }
    }

    async getMethods(socket: any){
        let methods = {};
    
        const publishParams = await this.getPublishParams({ socket });
        const _methods = await applyParamsIfFunc(this.publishMethods, publishParams);
    
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
    async getPublish(localParams: LocalParams, clientInfo?: ClientInfo): Promise<PublishObject> {
        const publishParams: PublishParams = await this.getPublishParams(localParams, clientInfo)
        let _publish = await applyParamsIfFunc(this.publish, publishParams );

        if(_publish === "*"){
            let publish = {}
            this.prostgles.dboBuilder.tablesOrViews.map(tov => {
                publish[tov.name] = "*";
            });
            return publish;
        }

        return _publish;
    }
    async getValidatedRequestRuleWusr({ tableName, command, localParams }: DboTableCommand): Promise<TableRule>{
        const clientInfo = await this.prostgles.getClientInfo(localParams);
        return await this.getValidatedRequestRule({ tableName, command, localParams }, clientInfo);
    }
    
    async getValidatedRequestRule({ tableName, command, localParams }: DboTableCommand, clientInfo: ClientInfo): Promise<TableRule>{
        if(!this.dbo) throw "INTERNAL ERROR: dbo is missing";

        if(!command || !tableName) throw "command OR tableName are missing";

        let rtm = RULE_TO_METHODS.find(rtms => rtms.methods.includes(command));
        if(!rtm){
            throw "Invalid command: " + command;
        }

        /* Must be local request -> allow everything */
        if(!localParams) return undefined;

        /* Must be from socket. Must have a publish */
        if(!this.publish) throw "publish is missing";

        /* Get any publish errors for socket */
        const schm = localParams?.socket?.prostgles?.schema?.[tableName]?.[command];

        // console.log(schm, get(socket, `prostgles.schema`));
        if(schm && schm.err) throw schm.err;

        let table_rule = await this.getTableRules({ tableName, localParams }, clientInfo);
        if(!table_rule) throw "Invalid or disallowed table: " + tableName;

        if(command === "upsert"){
            if(!table_rule.update || !table_rule.insert){
                throw `Invalid or disallowed command: upsert`;
            }
        }

        if(rtm && table_rule && table_rule[rtm.rule]){
            return table_rule;
        } else throw `Invalid or disallowed command: ${command}`;
    }
    
    async getTableRules({ tableName, localParams }: DboTable, clientInfo: ClientInfo): Promise<PublishTable> {
        
        try {
            if(!localParams || !tableName) throw "publish OR socket OR dbo OR tableName are missing";
    
            let _publish = await this.getPublish(localParams, clientInfo);
    
            let table_rules = _publish[tableName];// applyParamsIfFunc(_publish[tableName],  localParams, this.dbo, this.db, user);

            /* Get view or table specific rules */
            const is_view = (this.dbo[tableName] as TableHandler | ViewHandler).is_view,
                MY_RULES = RULE_TO_METHODS.filter(r => !is_view || !r.table_only);

            // if(tableName === "various") console.warn(1033, MY_RULES)
            if(table_rules){

                /* All methods allowed. Add no limits for table rules */
                if([true, "*"].includes(table_rules as any)){
                    table_rules = {};
                    MY_RULES.map(r => {
                        table_rules[r.rule] = { ...r.no_limits };
                    });
                    // if(tableName === "various") console.warn(1042, table_rules)
                }

                /* Add implied methods if not falsy */
                MY_RULES.map(r => {

                    if ([true, "*"].includes(table_rules[r.rule]) && r.no_limits) {
                        table_rules[r.rule] = Object.assign({}, r.no_limits);
                    }
                    if(table_rules[r.rule]){
                        r.methods.map(method => {
                            if(table_rules[method] === undefined){
                                const publishedTable = (table_rules as PublishTable);
                                if(method === "updateBatch" && !publishedTable.update){
                                
                                } else if(method === "upsert" && (!publishedTable.update || !publishedTable.insert)){
                                    // return;
                                } else {
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
                if(Object.keys(table_rules).length){
                    const ruleKeys = Object.keys(table_rules)
                    
                    ruleKeys.filter(m => table_rules[m])
                        .find(method => {
                            let rm = MY_RULES.find(r => r.rule === method || r.methods.includes(method));
                            if(!rm){
                                throw `Invalid rule in publish.${tableName} -> ${method} \nExpecting any of: ${flat(MY_RULES.map(r => [r.rule, ...r.methods])).join(", ")}`;
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

                            /* Enable subscribe if not explicitly disabled */
                            if(method === "select" && !ruleKeys.includes("subscribe")){
                                const sr = MY_RULES.find(r => r.rule === "subscribe");
                                if(sr){
                                    table_rules[sr.rule] = { ...sr.no_limits };
                                    (table_rules as PublishTable).subscribeOne = { ...sr.no_limits };
                                }
                            }
                        });                
                }
            }
            
            return table_rules as PublishTable;
        } catch (e) {
            throw e;
        }
    }


    
    /* Prepares schema for client. Only allowed views and commands will be present */
    async getSchemaFromPublish(socket: any){
        let schema = {};
        
        try {
            /* Publish tables and views based on socket */
            const clientInfo = await this.prostgles.getClientInfo({ socket });
            let _publish = await this.getPublish(socket, clientInfo);

    
            if(_publish && Object.keys(_publish).length){
                let txKey = "tx";
                if(!this.prostgles.opts.transactions) txKey = "";
                if(typeof this.prostgles.opts.transactions === "string") txKey = this.prostgles.opts.transactions;
                
                const tableNames = Object.keys(_publish).filter(k => !txKey || txKey !== k);
                
                await Promise.all(tableNames                 
                    .map(async tableName => {
                        if(!this.dbo[tableName]) {
                            throw `Table ${tableName} does not exist
                            Expecting one of: ${this.prostgles.dboBuilder.tablesOrViews.map(tov => tov.name).join(", ")}
                            DBO tables: ${Object.keys(this.dbo).filter(k => (this.dbo[k] as any).find).join(", ")}
                            `;
                        }

                        const table_rules = await this.getTableRules({ localParams: {socket}, tableName }, clientInfo);
            
                        if(table_rules && Object.keys(table_rules).length){
                            schema[tableName] = {};
                            let methods = [];
        
                            if(typeof table_rules === "object"){
                                methods = Object.keys(table_rules);
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
                                            let valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, localParams: {socket} }, clientInfo);
                                            await this.dbo[tableName][method]({}, {}, {}, valid_table_command_rules, { socket, has_rules: true, testRule: true }); 
                                                
                                        } catch(e) {
                                            err = "INTERNAL PUBLISH ERROR";
                                            schema[tableName][method] = { err };

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

    // console.log(schema)

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
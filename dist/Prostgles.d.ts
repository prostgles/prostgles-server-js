/// <reference types="node" />
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { DboBuilder, DbHandler, LocalParams } from "./DboBuilder";
export { DbHandler };
export declare type PGP = pgPromise.IMain<{}, pg.IClient>;
import { AnyObject } from "prostgles-types";
import { DBEventsManager } from "./DBEventsManager";
export declare type DB = pgPromise.IDatabase<{}, pg.IClient>;
declare type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
declare type DbConnectionOpts = pg.IDefaults;
import { Socket } from "dgram";
import { FieldFilter, SelectParamsBasic as SelectParams } from "prostgles-types";
export declare type InsertRequestData = {
    data: object | object[];
    returning: FieldFilter;
};
export declare type SelectRequestData = {
    filter: object;
    params: SelectParams;
};
export declare type DeleteRequestData = {
    filter: object;
    returning: FieldFilter;
};
export declare type UpdateRequestDataOne = {
    filter: object;
    data: object;
    returning: FieldFilter;
};
export declare type UpdateReq = {
    filter: object;
    data: object;
};
export declare type UpdateRequestDataBatch = {
    data: UpdateReq[];
};
export declare type UpdateRequestData = UpdateRequestDataOne | UpdateRequestDataBatch;
export declare type SelectRule = {
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
    validate?(SelectRequestData: any): SelectRequestData;
    /**
     * Allows clients to get column information on any columns that are allowed in any rules. True by default.
     */
    getColumns?: boolean;
    /**
     * Allows clients to get table information (oid, comment). True by default.
     */
    getInfo?: boolean;
};
export declare type InsertRule = {
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
     * Validation logic to check/update data for each request. Happens before field check
     */
    preValidate?: (row: object) => object | Promise<object>;
    /**
     * Validation logic to check/update data for each request. Happens after field check
     */
    validate?: (row: object) => object | Promise<object>;
};
export declare type UpdateRule = {
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
    validate?: (row: object) => object | Promise<object>;
};
export declare type DeleteRule = {
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
    validate?(...UpdateRequestData: any[]): UpdateRequestData;
};
export declare type SyncRule = {
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
};
export declare type SubscribeRule = {
    throttle?: number;
};
export declare type TableRule = {
    select?: SelectRule;
    insert?: InsertRule;
    update?: UpdateRule;
    delete?: DeleteRule;
    sync?: SyncRule;
    subscribe?: SubscribeRule;
};
export declare type ViewRule = {
    select: SelectRule;
};
export declare type PublishTableRule = {
    select?: SelectRule | "*" | false | null;
    insert?: InsertRule | "*" | false | null;
    update?: UpdateRule | "*" | false | null;
    delete?: DeleteRule | "*" | false | null;
    sync?: SyncRule;
    subscribe?: SubscribeRule | "*";
};
export declare type PublishViewRule = {
    select: SelectRule | "*" | false | null;
};
export declare type RequestParams = {
    dbo?: DbHandler;
    socket?: any;
};
export declare type PublishAllOrNothing = "*" | false | null;
export declare type PublishObject = {
    [table_name: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing);
};
export declare type PublishTable = {
    [table_name: string]: (PublishTableRule | PublishViewRule);
};
export declare type PublishedResult = PublishAllOrNothing | PublishObject;
export declare type PublishParams<DBO = DbHandler> = {
    sid?: string;
    dbo?: DBO;
    db?: DB;
    user?: AnyObject;
};
export declare type Publish<DBO> = (params: PublishParams<DBO>) => (PublishedResult | Promise<PublishedResult>);
export declare type Method = (...args: any) => (any | Promise<any>);
export declare const JOIN_TYPES: readonly ["one-many", "many-one", "one-one", "many-many"];
export declare type Join = {
    tables: [string, string];
    on: {
        [key: string]: string;
    };
    type: typeof JOIN_TYPES[number];
};
export declare type Joins = Join[] | "inferred";
export declare type PublishMethods<DBO> = (params: PublishParams<DBO>) => {
    [key: string]: Method;
} | Promise<{
    [key: string]: Method;
}>;
export declare type BasicSession = {
    sid: string;
    expires: number;
};
export declare type AuthClientRequest = {
    socket: any;
} | {
    httpReq: any;
};
export declare type Auth<DBO = DbHandler> = {
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
    };
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
};
export declare type ClientInfo = {
    user?: AnyObject;
    clientUser?: AnyObject;
    sid?: string;
};
declare type Keywords = {
    $and: string;
    $or: string;
    $not: string;
};
export declare type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
};
export declare type I18N_CONFIG<LANG_IDS = {
    en: 1;
    fr: 1;
}> = {
    fallbackLang: keyof LANG_IDS;
    column_labels?: DeepPartial<{
        [table_name: string]: {
            [column_name: string]: {
                [lang_id in keyof LANG_IDS]: string;
            };
        };
    }>;
};
declare type ExpressApp = {
    get: (routePath: string, cb: (req: {
        params: {
            id: string;
        };
        cookies: {
            sid: string;
        };
    }, res: {
        redirect: (redirectUrl: string) => any;
        status: (code: number) => {
            json: (response: AnyObject) => any;
        };
    }) => any) => any;
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
export declare type FileTableConfig = {
    tableName?: string;
    fileUrlPath?: string;
    awsS3Config: {
        region: string;
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
    };
    expressApp: ExpressApp;
    referencedTables?: {
        [tableName: string]: "one" | "many";
    };
};
export declare type ProstglesInitOptions<DBO = DbHandler> = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    tsGeneratedTypesDir?: string;
    io?: any;
    publish?: Publish<DBO>;
    publishMethods?: PublishMethods<DBO>;
    publishRawSQL?(params: PublishParams<DBO>): ((boolean | "*") | Promise<(boolean | "*")>);
    joins?: Joins;
    schema?: string;
    sqlFilePath?: string;
    onReady(dbo: DBO, db: DB): void;
    transactions?: string | boolean;
    wsChannelNamePrefix?: string;
    onSocketConnect?(socket: Socket, dbo: DBO, db?: DB): any;
    onSocketDisconnect?(socket: Socket, dbo: DBO, db?: DB): any;
    auth?: Auth<DBO>;
    DEBUG_MODE?: boolean;
    watchSchema?: boolean | "hotReloadMode" | ((event: {
        command: string;
        query: string;
    }) => void);
    keywords?: Keywords;
    onNotice?: (msg: any) => void;
    i18n?: I18N_CONFIG<AnyObject>;
    fileTable?: FileTableConfig;
};
export declare type OnReady = {
    dbo: DbHandler;
    db: DB;
};
export declare class Prostgles<DBO = DbHandler> {
    opts: ProstglesInitOptions<DBO>;
    db: DB;
    pgp: PGP;
    dbo: DbHandler;
    dboBuilder: DboBuilder;
    publishParser: PublishParser;
    keywords: {
        $filter: string;
        $and: string;
        $or: string;
        $not: string;
    };
    private loaded;
    dbEventsManager: DBEventsManager;
    private fileManager?;
    constructor(params: ProstglesInitOptions);
    destroyed: boolean;
    onSchemaChange(event: {
        command: string;
        query: string;
    }): Promise<void>;
    checkDb(): void;
    getTSFileName(): {
        fileName: string;
        fullPath: string;
    };
    private getFileText;
    writeDBSchema(force?: boolean): void;
    refreshDBO(): Promise<void>;
    init(onReady: (dbo: DBO, db: DB) => any): Promise<{
        db: DbHandler;
        _db: DB;
        pgp: PGP;
        io?: any;
        destroy: () => Promise<boolean>;
    }>;
    runSQLFile(filePath: string): Promise<boolean>;
    /**
     * Will return first sid value found in : http cookie or query params
     * Based on sid names in auth
     * @param localParams
     * @returns string
     */
    getSID(localParams: LocalParams): string;
    getClientInfo(localParams: Pick<LocalParams, "socket" | "httpReq">): Promise<ClientInfo>;
    connectedSockets: any[];
    setSocketEvents(): Promise<void>;
    pushSocketSchema: (socket: any) => Promise<void>;
}
declare type Request = {
    socket?: any;
    httpReq?: any;
};
declare type DboTable = Request & {
    tableName: string;
    localParams: LocalParams;
};
declare type DboTableCommand = Request & DboTable & {
    command: string;
    localParams: LocalParams;
};
export declare function flat(arr: any): any;
export declare class PublishParser {
    publish: any;
    publishMethods?: any;
    publishRawSQL?: any;
    dbo: DbHandler;
    db: DB;
    prostgles: Prostgles;
    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler, db: DB, prostgles: Prostgles);
    getPublishParams(localParams: LocalParams, clientInfo?: ClientInfo): Promise<PublishParams>;
    getMethods(socket: any): Promise<{}>;
    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket
     * @param user
     */
    getPublish(localParams: LocalParams, clientInfo?: ClientInfo): Promise<PublishObject>;
    getValidatedRequestRuleWusr({ tableName, command, localParams }: DboTableCommand): Promise<TableRule>;
    getValidatedRequestRule({ tableName, command, localParams }: DboTableCommand, clientInfo: ClientInfo): Promise<TableRule>;
    getTableRules({ tableName, localParams }: DboTable, clientInfo: ClientInfo): Promise<PublishTable>;
    getSchemaFromPublish(socket: any): Promise<{}>;
}
export declare function isSuperUser(db: DB): Promise<boolean>;
//# sourceMappingURL=Prostgles.d.ts.map
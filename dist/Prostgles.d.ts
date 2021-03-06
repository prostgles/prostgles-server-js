/// <reference types="node" />
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { DboBuilder, DbHandler, DbHandlerTX } from "./DboBuilder";
export declare type PGP = pgPromise.IMain<{}, pg.IClient>;
export { DbHandler, DbHandlerTX } from "./DboBuilder";
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
export declare type PublishAllOrNothing = string | "*" | false | null;
export declare type PublishedTablesAndViews = PublishAllOrNothing | {
    [key: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing);
};
export declare type Publish = PublishedTablesAndViews | ((socket?: any, dbo?: DbHandler | DbHandlerTX | any, db?: DB, user?: any) => (PublishedTablesAndViews | Promise<PublishedTablesAndViews>));
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
export declare type publishMethods = (socket?: any, dbo?: DbHandler | DbHandlerTX | any, db?: DB, user?: any) => {
    [key: string]: Method;
} | Promise<{
    [key: string]: Method;
}>;
export declare type BasicSession = {
    sid: string;
    expires: number;
};
export declare type SessionIDs = {
    sidCookie?: string;
    sidQuery?: string;
    sid: string;
};
export declare type Auth = {
    sidQueryParamName?: string;
    sidCookieName?: string;
    getUser: (params: SessionIDs, dbo: any, db: DB, socket: any) => Promise<object | null | undefined>;
    getClientUser: (params: SessionIDs, dbo: any, db: DB, socket: any) => Promise<object>;
    register?: (params: any, dbo: any, db: DB, socket: any) => Promise<BasicSession>;
    login?: (params: any, dbo: any, db: DB, socket: any) => Promise<BasicSession>;
    logout?: (params: SessionIDs, dbo: any, db: DB, socket: any) => Promise<any>;
};
declare type Keywords = {
    $and: string;
    $or: string;
    $not: string;
};
export declare type ProstglesInitOptions = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    tsGeneratedTypesDir?: string;
    io?: any;
    publish?: Publish;
    publishMethods?: publishMethods;
    publishRawSQL?(socket?: any, dbo?: DbHandler | DbHandlerTX | any, db?: DB, user?: any): ((boolean | "*") | Promise<(boolean | "*")>);
    joins?: Joins;
    schema?: string;
    sqlFilePath?: string;
    onReady(dbo: any, db: DB): void;
    transactions?: string | boolean;
    wsChannelNamePrefix?: string;
    onSocketConnect?(socket: Socket, dbo: any, db?: DB): any;
    onSocketDisconnect?(socket: Socket, dbo: any, db?: DB): any;
    auth?: Auth;
    DEBUG_MODE?: boolean;
    watchSchema?: boolean | "hotReloadMode" | ((event: {
        command: string;
        query: string;
    }) => void);
    keywords?: Keywords;
    onNotice?: (msg: any) => void;
};
export declare type OnReady = {
    dbo: DbHandler;
    db: DB;
};
export declare class Prostgles {
    dbConnection: DbConnection;
    dbOptions: DbConnectionOpts;
    db: DB;
    pgp: PGP;
    dbo: DbHandler | DbHandlerTX;
    dboBuilder: DboBuilder;
    publishMethods?: publishMethods;
    io: any;
    publish?: Publish;
    joins?: Joins;
    schema: string;
    transactions?: string | boolean;
    publishRawSQL?: any;
    wsChannelNamePrefix: string;
    onSocketConnect?(socket: Socket | any, dbo: any, db?: DB): any;
    onSocketDisconnect?(socket: Socket | any, dbo: any, db?: DB): any;
    sqlFilePath?: string;
    tsGeneratedTypesDir?: string;
    publishParser: PublishParser;
    auth?: Auth;
    DEBUG_MODE?: boolean;
    watchSchema?: boolean | "hotReloadMode" | ((event: {
        command: string;
        query: string;
    }) => void);
    private loaded;
    keywords: {
        $filter: string;
        $and: string;
        $or: string;
        $not: string;
    };
    onReady: (dbo: any, db: DB) => void;
    /**
     * Postgres on notice callback
     */
    onNotice?: ProstglesInitOptions["onNotice"];
    dbEventsManager: DBEventsManager;
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
    init(onReady: (dbo: DbHandler | DbHandlerTX, db: DB) => any): Promise<{
        db: DbHandlerTX;
        _db: DB;
        pgp: PGP;
        io?: any;
        destroy: () => Promise<undefined>;
    }>;
    runSQLFile(filePath: string): Promise<boolean | void>;
    getSID(socket: any): SessionIDs;
    getUser(socket: any): Promise<object>;
    getUserFromCookieSession(socket: any): Promise<null | {
        user: any;
        clientUser: any;
    }>;
    connectedSockets: any[];
    setSocketEvents(): Promise<void>;
    pushSocketSchema: (socket: any) => Promise<void>;
}
declare type Request = {
    socket: any;
};
declare type DboTable = Request & {
    tableName: string;
};
declare type DboTableCommand = Request & DboTable & {
    command: string;
};
export declare function flat(arr: any): any;
export declare class PublishParser {
    publish: any;
    publishMethods?: any;
    publishRawSQL?: any;
    dbo: DbHandler | DbHandlerTX;
    db: DB;
    prostgles: Prostgles;
    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler | DbHandlerTX, db: DB, prostgles: Prostgles);
    getMethods(socket: any): Promise<{}>;
    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket
     * @param user
     */
    getPublish(socket: any, user: any): Promise<any>;
    getValidatedRequestRuleWusr({ tableName, command, socket }: DboTableCommand): Promise<TableRule>;
    getValidatedRequestRule({ tableName, command, socket }: DboTableCommand, user: any): Promise<TableRule>;
    getTableRules({ tableName, socket }: DboTable, user: any): Promise<any>;
    getSchemaFromPublish(socket: any): Promise<{}>;
}
export declare function isSuperUser(db: DB): Promise<boolean>;
//# sourceMappingURL=Prostgles.d.ts.map
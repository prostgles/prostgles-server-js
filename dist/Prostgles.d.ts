/// <reference types="node" />
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { DboBuilder, DbHandler, DbHandlerTX } from "./DboBuilder";
declare type PGP = pgPromise.IMain<{}, pg.IClient>;
export declare type DB = pgPromise.IDatabase<{}, pg.IClient>;
declare type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
declare type DbConnectionOpts = pg.IDefaults;
import { Socket } from "dgram";
import { FieldFilter, SelectParams } from "prostgles-types";
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
    maxLimit?: number;
    forcedFilter?: object;
    filterFields?: FieldFilter;
    validate?(SelectRequestData: any): SelectRequestData;
};
export declare type InsertRule = {
    fields: FieldFilter;
    forcedData?: object;
    returningFields?: FieldFilter;
    preValidate?: (row: object) => object | Promise<object>;
    validate?: (row: object) => object | Promise<object>;
};
export declare type UpdateRule = {
    fields: FieldFilter;
    forcedFilter?: object;
    forcedData?: object;
    filterFields?: FieldFilter;
    returningFields?: FieldFilter;
    validate?: (row: object) => object | Promise<object>;
};
export declare type DeleteRule = {
    forcedFilter?: object;
    filterFields?: FieldFilter;
    returningFields?: FieldFilter;
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
    getColumns: boolean;
};
export declare type RequestParams = {
    dbo?: DbHandler;
    socket?: any;
};
export declare type PublishedTablesAndViews = {
    [key: string]: PublishTableRule | PublishViewRule | "*" | false | null;
} | "*";
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
export declare type Auth = {
    sidCookieName?: string;
    getUser: ({ sid: string }: {
        sid: any;
    }, dbo: any, db: DB, socket: any) => Promise<object | null | undefined>;
    getClientUser: ({ sid: string }: {
        sid: any;
    }, dbo: any, db: DB, socket: any) => Promise<object>;
    register?: (params: any, dbo: any, db: DB, socket: any) => Promise<BasicSession>;
    login?: (params: any, dbo: any, db: DB, socket: any) => Promise<BasicSession>;
    logout?: (sid: string, dbo: any, db: DB, socket: any) => Promise<any>;
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
    constructor(params: ProstglesInitOptions);
    checkDb(): void;
    init(onReady: (dbo: DbHandler | DbHandlerTX, db: DB) => any): Promise<boolean>;
    runSQLFile(filePath: string): Promise<void>;
    getSID(socket: any): any;
    getUser(socket: any): Promise<object>;
    getUserFromCookieSession(socket: any): Promise<null | {
        user: any;
        clientUser: any;
    }>;
    setSocketEvents(): Promise<void>;
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
    getSchemaFromPublish(socket: any): Promise<{}>;
    getPublish(socket: any, user: any): Promise<any>;
    getValidatedRequestRuleWusr({ tableName, command, socket }: DboTableCommand): Promise<TableRule>;
    getValidatedRequestRule({ tableName, command, socket }: DboTableCommand, user: any): Promise<TableRule>;
    getTableRules({ tableName, socket }: DboTable, user: any): Promise<any>;
}
export {};
//# sourceMappingURL=Prostgles.d.ts.map
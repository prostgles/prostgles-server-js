/// <reference types="node" />
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { DboBuilder, DbHandler } from "./DboBuilder";
export declare type DB = pgPromise.IDatabase<{}, pg.IClient>;
declare type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
declare type DbConnectionOpts = pg.IDefaults;
/**
 * [{ field_name: (true | false) }]
 * true -> ascending
 * false -> descending
 * Array order is maintained
 */
export declare type OrderBy = {
    key: string;
    asc: boolean;
}[] | {
    [key: string]: boolean;
}[] | string | string[];
import { FieldFilter } from "./DboBuilder";
import { Socket } from "dgram";
export declare type SelectParams = {
    select?: FieldFilter;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    expectOne?: boolean;
};
export declare type UpdateParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
    multi?: boolean;
};
export declare type InsertParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
};
export declare type DeleteParams = {
    returning?: FieldFilter;
};
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
    fields: FieldFilter;
    maxLimit?: number;
    forcedFilter?: object;
    filterFields?: FieldFilter;
    validate?(...SelectRequestData: any[]): SelectRequestData;
};
export declare type InsertRule = {
    fields: FieldFilter;
    forcedData?: object;
    returningFields?: FieldFilter;
    validate?(...InsertRequestData: any[]): InsertRequestData;
};
export declare type UpdateRule = {
    fields: FieldFilter;
    forcedFilter?: object;
    forcedData?: object;
    filterFields?: FieldFilter;
    returningFields?: FieldFilter;
    validate?(...UpdateRequestData: any[]): UpdateRequestData;
};
export declare type DeleteRule = {
    forcedFilter?: object;
    filterFields?: FieldFilter;
    returningFields?: FieldFilter;
    validate?(...UpdateRequestData: any[]): UpdateRequestData;
};
export declare type SyncRule = {
    id_fields: string[];
    synced_field: string;
    allow_delete?: boolean;
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
    select?: SelectRule | "*";
    insert?: InsertRule | "*";
    update?: UpdateRule | "*";
    delete?: DeleteRule | "*";
    sync?: SyncRule;
    subscribe?: SubscribeRule | "*";
};
export declare type PublishViewRule = {
    select: SelectRule | "*";
};
export declare type RequestParams = {
    dbo?: DbHandler;
    socket?: any;
};
export declare type PublishedTablesAndViews = {
    [key: string]: PublishTableRule | PublishViewRule | "*";
} | "*";
export declare type Publish = PublishedTablesAndViews | ((socket?: any, dbo?: DbHandler) => (PublishedTablesAndViews | Promise<PublishedTablesAndViews>));
export declare type Method = (...args: any) => (any | Promise<any>);
export declare const JOIN_TYPES: readonly ["one-many", "many-one", "one-one", "many-many"];
export declare type Join = {
    tables: [string, string];
    on: {
        [key: string]: string;
    };
    type: typeof JOIN_TYPES[number];
};
export declare type Joins = Join[];
export declare type ProstglesInitOptions = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    publishMethods?: (socket?: any, dbo?: DbHandler | any) => {
        [key: string]: Method;
    } | Promise<{
        [key: string]: Method;
    }>;
    tsGeneratedTypesDir?: string;
    io?: any;
    publish?: Publish;
    joins?: Joins;
    schema?: string;
    sqlFilePath?: string;
    isReady(dbo: any, db: DB): void;
    publishRawSQL?(socket: Socket, dbo: any): any;
    wsChannelNamePrefix?: string;
    onSocketConnect?(socket: Socket, dbo: any): any;
    onSocketDisconnect?(socket: Socket, dbo: any): any;
};
export declare type OnReady = {
    dbo: DbHandler;
    db: DB;
};
export declare class Prostgles {
    dbConnection: DbConnection;
    dbOptions: DbConnectionOpts;
    db: DB;
    dbo: DbHandler;
    dboBuilder: DboBuilder;
    publishMethods?(): any;
    io: any;
    publish?: Publish;
    joins?: Joins;
    schema: string;
    publishRawSQL?: any;
    wsChannelNamePrefix: string;
    onSocketConnect?(socket: Socket, dbo: any): any;
    onSocketDisconnect?(socket: Socket, dbo: any): any;
    sqlFilePath?: string;
    tsGeneratedTypesDir?: string;
    publishParser: PublishParser;
    constructor(params: ProstglesInitOptions);
    checkDb(): void;
    init(isReady: (dbo: DbHandler, db: DB) => any): Promise<boolean>;
    runSQLFile(filePath: string): Promise<void>;
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
export declare class PublishParser {
    publish: any;
    publishMethods?: any;
    publishRawSQL?: any;
    dbo: DbHandler;
    db: DB;
    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler, db: DB);
    getMethods(socket: any): Promise<{}>;
    getSchemaFromPublish(socket: any): Promise<{}>;
    getValidatedRequestRule({ tableName, command, socket }: DboTableCommand): Promise<TableRule>;
    getTableRules({ tableName, socket }: DboTable): Promise<any>;
}
export {};
//# sourceMappingURL=Prostgles.d.ts.map
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
    forcedFilter: object;
    filterFields: FieldFilter;
    validate(...SelectRequestData: any[]): SelectRequestData;
};
export declare type InsertRule = {
    fields: FieldFilter;
    forcedData: object;
    returningFields: FieldFilter;
    validate(...InsertRequestData: any[]): InsertRequestData;
};
export declare type UpdateRule = {
    fields: FieldFilter;
    forcedFilter: object;
    filterFields: FieldFilter;
    returningFields: FieldFilter;
    validate(...UpdateRequestData: any[]): UpdateRequestData;
};
export declare type DeleteRule = {
    forcedFilter: object;
    filterFields: FieldFilter;
    returningFields: FieldFilter;
    validate?(...UpdateRequestData: any[]): UpdateRequestData;
};
export declare type SyncRule = {
    id_fields: string[];
    synced_field: string;
    allow_delete: boolean;
};
export declare type SubscribeRule = {
    throttle?: number;
};
export declare type TableRule = {
    select: SelectRule;
    insert: InsertRule;
    update: UpdateRule;
    delete: DeleteRule;
    sync: SyncRule;
    subscribe: SubscribeRule;
};
export declare type ViewRule = {
    select: SelectRule;
};
export declare type Publish = {
    tablesOrViews: {
        [key: string]: TableRule | ViewRule | "*";
    };
};
export declare type ParsedPublish = {
    tablesOrViewsHandle: {
        [key: string]: TableRule | ViewRule;
    };
};
declare type InitOptions = {
    dbConnection: DbConnection;
    dbOptions: DbConnectionOpts;
    publishMethods?(): any;
    ioObj: any;
    publish?: Publish;
    schema: string;
    publishRawSQL?: any;
    wsChannelNamePrefix: string;
    onSocketConnect?({ socket: Socket, dbo: any }: {
        socket: any;
        dbo: any;
    }): any;
    onSocketDisconnect?({ socket: Socket, dbo: any }: {
        socket: any;
        dbo: any;
    }): any;
    sqlFilePath?: string;
    isReady(dbo: any): void;
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
    ioObj: any;
    publish?: Publish;
    schema: string;
    publishRawSQL?: any;
    wsChannelNamePrefix: string;
    onSocketConnect?({ socket: Socket, dbo: any }: {
        socket: any;
        dbo: any;
    }): any;
    onSocketDisconnect?({ socket: Socket, dbo: any }: {
        socket: any;
        dbo: any;
    }): any;
    sqlFilePath?: string;
    constructor(params: InitOptions);
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
    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DbHandler);
    getDboRequestRules({ tableName, command, socket }: DboTableCommand): Promise<TableRule>;
    getMethods(socket: any): Promise<{}>;
    getSchemaFromPublish(socket: any): Promise<{}>;
    getCommandRules({ tableName, command, socket }: DboTableCommand): Promise<any>;
    getTableRules({ tableName, socket }: DboTable): Promise<any>;
}
export {};
//# sourceMappingURL=index.d.ts.map
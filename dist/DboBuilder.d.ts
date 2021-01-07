import * as Bluebird from "bluebird";
declare global {
    export interface Promise<T> extends Bluebird<T> {
    }
}
import * as pgPromise from 'pg-promise';
import { ColumnInfo, ValidatedColumnInfo, FieldFilter, SelectParams, InsertParams, UpdateParams, DeleteParams, OrderBy, DbJoinMaker } from "prostgles-types";
export declare type DbHandler = {
    [key: string]: Partial<TableHandler>;
} & DbJoinMaker & {
    sql?: (query: string, params?: any, options?: any) => Promise<any>;
};
import { DB, TableRule, Join, Prostgles, PublishParser } from "./Prostgles";
import { PubSubManager } from "./PubSubManager";
export declare const asName: (str: string) => string;
export declare type TableInfo = {
    schema: string;
    name: string;
    columns: ColumnInfo[];
};
declare type ViewInfo = TableInfo & {
    parent_tables: string[];
};
export declare type TableOrViewInfo = TableInfo & ViewInfo & {
    is_view: boolean;
};
declare type LocalParams = {
    socket?: any;
    func?: () => any;
    has_rules?: boolean;
    testRule?: boolean;
    tableAlias?: string;
    subOne?: boolean;
    dbTX?: any;
};
export declare type Aggregation = {
    field: string;
    query: string;
    alias: string;
    getQuery: (alias: string) => string;
};
export declare type SelectItem = {
    type: "column" | "function" | "aggregation" | "joinedColumn";
    getFields: () => string[];
    getQuery: (tableAlias?: string) => string;
    alias: string;
};
export declare type NewQuery = {
    allFields: string[];
    select: SelectItem[];
    table: string;
    where: string;
    orderBy: string[];
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: NewQuery[];
    joinAlias?: string;
    $path?: string[];
};
export declare type FunctionSpec = {
    name: string;
    type: "function" | "aggregation";
    /**
     * getFields used to validate user supplied field names. It will be fired before querying to validate allowed columns
     */
    getFields: (args: any[]) => string[];
    /**
     * allowedFields passed for multicol functions (e.g.: $rowhash)
     */
    getQuery: (params: {
        allowedFields: string[];
        args: any[];
        tableAlias?: string;
    }) => string;
};
declare type Filter = object | {
    $and: Filter[];
} | {
    $or: Filter[];
} | {};
declare type SelectFunc = {
    alias: string;
    getQuery: (alias: string, tableAlias?: string) => string;
};
declare type Query = {
    select: string[];
    selectFuncs: SelectFunc[];
    allFields: string[];
    aggs?: Aggregation[];
    table: string;
    where: string;
    orderBy: string[];
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: Query[];
    joinAlias?: string;
    $path?: string[];
};
export declare type JoinInfo = {
    table: string;
    on: [[string, string]];
    expectOne: boolean;
    source: string;
    target: string;
}[];
declare type JoinPaths = {
    t1: string;
    t2: string;
    path: string[];
}[];
import { Graph } from "./shortestPath";
declare const EXISTS_KEYS: string[];
export declare type ExistsFilterConfig = {
    key: string;
    f2: Filter;
    existType: typeof EXISTS_KEYS[number];
    tables: string[];
    isJoined: boolean;
    shortestJoin: boolean;
};
export declare class ViewHandler {
    db: DB;
    name: string;
    columns: ColumnInfo[];
    column_names: string[];
    tableOrViewInfo: TableOrViewInfo;
    columnSet: any;
    tsDataDef: string;
    tsDataName: string;
    tsDboDefs: string[];
    tsDboDef: string;
    tsDboName: string;
    joins: Join[];
    joinGraph: Graph;
    joinPaths: JoinPaths;
    dboBuilder: DboBuilder;
    t: pgPromise.ITask<{}>;
    is_view: boolean;
    filterDef: string;
    pubSubManager: PubSubManager;
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, joinPaths?: JoinPaths);
    makeDef(): void;
    getSelectFunctions(select: any): void;
    getRowHashSelect(allowedFields: FieldFilter, alias?: string, tableAlias?: string): string;
    getFullDef(): any[];
    validateViewRules(fields: FieldFilter, filterFields: FieldFilter, returningFields: FieldFilter, forcedFilter: object, rule: string): Promise<boolean>;
    getShortestJoin(table1: string, table2: string, startAlias: number, isInner?: boolean): {
        query: string;
        toOne: boolean;
    };
    private getJoins;
    buildJoinQuery(q: Query): Promise<string>;
    getAggs(select: object): Aggregation[];
    getNewQuery(filter: Filter, selectParams?: SelectParams & {
        alias?: string;
    }, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<NewQuery>;
    buildQueryTree(filter: Filter, selectParams?: SelectParams & {
        alias?: string;
    }, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<Query>;
    checkFilter(filter: any): void;
    prepareValidatedQuery(filter: Filter, selectParams?: SelectParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams, validatedAggAliases?: string[]): Promise<Query>;
    getColumns(tableRules?: TableRule, localParams?: LocalParams): Promise<ValidatedColumnInfo[]>;
    find(filter?: Filter, selectParams?: SelectParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<any[]>;
    findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?: any, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    count(filter?: Filter, param2_unused?: any, param3_unused?: any, table_rules?: TableRule, localParams?: any): Promise<number>;
    subscribe(filter: Filter, params: SelectParams, localFunc: (items: object[]) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<{
        channelName: string;
    } | Readonly<{
        unsubscribe: () => void;
    }>>;
    subscribeOne(filter: Filter, params: SelectParams, localFunc: (items: object) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<{
        channelName: string;
    } | Readonly<{
        unsubscribe: () => void;
    }>>;
    getAllowedSelectFields(selectParams: FieldFilter, allowed_cols: FieldFilter, allow_empty?: boolean): string[];
    prepareColumnSet(selectParams: FieldFilter, allowed_cols: FieldFilter, allow_empty?: boolean, onlyNames?: boolean): string | pgPromise.ColumnSet;
    prepareSelect(selectParams: FieldFilter, allowed_cols: FieldFilter, allow_empty?: boolean, tableAlias?: string): string;
    private getFinalFilterObj;
    prepareWhere(filter: Filter, forcedFilter: object, filterFields: FieldFilter, excludeWhere: boolean, tableAlias: string, localParams: LocalParams, tableRule: TableRule): Promise<string>;
    prepareExistCondition(eConfig: ExistsFilterConfig, localParams: LocalParams, tableRules: TableRule): Promise<string>;
    getCondition(filter: object, allowed_colnames: string[], tableAlias?: string, localParams?: LocalParams, tableRules?: TableRule): Promise<any>;
    prepareSort(orderBy: OrderBy, allowed_cols: any, tableAlias?: string, excludeOrder?: boolean, validatedAggAliases?: string[]): string;
    prepareLimitQuery(limit: number, maxLimit: number): number;
    prepareOffsetQuery(offset: number): number;
    intersectColumns(allowedFields: FieldFilter, dissallowedFields: FieldFilter, fixIssues?: boolean): string[];
    /**
    * Prepare and validate field object:
    * @example ({ item_id: 1 }, { user_id: 32 }) => { item_id: 1, user_id: 32 }
    * OR
    * ({ a: 1 }, { b: 32 }, ["c", "d"]) => throw "a field is not allowed"
    * @param {Object} obj - initial data
    * @param {Object} forcedData - set/override property
    * @param {string[]} allowed_cols - allowed columns (excluding forcedData) from table rules
    */
    prepareFieldValues(obj: object, forcedData: object, allowed_cols: FieldFilter, fixIssues?: boolean): object;
    /**
    * Filter string array
    * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
    * @param {boolean} allow_empty - allow empty select. defaults to true
    */
    parseFieldFilter(fieldParams?: FieldFilter, allow_empty?: boolean): string[];
}
declare type ValidDataAndColumnSet = {
    data: object;
    columnSet: any;
};
declare type ValidatedParams = {
    row: object;
    forcedData: object;
    allowedFields: FieldFilter;
    tableRules: TableRule;
    fixIssues: boolean;
};
export declare class TableHandler extends ViewHandler {
    io_stats: {
        throttle_queries_per_sec: number;
        since: number;
        queries: number;
        batching: string[];
    };
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, joinPaths?: JoinPaths);
    willBatch(query: string): boolean;
    update(filter: Filter, newData: object, params: UpdateParams, tableRules: TableRule, localParams?: LocalParams): Promise<any>;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues }: ValidatedParams): ValidDataAndColumnSet;
    insert(data: (object | object[]), param2?: InsertParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<any | any[] | boolean>;
    delete(filter?: Filter, params?: DeleteParams, param3_unused?: any, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    remove(filter: Filter, params?: UpdateParams, param3_unused?: null, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    upsert(filter: Filter, newData?: object, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    sync(filter: Filter, params: SelectParams, param3_unused: any, table_rules: TableRule, localParams: LocalParams): Promise<{
        channelName: string;
        id_fields: string[];
        synced_field: string;
    }>;
}
export interface TxHandler {
    [key: string]: TableHandler | ViewHandler;
}
export declare type TxCB = {
    (t: TxHandler): (any | void);
};
export declare type TX = {
    (t: TxCB): Promise<(any | void)>;
};
export declare type DbHandlerTX = {
    [key: string]: TX;
} | DbHandler;
export declare class DboBuilder {
    tablesOrViews: TableOrViewInfo[];
    db: DB;
    schema: string;
    dbo: DbHandler | DbHandlerTX;
    pubSubManager: PubSubManager;
    pojoDefinitions: string[];
    dboDefinition: string;
    tsTypesDefinition: string;
    joins: Join[];
    joinGraph: Graph;
    joinPaths: JoinPaths;
    prostgles: Prostgles;
    publishParser: PublishParser;
    onSchemaChange: () => void;
    constructor(prostgles: Prostgles);
    getJoins(): Join[];
    getJoinPaths(): JoinPaths;
    parseJoins(): Promise<JoinPaths>;
    buildJoinPaths(): void;
    init(): Promise<DbHandler | DbHandlerTX>;
}
export declare function isEmpty(obj?: any): boolean;
export {};
//# sourceMappingURL=DboBuilder.d.ts.map
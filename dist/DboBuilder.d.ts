import * as Bluebird from "bluebird";
declare global {
    export interface Promise<T> extends Bluebird<T> {
    }
}
import * as pgPromise from 'pg-promise';
import { DB, TableRule, OrderBy, SelectParams, InsertParams, UpdateParams, DeleteParams, Joins, Prostgles, PublishParser } from "./Prostgles";
import { PubSubManager } from "./PubSubManager";
/**
 * @example
 * { field_name: (true | false) }
 *
 * ["field_name1", "field_name2"]
 *
 * field_name: false -> means all fields except this
 */
export declare type FieldFilter = object | string[] | "*" | "";
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
declare type ColumnInfo = {
    name: string;
    data_type: string;
    udt_name: string;
    element_type: string;
};
declare type LocalParams = {
    socket?: any;
    func?: () => any;
    has_rules?: boolean;
    testRule?: boolean;
    tableAlias?: string;
};
declare type Filter = object | {
    $and: Filter[];
} | {
    $or: Filter[];
} | {};
declare type Query = {
    select: string[];
    allFields: string[];
    aggs?: string[];
    table: string;
    where: string;
    orderBy: string[];
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: Query[];
};
declare type JoinPaths = {
    t1: string;
    t2: string;
    path: string[];
}[];
import { Graph } from "./shortestPath";
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
    tsFieldFilter: string;
    tsFieldFilterName: string;
    joins: Joins;
    joinGraph: Graph;
    joinPaths: JoinPaths;
    dboBuilder: DboBuilder;
    pubSubManager: PubSubManager;
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder);
    makeDef(): void;
    getFullDef(): any[];
    validateViewRules(fields: FieldFilter, filterFields: FieldFilter, returningFields: FieldFilter, forcedFilter: object, rule: string): Promise<boolean>;
    getShortestJoin(table1: string, table2: string, startAlias: number, isInner?: boolean): {
        query: string;
        toOne: boolean;
    };
    buildJoinQuery(q: Query): Promise<string>;
    getAggs(select: object): {
        field: string;
        query: string;
        alias: string;
    }[];
    buildQueryTree(filter: Filter, selectParams?: SelectParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<Query>;
    checkFilter(filter: any): void;
    prepareValidatedQuery(filter: Filter, selectParams?: SelectParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams, validatedAggAliases?: string[]): Promise<Query>;
    find(filter: Filter, selectParams?: SelectParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<object[]>;
    findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?: any, table_rules?: TableRule, localParams?: LocalParams): Promise<object>;
    count(filter?: Filter, param2_unused?: any, param3_unused?: any, table_rules?: TableRule, localParams?: any): Promise<number>;
    subscribe(filter: Filter, params: SelectParams, localFunc: (items: object[]) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<{
        channelName: string;
    }> | Readonly<{
        unsubscribe: () => void;
    }>;
    prepareColumnSet(selectParams: FieldFilter, allowed_cols: FieldFilter, allow_empty?: boolean, onlyNames?: boolean): string | pgPromise.ColumnSet;
    prepareSelect(selectParams: FieldFilter, allowed_cols: FieldFilter, allow_empty?: boolean, tableAlias?: string): string;
    prepareWhere(filter: Filter, forcedFilter: object, filterFields: FieldFilter, excludeWhere?: boolean, tableAlias?: string): any;
    getCondition(filter: object, allowed_colnames: string[], tableAlias?: string): string;
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
    * @param {FieldFilter} fieldParams - key filter param. e.g.: "*" OR ["key1", "key2"] OR []
    * @param {boolean} allow_empty - allow empty select
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
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder);
    willBatch(query: string): boolean;
    update(filter: Filter, newData: object, params: UpdateParams, tableRules: TableRule, localParams?: LocalParams): Promise<any>;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues }: ValidatedParams): ValidDataAndColumnSet;
    insert(data: (object | object[]), param2?: InsertParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    delete(filter: Filter, params?: DeleteParams, param3_unused?: any, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    remove(filter: Filter, params?: UpdateParams, param3_unused?: null, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    upsert(filter: Filter, newData?: object, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    sync(filter: Filter, params: SelectParams, param3_unused: any, table_rules: TableRule, localParams: LocalParams): Promise<{
        channelName: string;
        id_fields: string[];
        synced_field: string;
    }>;
}
export interface DbHandler {
    [key: string]: TableHandler | ViewHandler;
}
export declare class DboBuilder {
    tablesOrViews: TableOrViewInfo[];
    db: DB;
    schema: string;
    dbo: DbHandler;
    pubSubManager: PubSubManager;
    pojoDefinitions: string[];
    dboDefinition: string;
    tsTypesDefinition: string;
    joins: Joins;
    joinGraph: Graph;
    joinPaths: JoinPaths;
    prostgles: Prostgles;
    publishParser: PublishParser;
    constructor(prostgles: Prostgles);
    parseJoins(): Promise<JoinPaths>;
    buildJoinPaths(): void;
    init(): Promise<DbHandler>;
}
export {};
//# sourceMappingURL=DboBuilder.d.ts.map
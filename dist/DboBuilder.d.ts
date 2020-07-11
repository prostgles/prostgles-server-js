import * as Bluebird from "bluebird";
declare global {
    export interface Promise<T> extends Bluebird<T> {
    }
}
import { DB, TableRule, OrderBy, SelectParams, InsertParams, UpdateParams, DeleteParams } from "./index";
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
};
declare type LocalParams = {
    socket: any;
    func: () => any;
    has_rules: boolean;
};
export declare class ViewHandler {
    db: DB;
    name: string;
    columns: ColumnInfo[];
    column_names: string[];
    tableOrViewInfo: TableOrViewInfo;
    columnSet: any;
    pubSubManager: PubSubManager;
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager);
    find(filter: object, selectParams: SelectParams, param3_unused: any, tableRules: TableRule, localParams?: LocalParams): Promise<any>;
    findOne(filter: object, selectParams: SelectParams, param3_unused: any, table_rules: TableRule, localParams: LocalParams): Promise<object[]>;
    count(filter: object, param2_unused: any, param3_unused: any, table_rules: TableRule, localParams?: any): Promise<any>;
    subscribe(filter: any, params: SelectParams, localFunc: () => any, table_rules: TableRule, localParams: LocalParams): Promise<{
        channelName: string;
    }> | Readonly<{
        unsubscribe: () => void;
    }>;
    prepareColumnSet(selectParams: FieldFilter, allowed_cols: FieldFilter, allow_empty?: boolean): string;
    prepareWhere(filter: any, forcedFilter: object, filterFields: FieldFilter, excludeWhere?: boolean): any;
    getCustomParsers(): {
        aliases: string[];
        get: (key: any, val: any) => string;
    }[];
    getCondition(filter: any, allowed_colnames: string[]): string;
    prepareSort(orderBy: OrderBy, allowed_cols: any): string;
    prepareLimitQuery(limit: number, maxLimit: number): string;
    prepareOffsetQuery(offset: number): string;
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
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager);
    willBatch(query: string): boolean;
    remove(filter: object, newData: object, params: UpdateParams, tableRules: TableRule, localParams?: LocalParams): any;
    update(filter: object, newData: object, params: UpdateParams, tableRules: TableRule, localParams?: LocalParams): Promise<any>;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues }: ValidatedParams): ValidDataAndColumnSet;
    insert(data: (object | object[]), param2: InsertParams, param3_unused: any, tableRules: TableRule, localParams?: any): Promise<any>;
    delete(filter: any, params: DeleteParams, param3_unused: any, table_rules: TableRule, localParams?: LocalParams): any;
    upsert(filter: any, newData: any, params: any, table_rules: any, localParams?: LocalParams): Promise<any>;
    sync(filter: any, params: SelectParams, param3_unused: any, table_rules: TableRule, localParams: LocalParams): Promise<{
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
    constructor(db: DB, schema?: string);
    init(): Promise<DbHandler>;
}
export {};
//# sourceMappingURL=DboBuilder.d.ts.map
import * as Bluebird from "bluebird";
declare global {
    export interface Promise<T> extends Bluebird<T> {
    }
}
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { ColumnInfo, ValidatedColumnInfo, FieldFilter, SelectParams, InsertParams, UpdateParams, DeleteParams, OrderBy, DbJoinMaker } from "prostgles-types";
export declare type DbHandler = {
    [key: string]: Partial<TableHandler>;
} & DbJoinMaker & {
    sql?: (query: string, params?: any, options?: any) => Promise<any>;
};
import { SelectItem, FieldSpec, FinalFilter } from "./QueryBuilder";
import { DB, TableRule, Join, Prostgles, PublishParser } from "./Prostgles";
import { PubSubManager } from "./PubSubManager";
declare type PGP = pgPromise.IMain<{}, pg.IClient>;
export declare const pgp: PGP;
export declare type TableInfo = {
    schema: string;
    name: string;
    columns: ColumnInfo[];
};
export declare type ViewInfo = TableInfo & {
    parent_tables: string[];
};
export declare type TableOrViewInfo = TableInfo & ViewInfo & {
    is_view: boolean;
};
export declare type LocalParams = {
    socket?: any;
    func?: () => any;
    has_rules?: boolean;
    testRule?: boolean;
    tableAlias?: string;
    subOne?: boolean;
    dbTX?: any;
    returnQuery?: boolean;
};
export declare type Aggregation = {
    field: string;
    query: string;
    alias: string;
    getQuery: (alias: string) => string;
};
export declare type Filter = object | {
    $and: Filter[];
} | {
    $or: Filter[];
} | {};
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
export declare type ValidatedTableRules = {
    allColumns: FieldSpec[];
    select: {
        fields: string[];
        filterFields: string[];
        forcedFilter: any;
        maxLimit: number;
    };
    update: {
        fields: string[];
        returningFields: string[];
        filterFields: string[];
        forcedFilter: any;
        forcedData: any;
    };
    insert: {
        fields: string[];
        returningFields: string[];
        forcedData: any;
    };
    delete: {
        filterFields: string[];
        forcedFilter: any;
        returningFields: string[];
    };
};
export declare const EXISTS_KEYS: readonly ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];
export declare type EXISTS_KEY = typeof EXISTS_KEYS[number];
declare class ColSet {
    opts: {
        columns: ColumnInfo[];
        tableName: string;
        colNames: string[];
    };
    constructor(columns: ColumnInfo[], tableName: string);
    private getRow;
    getInsertQuery(data: any[], allowedCols: string[]): string;
    getUpdateQuery(data: any[], allowedCols: string[]): string;
}
export declare type ExistsFilterConfig = {
    key: string;
    f2: Filter;
    existType: EXISTS_KEY;
    tables: string[];
    isJoined: boolean;
    shortestJoin: boolean;
};
export declare class ViewHandler {
    db: DB;
    name: string;
    escapedName: string;
    columns: ColumnInfo[];
    column_names: string[];
    tableOrViewInfo: TableOrViewInfo;
    colSet: ColSet;
    tsColumnDefs: string[];
    joins: Join[];
    joinGraph: Graph;
    joinPaths: JoinPaths;
    dboBuilder: DboBuilder;
    t: pgPromise.ITask<{}>;
    is_view: boolean;
    filterDef: string;
    pubSubManager: PubSubManager;
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, joinPaths?: JoinPaths);
    getSelectFunctions(select: any): void;
    getRowHashSelect(allowedFields: FieldFilter, alias?: string, tableAlias?: string): string;
    getFullDef(): any[];
    validateViewRules(fields: FieldFilter, filterFields: FieldFilter, returningFields: FieldFilter, forcedFilter: object, rule: string): Promise<boolean>;
    getShortestJoin(table1: string, table2: string, startAlias: number, isInner?: boolean): {
        query: string;
        toOne: boolean;
    };
    getJoins(source: string, target: string, path?: string[]): JoinInfo;
    checkFilter(filter: any): void;
    getColumns(tableRules?: TableRule, localParams?: LocalParams): Promise<ValidatedColumnInfo[]>;
    getValidatedRules(tableRules?: TableRule, localParams?: LocalParams): ValidatedTableRules;
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
    prepareHaving(params: {
        having: Filter;
        select: SelectItem[];
        forcedFilter: object;
        filterFields: FieldFilter;
        addKeywords?: boolean;
        tableAlias?: string;
        localParams: LocalParams;
        tableRule: TableRule;
    }): Promise<string>;
    /**
     * Parses group or simple filter
     */
    prepareWhere(params: {
        filter: Filter;
        select?: SelectItem[];
        forcedFilter: object;
        filterFields: FieldFilter;
        addKeywords?: boolean;
        tableAlias?: string;
        localParams: LocalParams;
        tableRule: TableRule;
    }): Promise<string>;
    prepareExistCondition(eConfig: ExistsFilterConfig, localParams: LocalParams, tableRules: TableRule): Promise<string>;
    /**
     * parses a single filter
     * @example: { fff: 2 } => "fff" = 2
     *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
     */
    getCondition(params: {
        filter: FinalFilter;
        select?: SelectItem[];
        allowed_colnames: string[];
        tableAlias?: string;
        localParams?: LocalParams;
        tableRules?: TableRule;
    }): Promise<string>;
    prepareSort(orderBy: OrderBy, allowed_cols: any, tableAlias: string, excludeOrder: boolean, select: SelectItem[]): string;
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
    parseFieldFilter(fieldParams?: FieldFilter, allow_empty?: boolean, allowed_cols?: string[]): string[];
}
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
    updateBatch(data: [Filter, object][], params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    update(filter: Filter, newData: object, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues }: ValidatedParams): {
        data: any;
        allowedCols: string[];
    };
    insert(data: (object | object[]), param2?: InsertParams, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<any | any[] | boolean>;
    prepareReturning: (returning: FieldFilter, allowedFields: string[], tableAlias?: string) => Promise<string>;
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
    onSchemaChange: (event: {
        command: string;
        query: string;
    }) => void;
    constructor(prostgles: Prostgles);
    getJoins(): Join[];
    getJoinPaths(): JoinPaths;
    parseJoins(): Promise<JoinPaths>;
    buildJoinPaths(): void;
    init(): Promise<DbHandler | DbHandlerTX>;
    getTX: (dbTX: TxCB) => Promise<any>;
}
export declare function isPlainObject(o: any): boolean;
export declare const TS_PG_Types: {
    string: string[];
    number: string[];
    boolean: string[];
    Object: string[];
    Date: string[];
    "Array<number>": string[];
    "Array<boolean>": string[];
    "Array<string>": string[];
    "Array<Object>": string[];
    "Array<Date>": string[];
    any: any[];
};
export {};
//# sourceMappingURL=DboBuilder.d.ts.map
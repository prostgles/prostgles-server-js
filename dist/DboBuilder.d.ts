import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { ColumnInfo, ValidatedColumnInfo, FieldFilter, SelectParams, SubscribeParams, OrderBy, InsertParams, UpdateParams, DeleteParams, DbJoinMaker, PG_COLUMN_UDT_DATA_TYPE, TS_PG_Types, TableInfo as TInfo, SQLHandler, AnyObject, Select } from "prostgles-types";
export declare type Media = {
    "id"?: string;
    "title"?: string;
    "extension"?: string;
    "content_type"?: string;
    "local_url"?: string;
    "url"?: string;
    "signed_url"?: string;
    "signed_url_expires"?: number;
    "name"?: string;
    "original_name"?: string;
    "etag"?: string;
};
export interface TxHandler {
    [key: string]: TableHandler | ViewHandler;
}
export declare type TxCB = {
    (t: TxHandler, _t: pgPromise.ITask<{}>): (any | void);
};
export declare type TX = {
    (t: TxCB): Promise<(any | void)>;
};
export declare type DbHandler = {
    [key: string]: Partial<TableHandler>;
} & DbJoinMaker & {
    sql?: SQLHandler;
} & {
    tx?: TX;
};
import { SelectItem, FieldSpec } from "./QueryBuilder";
import { DB, TableRule, Join, Prostgles, PublishParser, ValidateRow } from "./Prostgles";
import { PubSubManager, BasicCallback } from "./PubSubManager";
declare type PGP = pgPromise.IMain<{}, pg.IClient>;
export declare const pgp: PGP;
export declare type TableInfo = TInfo & {
    schema: string;
    name: string;
    oid: number;
    comment: string;
    columns: ColumnInfo[];
};
export declare type ViewInfo = TableInfo & {
    parent_tables: string[];
};
export declare type TableOrViewInfo = TableInfo & ViewInfo & {
    is_view: boolean;
};
export declare type PRGLIOSocket = {
    readonly id: string;
    readonly handshake?: {
        query?: Record<string, string>;
        headers?: {
            cookie?: string;
        };
    };
    readonly on: (channel: string, params: any, cb?: (err: any, res?: any) => void) => Promise<void>;
    readonly emit: (channel: string, message: any, cb?: BasicCallback) => any;
    readonly once: (channel: string, cb: (_data: any, cb: BasicCallback) => void) => void;
    readonly removeAllListeners: (channel: string) => void;
    readonly disconnect: () => void;
    /** Used for session caching */
    __prglCache?: {
        session: BasicSession;
        user: AnyObject;
        clientUser: AnyObject;
    };
    _user?: AnyObject;
    /** Used for publish error caching */
    prostgles?: AnyObject;
};
export declare type LocalParams = {
    httpReq?: any;
    socket?: PRGLIOSocket;
    func?: () => any;
    has_rules?: boolean;
    testRule?: boolean;
    tableAlias?: string;
    dbTX?: TxHandler;
    localDBTX?: DbHandler;
    returnQuery?: boolean;
    nestedJoin?: {
        depth: number;
        data: AnyObject;
    };
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
    expectOne?: boolean;
    paths: {
        /**
         * The table that JOIN ON columns refer to.
         * columns in index = 1 refer to this table. index = 0 columns refer to previous JoinInfo.table
         */
        table: string;
        /**
         * Source and target JOIN ON columns
         * e.g.:    [source_table_column: string, table_column: string][]
         */
        on: [string, string][];
        /**
         * Source table name
         */
        source: string;
        /**
         * Target table name
         */
        target: string;
    }[];
};
declare type JoinPaths = {
    t1: string;
    t2: string;
    path: string[];
}[];
import { Graph } from "./shortestPath";
export declare type CommonTableRules = {
    /**
     * True by default. Allows clients to get column information on any columns that are allowed in (select, insert, update) field rules.
     */
    getColumns?: boolean;
    /**
     * True by default. Allows clients to get table information (oid, comment, label, has_media).
     */
    getInfo?: boolean | null;
};
export declare type ValidatedTableRules = CommonTableRules & {
    allColumns: FieldSpec[];
    select: {
        fields: string[];
        filterFields: string[];
        forcedFilter: any;
        maxLimit: number | null;
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
    getInsertQuery(data: any[], allowedCols: string[], validate: ValidateRow | undefined): Promise<string>;
    getUpdateQuery(data: any[], allowedCols: string[], validate: ValidateRow | undefined): Promise<string>;
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
    columns: TableSchema["columns"];
    columnsForTypes: ColumnInfo[];
    column_names: string[];
    tableOrViewInfo: TableSchema;
    colSet: ColSet;
    tsColumnDefs: string[];
    joins: Join[];
    joinGraph?: Graph;
    joinPaths?: JoinPaths;
    dboBuilder: DboBuilder;
    t?: pgPromise.ITask<{}>;
    dbTX?: TxHandler;
    is_view: boolean;
    filterDef: string;
    is_media: boolean;
    constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, dbTX?: TxHandler, joinPaths?: JoinPaths);
    getRowHashSelect(allowedFields: FieldFilter, alias?: string, tableAlias?: string): string;
    validateViewRules(fields: FieldFilter | undefined, filterFields: FieldFilter | undefined, returningFields: FieldFilter | undefined, forcedFilter: AnyObject | undefined, rule: "update" | "select" | "insert" | "delete"): Promise<boolean>;
    getShortestJoin(table1: string, table2: string, startAlias: number, isInner?: boolean): {
        query: string;
        toOne: boolean;
    };
    getJoins(source: string, target: string, path?: string[], checkTableConfig?: boolean): JoinInfo;
    checkFilter(filter: any): void;
    getInfo(param1?: any, param2?: any, param3?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<TInfo>;
    getColumns(lang?: string, param2?: never, param3?: never, tableRules?: TableRule, localParams?: LocalParams): Promise<ValidatedColumnInfo[]>;
    getValidatedRules(tableRules?: TableRule, localParams?: LocalParams): ValidatedTableRules;
    find(filter?: Filter, selectParams?: SelectParams, param3_unused?: never, tableRules?: TableRule, localParams?: LocalParams): Promise<any[]>;
    findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?: never, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    count(filter?: Filter, param2_unused?: never, param3_unused?: never, table_rules?: TableRule, localParams?: any): Promise<number>;
    size(filter?: Filter, selectParams?: SelectParams, param3_unused?: never, table_rules?: TableRule, localParams?: any): Promise<string>;
    getAllowedSelectFields(selectParams: {} | "" | string[] | {
        [key: string]: boolean | 0 | 1;
    } | "*" | undefined, allowed_cols: FieldFilter, allow_empty?: boolean): string[];
    prepareColumnSet(selectParams: {} | "" | string[] | {
        [key: string]: boolean | 0 | 1;
    } | "*" | undefined, allowed_cols: FieldFilter, allow_empty?: boolean, onlyNames?: boolean): string | pgPromise.ColumnSet;
    prepareSelect(selectParams: {} | "" | string[] | {
        [key: string]: boolean | 0 | 1;
    } | "*" | undefined, allowed_cols: FieldFilter, allow_empty?: boolean, tableAlias?: string): string;
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
        filter?: Filter;
        select?: SelectItem[];
        forcedFilter?: AnyObject;
        filterFields?: FieldFilter;
        addKeywords?: boolean;
        tableAlias?: string;
        localParams: LocalParams | undefined;
        tableRule: TableRule | undefined;
    }): Promise<string>;
    prepareExistCondition(eConfig: ExistsFilterConfig, localParams: LocalParams | undefined): Promise<string>;
    /**
     * parses a single filter
     * @example
     *  { fff: 2 } => "fff" = 2
     *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
     */
    getCondition(params: {
        filter: any;
        select?: SelectItem[];
        allowed_colnames: string[];
        tableAlias?: string;
        localParams?: LocalParams;
        tableRules?: TableRule;
    }): Promise<string>;
    prepareSort(orderBy: OrderBy | undefined, allowed_cols: FieldFilter, tableAlias: string | undefined, excludeOrder: boolean | undefined, select: SelectItem[]): string;
    prepareLimitQuery(limit: number | undefined, p: ValidatedTableRules): number;
    prepareOffsetQuery(offset?: number): number;
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
    prepareFieldValues(obj: Record<string, any> | undefined, forcedData: object | undefined, allowed_cols: FieldFilter | undefined, fixIssues?: boolean): AnyObject;
    parseFieldFilter(fieldParams?: FieldFilter, allow_empty?: boolean, allowed_cols?: string[]): string[];
    /**
    * Filter string array
    * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
    * @param {boolean} allow_empty - allow empty select. defaults to true
    */
    static _parseFieldFilter(fieldParams: {} | "" | string[] | {
        [key: string]: boolean | 0 | 1;
    } | "*" | undefined, allow_empty: boolean | undefined, all_cols: string[]): string[];
}
declare type ValidatedParams = {
    row: AnyObject;
    forcedData?: AnyObject;
    allowedFields?: FieldFilter;
    tableRules?: TableRule;
    fixIssues: boolean;
};
export declare class TableHandler extends ViewHandler {
    io_stats: {
        throttle_queries_per_sec: number;
        since: number;
        queries: number;
        batching: string[] | null;
    };
    constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, dbTX?: TxHandler, joinPaths?: JoinPaths);
    willBatch(query: string): true | undefined;
    subscribe(filter: Filter, params: SubscribeParams, localFunc: (items: AnyObject[]) => any): Promise<{
        unsubscribe: () => any;
    }>;
    subscribe(filter: Filter, params: SubscribeParams, localFunc?: (items: AnyObject[]) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<string>;
    subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any): Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<string>;
    updateBatch(data: [Filter, AnyObject][], params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    update(filter: Filter, newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<AnyObject | void>;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues }: ValidatedParams): {
        data: any;
        allowedCols: string[];
    };
    private insertDataParse;
    insert(rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: never, tableRules?: TableRule, _localParams?: LocalParams): Promise<any | any[] | boolean>;
    prepareReturning: (returning: Select<AnyObject>, allowedFields: string[]) => Promise<SelectItem[]>;
    makeReturnQuery(items?: SelectItem[]): string;
    delete(filter?: Filter, params?: DeleteParams, param3_unused?: never, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    remove(filter: Filter, params?: UpdateParams, param3_unused?: never, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    upsert(filter: Filter, newData: AnyObject, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    sync(filter: Filter, params: SelectParams, param3_unused: never, table_rules: TableRule, localParams: LocalParams): Promise<{
        channelName: string;
        id_fields: string[];
        synced_field: string;
    }>;
}
import { BasicSession } from "./AuthHandler";
export declare class DboBuilder {
    tablesOrViews?: TableSchema[];
    /**
     * Used in obtaining column names for error messages
     */
    constraints?: PGConstraint[];
    db: DB;
    schema: string;
    dbo: DbHandler;
    _pubSubManager?: PubSubManager;
    getPubSubManager: () => Promise<PubSubManager>;
    pojoDefinitions?: string[];
    dboDefinition?: string;
    tsTypesDefinition?: string;
    joins?: Join[];
    joinGraph?: Graph;
    joinPaths: JoinPaths;
    prostgles: Prostgles;
    publishParser?: PublishParser;
    onSchemaChange?: (event: {
        command: string;
        query: string;
    }) => void;
    private constructor();
    private init;
    static create: (prostgles: Prostgles) => Promise<DboBuilder>;
    destroy(): void;
    getJoins(): Join[] | undefined;
    getJoinPaths(): JoinPaths;
    parseJoins(): Promise<JoinPaths>;
    buildJoinPaths(): void;
    build(): Promise<DbHandler>;
    getTX: (cb: TxCB) => Promise<any>;
}
export declare type TableSchema = {
    schema: string;
    name: string;
    oid: number;
    comment: string;
    columns: (ColumnInfo & {
        privileges: {
            privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
            is_grantable: "YES" | "NO";
        }[];
    })[];
    is_view: boolean;
    parent_tables: string[];
    privileges: {
        insert: boolean;
        select: boolean;
        update: boolean;
        delete: boolean;
    };
};
declare type PGConstraint = {
    /**
     * Constraint type
     */
    contype: "u" | "p" | "c";
    /**
     * Column ordinal positions
     */
    conkey: number[];
    /**
     * Constraint name
     */
    conname: string;
    /**
     * Table name
     */
    relname: string;
};
export declare function isPlainObject<T>(o: T): o is T | Record<string, any>;
export declare function getKeys<T>(o: T): Array<keyof T>;
export declare function postgresToTsType(udt_data_type: PG_COLUMN_UDT_DATA_TYPE): keyof typeof TS_PG_Types;
export {};
//# sourceMappingURL=DboBuilder.d.ts.map
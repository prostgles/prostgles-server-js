import * as pgPromise from 'pg-promise';
import { ColumnInfo, FieldFilter, SelectParams, OrderBy, TableInfo as TInfo, AnyObject, SubscribeParams } from "prostgles-types";
import { DB, DBHandlerServer, Join } from "../Prostgles";
import { DboBuilder, ExistsFilterConfig, Filter, JoinInfo, LocalParams, SortItem, TableHandlers, TableSchema, ValidatedTableRules } from "../DboBuilder";
import { Graph } from "../shortestPath";
import { TableRule, UpdateRule, ValidateRow } from "../PublishParser";
import { SelectItem, SelectItemValidated } from "./QueryBuilder/QueryBuilder";
import { LocalFunc } from "./subscribe";
export type JoinPaths = {
    t1: string;
    t2: string;
    path: string[];
}[];
declare class ColSet {
    opts: {
        columns: ColumnInfo[];
        tableName: string;
        colNames: string[];
    };
    constructor(columns: ColumnInfo[], tableName: string);
    private getRow;
    getInsertQuery(data: any[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined): Promise<string>;
    getUpdateQuery(data: any[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined): Promise<string>;
}
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
    dbTX?: TableHandlers;
    is_view: boolean;
    filterDef: string;
    is_media: boolean;
    constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, dbTX?: TableHandlers, joinPaths?: JoinPaths);
    getRowHashSelect(allowedFields: FieldFilter, alias?: string, tableAlias?: string): string;
    validateViewRules(args: {
        fields?: FieldFilter;
        filterFields?: FieldFilter;
        returningFields?: FieldFilter;
        forcedFilter?: AnyObject;
        dynamicFields?: UpdateRule["dynamicFields"];
        rule: "update" | "select" | "insert" | "delete";
    }): Promise<boolean>;
    getShortestJoin(table1: string, table2: string, startAlias: number, isInner?: boolean): {
        query: string;
        toOne: boolean;
    };
    getJoins(source: string, target: string, path?: string[], checkTableConfig?: boolean): JoinInfo;
    checkFilter(filter: any): void;
    getInfo(lang?: string, param2?: any, param3?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<TInfo>;
    getColumns: (lang?: string | undefined, params?: {
        rule: "update";
        filter: AnyObject;
        data: AnyObject;
    } | undefined, _param3?: undefined, tableRules?: TableRule<AnyObject, void> | undefined, localParams?: LocalParams | undefined) => Promise<import("prostgles-types").ValidatedColumnInfo[]>;
    getValidatedRules(tableRules?: TableRule, localParams?: LocalParams): ValidatedTableRules;
    find(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any[]>;
    findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    subscribe(filter: Filter, params: SubscribeParams, localFunc: LocalFunc): Promise<{
        unsubscribe: () => any;
    }>;
    subscribe(filter: Filter, params: SubscribeParams, localFunc: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<string>;
    subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any): Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne(filter: Filter, params: SubscribeParams, localFunc: undefined, table_rules: TableRule, localParams: LocalParams): Promise<string>;
    count(filter?: Filter, param2_unused?: undefined, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<number>;
    size(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<string>;
    getAllowedSelectFields(selectParams: FieldFilter<AnyObject> | undefined, allowed_cols: FieldFilter, allow_empty?: boolean): string[];
    prepareColumnSet(selectParams: FieldFilter<AnyObject> | undefined, allowed_cols: FieldFilter, allow_empty?: boolean, onlyNames?: boolean): string | pgPromise.ColumnSet;
    prepareSelect(selectParams: FieldFilter<AnyObject> | undefined, allowed_cols: FieldFilter, allow_empty?: boolean, tableAlias?: string): string;
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
    }): Promise<{
        where: string;
        filter: AnyObject;
    }>;
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
    prepareSortItems(orderBy: OrderBy | undefined, allowed_cols: string[], tableAlias: string | undefined, select: SelectItemValidated[]): SortItem[];
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
    static _parseFieldFilter<AllowedKeys extends string[]>(fieldParams: FieldFilter<Record<AllowedKeys[number], any>> | undefined, allow_empty: boolean | undefined, all_cols: AllowedKeys): AllowedKeys | [""];
}
export {};
//# sourceMappingURL=ViewHandler.d.ts.map
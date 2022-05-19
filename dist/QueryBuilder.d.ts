import { Filter, LocalParams, TableHandler } from "./DboBuilder";
import { TableRule } from "./Prostgles";
import { SelectParamsBasic as SelectParams, FieldFilter, ColumnInfo, PG_COLUMN_UDT_DATA_TYPE } from "prostgles-types";
export declare type SelectItem = {
    type: "column" | "function" | "aggregation" | "joinedColumn" | "computed";
    getFields: (args?: any[]) => string[] | "*";
    getQuery: (tableAlias?: string) => string;
    columnPGDataType?: string;
    column_udt_type?: PG_COLUMN_UDT_DATA_TYPE;
    alias: string;
    selected: boolean;
};
export declare type NewQuery = {
    allFields: string[];
    /**
     * Contains user selection and all the allowed columns. Allowed columns not selected are marked with  selected: false
     */
    select: SelectItem[];
    table: string;
    where: string;
    orderBy: string[];
    having: string;
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: NewQuery[];
    tableAlias?: string;
    $path?: string[];
};
export declare const asNameAlias: (field: string, tableAlias?: string) => string;
declare type GetQueryArgs = {
    allColumns: ColumnInfo[];
    allowedFields: string[];
    args: any[];
    tableAlias?: string;
    ctidField?: string;
};
export declare type FieldSpec = {
    name: string;
    type: "column" | "computed";
    /**
     * allowedFields passed for multicol functions (e.g.: $rowhash)
     */
    getQuery: (params: Omit<GetQueryArgs, "args">) => string;
};
export declare type FunctionSpec = {
    name: string;
    description?: string;
    /**
     * If true then it can be used in filters and is expected to return boolean
     */
    canBeUsedForFilter?: boolean;
    /**
     * If true then the first argument is expected to be a column name
     */
    singleColArg: boolean;
    /**
     * If true then this func can be used within where clause
     */
    numArgs: number;
    /**
     * If provided then the number of column names provided to the function must not be less than this
     * By default every function is checked against numArgs
     */
    minCols?: number;
    type: "function" | "aggregation" | "computed";
    /**
     * getFields: string[] -> used to validate user supplied field names. It will be fired before querying to validate against allowed columns
     *      if not field names are used from arguments then return an empty array
     */
    getFields: (args: any[], allowedFields: string[]) => "*" | string[];
    /**
     * allowedFields passed for multicol functions (e.g.: $rowhash)
     */
    getQuery: (params: GetQueryArgs) => string;
};
/**
* Each function expects a column at the very least
*/
export declare const FUNCTIONS: FunctionSpec[];
export declare const COMPUTED_FIELDS: FieldSpec[];
export declare class SelectItemBuilder {
    select: SelectItem[];
    private allFields;
    private allowedFields;
    private computedFields;
    private functions;
    private allowedFieldsIncludingComputed;
    private isView;
    private columns;
    constructor(params: {
        allowedFields: string[];
        computedFields: FieldSpec[];
        functions: FunctionSpec[];
        allFields: string[];
        isView: boolean;
        columns: ColumnInfo[];
    });
    private checkField;
    private addItem;
    private addFunctionByName;
    private addFunction;
    addColumn: (fieldName: string, selected: boolean) => void;
    parseUserSelect: (userSelect: FieldFilter, joinParse?: (key: string, val: any, throwErr: (msg: string) => any) => any) => Promise<any[]>;
}
export declare function getNewQuery(_this: TableHandler, filter: Filter, selectParams: SelectParams & {
    alias?: string;
}, param3_unused: any, tableRules: TableRule, localParams: LocalParams, columns: ColumnInfo[]): Promise<NewQuery>;
export declare function makeQuery(_this: TableHandler, q: NewQuery, depth: number, joinFields: string[], selectParams: SelectParams): string;
export {};
//# sourceMappingURL=QueryBuilder.d.ts.map
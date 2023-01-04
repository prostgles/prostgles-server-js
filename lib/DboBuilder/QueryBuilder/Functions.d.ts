import { ColumnInfo, PG_COLUMN_UDT_DATA_TYPE } from "prostgles-types";
export declare const parseFunction: (funcData: {
    func: string | FunctionSpec;
    args: any[];
    functions: FunctionSpec[];
    allowedFields: string[];
}) => FunctionSpec;
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
    /**
     * Number of arguments expected
     */
    numArgs: number;
    /**
     * If provided then the number of column names provided to the function (from getFields()) must not be less than this
     * By default every function is checked against numArgs
     */
    minCols?: number;
    type: "function" | "aggregation" | "computed";
    /**
     * getFields: string[] -> used to validate user supplied field names. It will be fired before querying to validate against allowed columns
     *      if not field names are used from arguments then return an empty array
     */
    getFields: (args: any[]) => "*" | string[];
    /**
     * allowedFields passed for multicol functions (e.g.: $rowhash)
     */
    getQuery: (params: GetQueryArgs) => string;
    returnType?: PG_COLUMN_UDT_DATA_TYPE;
};
/**
* Each function expects a column at the very least
*/
export declare const FUNCTIONS: FunctionSpec[];
export declare const COMPUTED_FIELDS: FieldSpec[];
export {};
//# sourceMappingURL=Functions.d.ts.map
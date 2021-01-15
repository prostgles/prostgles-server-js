import { Filter, LocalParams, TableHandler } from "./DboBuilder";
import { TableRule } from "./Prostgles";
import { SelectParams, FieldFilter } from "prostgles-types";
export declare type SelectItem = {
    type: "column" | "function" | "aggregation" | "joinedColumn" | "computed";
    getFields: () => string[];
    getQuery: (tableAlias?: string) => string;
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
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: NewQuery[];
    tableAlias?: string;
    $path?: string[];
};
export declare const asNameAlias: (field: string, tableAlias?: string) => string;
export declare type FieldSpec = {
    name: string;
    type: "column" | "computed";
    /**
     * allowedFields passed for multicol functions (e.g.: $rowhash)
     */
    getQuery: (params: {
        allowedFields: string[];
        tableAlias?: string;
        ctidField?: string;
    }) => string;
};
export declare type FunctionSpec = {
    name: string;
    /**
     * If true then the first argument is expected to be a column name
     */
    singleColArg: boolean;
    type: "function" | "aggregation" | "computed";
    /**
     * getFields: string[] -> used to validate user supplied field names. It will be fired before querying to validate allowed columns
     *      if not field names are used from arguments then return an empty array
     */
    getFields: (args: any[]) => string[];
    /**
     * allowedFields passed for multicol functions (e.g.: $rowhash)
     */
    getQuery: (params: {
        allowedFields: string[];
        args: any[];
        tableAlias?: string;
        ctidField?: string;
    }) => string;
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
    constructor(params: {
        allowedFields: string[];
        computedFields: FieldSpec[];
        functions: FunctionSpec[];
        allFields: string[];
        isView: boolean;
    });
    private checkField;
    private addItem;
    private addFunctionByName;
    private addFunction;
    addColumn: (fieldName: string, selected: boolean) => void;
    parseUserSelect: (userSelect: FieldFilter, joinParse?: (key: string, val: any, throwErr: (msg: string) => any) => any) => Promise<any[]>;
}
export declare function getNewQuery(_this: TableHandler, filter: Filter, selectParams?: SelectParams & {
    alias?: string;
}, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<NewQuery>;
export declare function makeQuery(_this: TableHandler, q: NewQuery, depth?: number, joinFields?: string[]): string;
//# sourceMappingURL=QueryBuilder.d.ts.map
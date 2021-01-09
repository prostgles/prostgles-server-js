import { Filter, LocalParams, TableHandler } from "./DboBuilder";
import { TableRule } from "./Prostgles";
import { SelectParams } from "prostgles-types";
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
export declare const COMPUTED_FIELDS: FieldSpec[];
export declare function getNewQuery(_this: TableHandler, filter: Filter, selectParams?: SelectParams & {
    alias?: string;
}, param3_unused?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<NewQuery>;
export declare function makeQuery(_this: TableHandler, q: NewQuery, depth?: number, joinFields?: string[]): string;
//# sourceMappingURL=QueryBuilder.d.ts.map
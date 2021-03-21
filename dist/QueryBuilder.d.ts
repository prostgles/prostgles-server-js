import { Filter, LocalParams, TableHandler, TS_PG_Types } from "./DboBuilder";
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
    having: string;
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
export declare class FilterBuilder {
    constructor();
}
declare type TSDataType = keyof typeof TS_PG_Types;
export declare type FilterSpec = {
    operands: string[];
    tsDataTypes: TSDataType[];
    tsDefinition: string;
    getQuery: (leftQuery: string, rightVal: any) => string;
};
export declare type NullableFilter = null;
/**
 * Example: col_name: { $gt: 2 }
 * @alias CompareFilter
 */
export declare type CompareFilter<T = Date | number | string | boolean> = T | {
    "=": T;
}
/**
 * column value equals provided value
 */
 | {
    "$eq": T;
} | {
    "<>": T;
} | {
    "$ne": T;
} | {
    ">": T;
} | {
    "$gt": T;
} | {
    ">=": T;
} | {
    "$gte": T;
} | {
    "<=": T;
} | {
    "$lte": T;
} | {
    "$in": T[];
} | {
    "$nin": T[];
} | {
    "$between": [T, T];
};
export declare type FTSFilter = {
    "to_tsquery": string[];
} | {
    "plainto_tsquery": string[];
} | {
    "phraseto_tsquery": string[];
} | {
    "websearch_to_tsquery": string[];
};
export declare type TextFilter = CompareFilter<string> | {
    "$ilike": string;
} | {
    "$like": string;
} | {
    "@@": FTSFilter;
} | {
    "@>": FTSFilter;
} | {
    "$contains": FTSFilter;
} | {
    "<@": FTSFilter;
} | {
    "$containedBy": FTSFilter;
};
export declare type ArrayFilter<T = (number | boolean | string)[]> = CompareFilter<T> | {
    "@>": T;
} | {
    "$contains": T;
} | {
    "<@": T;
} | {
    "$containedBy": T;
} | {
    "&&": T;
} | {
    "$overlaps": T;
};
/**
 * Makes bounding box from NW and SE points
 * float xmin, float ymin, float xmax, float ymax, integer srid=unknown
 * https://postgis.net/docs/ST_MakeEnvelope.html
 */
declare type GeoBBox = {
    ST_MakeEnvelope: number[];
};
/**
 * Returns TRUE if A's 2D bounding box intersects B's 2D bounding box.
 * https://postgis.net/docs/reference.html#Operators
 */
export declare type GeomFilter = 
/**
 * A's 2D bounding box intersects B's 2D bounding box.
 */
{
    "&&": GeoBBox;
} | {
    "&&&": GeoBBox;
} | {
    "&<": GeoBBox;
} | {
    "&<|": GeoBBox;
} | {
    "&>": GeoBBox;
} | {
    "<<": GeoBBox;
} | {
    "<<|": GeoBBox;
} | {
    "=": GeoBBox;
} | {
    ">>": GeoBBox;
}
/**
 * A's bounding box is contained by B's
 */
 | {
    "@": GeoBBox;
} | {
    "|&>": GeoBBox;
} | {
    "|>>": GeoBBox;
}
/**
 * A's bounding box contains B's.
 */
 | {
    "~": GeoBBox;
} | {
    "~=": GeoBBox;
};
declare type AllowedTSTypes = string | number | boolean | Date | any[];
declare type AnyObject = {
    [key: string]: AllowedTSTypes;
};
declare type FilterDataType<T = any> = T extends string ? TextFilter : T extends number ? CompareFilter<T> : T extends boolean ? CompareFilter<T> : T extends Date ? CompareFilter<T> : T extends any[] ? ArrayFilter<T> : (CompareFilter<T> & ArrayFilter<T> & TextFilter & GeomFilter);
export declare type FilterForObject<T = AnyObject> = {
    [K in keyof Partial<T>]: FilterDataType<T[K]>;
};
export declare type TableFilter<T = AnyObject> = FilterForObject<T> | {
    $and: (FilterForObject<T> | TableFilter)[];
} | {
    $or: (FilterForObject<T> | TableFilter)[];
} | {
    $not: FilterForObject<T>;
};
export declare const EXISTS_KEYS: readonly ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];
export declare type EXISTS_KEY = typeof EXISTS_KEYS[number];
export declare type ExsFilter = Partial<{
    [key in EXISTS_KEY]: number;
}>;
export declare type ExistsFilter<Obj = AnyObject> = {
    $exists: TableFilter<Obj>;
};
export declare type FinalFilter = TableFilter | ExistsFilter;
export declare const pParseFilter: (_f: ExistsFilter | FilterForObject, select: SelectItem[], pgp: any) => string;
export {};
//# sourceMappingURL=QueryBuilder.d.ts.map
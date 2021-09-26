export declare type CompareFilter<T = Date | number | string | boolean> = T | {
    "=": T;
} | {
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
export declare const CompareFilterKeys: string[];
export declare const CompareInFilterKeys: string[];
export declare type FullTextSearchFilter = {
    "to_tsquery": string[];
} | {
    "plainto_tsquery": string[];
} | {
    "phraseto_tsquery": string[];
} | {
    "websearch_to_tsquery": string[];
};
export declare const TextFilter_FullTextSearchFilterKeys: string[];
export declare type TextFilter = CompareFilter<string> | {
    "$ilike": string;
} | {
    "$like": string;
} | {
    "@@": FullTextSearchFilter;
} | {
    "@>": FullTextSearchFilter;
} | {
    "$contains": FullTextSearchFilter;
} | {
    "<@": FullTextSearchFilter;
} | {
    "$containedBy": FullTextSearchFilter;
};
export declare const TextFilterFTSKeys: string[];
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
export declare type GeoBBox = {
    ST_MakeEnvelope: number[];
};
export declare type GeomFilter = {
    "&&": GeoBBox;
} | {
    "@": GeoBBox;
};
export declare const GeomFilterKeys: string[];
export declare const GeomFilter_Funcs: string[];
export declare type AllowedTSTypes = string | number | boolean | Date | any[];
export declare type AnyObject = {
    [key: string]: any;
};
export declare type FilterDataType<T = any> = T extends string ? TextFilter : T extends number ? CompareFilter<T> : T extends boolean ? CompareFilter<T> : T extends Date ? CompareFilter<T> : T extends any[] ? ArrayFilter<T> : (CompareFilter<T> & ArrayFilter<T> & TextFilter & GeomFilter);
export declare const EXISTS_KEYS: readonly ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];
export declare type EXISTS_KEY = typeof EXISTS_KEYS[number];
export declare type FilterForObject<T = AnyObject> = {
    [K in keyof Partial<T> & AnyObject]: FilterDataType<T[K]>;
} | {
    [K in keyof Omit<{
        [key: string]: any;
    }, keyof T>]: (FilterDataType | Date | string | number | (Date | string | number)[]);
};
export declare type FilterItem<T = AnyObject> = FilterForObject<T> | Partial<{
    [key in EXISTS_KEY]: {
        [key: string]: FilterForObject;
    };
}>;
export declare type FullFilter<T = AnyObject> = FilterItem<T> | {
    $and: (FilterItem<T> | FullFilter)[];
} | {
    $or: (FilterItem<T> | FullFilter)[];
} | {
    $not: FilterItem<T>;
};
export declare type FullFilterBasic<T = {
    [key: string]: any;
}> = {
    [key in keyof Partial<T & {
        [key: string]: any;
    }>]: any;
};
//# sourceMappingURL=filters.d.ts.map
export declare type FieldFilter = object | string[] | "*" | "";
export declare type OrderBy = {
    key: string;
    asc: boolean;
}[] | {
    [key: string]: boolean;
}[] | string | string[];
export declare type SelectParams = {
    select?: FieldFilter;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    expectOne?: boolean;
};
export declare type UpdateParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
    multi?: boolean;
};
export declare type InsertParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
};
export declare type DeleteParams = {
    returning?: FieldFilter;
};
declare type Pixels = {
    id?: number;
    rgb?: string;
    drawn?: boolean;
    xy?: string;
    last_updated?: number;
    blb?: string;
};
declare type DBO_pixels = {
    find: (filter?: object, selectParams?: SelectParams, param3_unused?: any) => Promise<Pixels[]>;
    findOne: (filter?: object, selectParams?: SelectParams, param3_unused?: any) => Promise<Pixels>;
    subscribe: (filter: object, params: SelectParams, onData: (items: Pixels[]) => any) => {
        unsubscribe: () => any;
    };
    count: (filter?: object) => Promise<number>;
    update: (filter: object, newData: Pixels, params?: UpdateParams) => Promise<void | Pixels>;
    upsert: (filter: object, newData: Pixels, params?: UpdateParams) => Promise<void | Pixels>;
    insert: (data: (Pixels | Pixels[]), params?: InsertParams) => Promise<void | Pixels>;
    delete: (filter: object, params?: DeleteParams) => Promise<void | Pixels>;
};
export declare type DBObj = {
    pixels: DBO_pixels;
};
export {};
//# sourceMappingURL=DBoGenerated.d.ts.map
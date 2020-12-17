export declare type Filter = object | {} | undefined;
export declare type GroupFilter = {
    $and: Filter;
} | {
    $or: Filter;
};
export declare type FieldFilter = object | string[] | "*" | "";
export declare type AscOrDesc = 1 | -1 | boolean;
export declare type OrderBy = {
    key: string;
    asc: AscOrDesc;
}[] | {
    [key: string]: AscOrDesc;
}[] | {
    [key: string]: AscOrDesc;
} | string | string[];
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
export declare type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>);
};
export declare type JoinMaker = (filter?: object, select?: FieldFilter, options?: SelectParams) => any;
export declare type Items = {
    name?: string;
    h?: Array<string>;
    id?: number;
};
export declare type Items_Filter = Items | object | {
    $and: (Items | object)[];
} | {
    $or: (Items | object)[];
};
export declare type Items2 = {
    items_id?: number;
    id?: number;
    hh?: Array<string>;
    name?: string;
};
export declare type Items2_Filter = Items2 | object | {
    $and: (Items2 | object)[];
} | {
    $or: (Items2 | object)[];
};
export declare type Items3 = {
    h?: Array<string>;
    name?: string;
    id?: number;
};
export declare type Items3_Filter = Items3 | object | {
    $and: (Items3 | object)[];
} | {
    $or: (Items3 | object)[];
};
export declare type Table = {
    id?: string;
};
export declare type Table_Filter = Table | object | {
    $and: (Table | object)[];
} | {
    $or: (Table | object)[];
};
export declare type Transaction = {
    id?: string;
};
export declare type Transaction_Filter = Transaction | object | {
    $and: (Transaction | object)[];
} | {
    $or: (Transaction | object)[];
};
export declare type DBO_items = {
    getColumns: () => Promise<any[]>;
    find: (filter?: Items_Filter, selectParams?: SelectParams) => Promise<Items[] | any[]>;
    findOne: (filter?: Items_Filter, selectParams?: SelectParams) => Promise<Items | any>;
    subscribe: (filter: Items_Filter, params: SelectParams, onData: (items: Items[]) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne: (filter: Items_Filter, params: SelectParams, onData: (item: Items) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    count: (filter?: Items_Filter) => Promise<number>;
    update: (filter: Items_Filter, newData: Items, params?: UpdateParams) => Promise<void | Items>;
    upsert: (filter: Items_Filter, newData: Items, params?: UpdateParams) => Promise<void | Items>;
    insert: (data: (Items | Items[]), params?: InsertParams) => Promise<void | Items>;
    delete: (filter: Items_Filter, params?: DeleteParams) => Promise<void | Items>;
};
export declare type DBO_items2 = {
    getColumns: () => Promise<any[]>;
    find: (filter?: Items2_Filter, selectParams?: SelectParams) => Promise<Items2[] | any[]>;
    findOne: (filter?: Items2_Filter, selectParams?: SelectParams) => Promise<Items2 | any>;
    subscribe: (filter: Items2_Filter, params: SelectParams, onData: (items: Items2[]) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne: (filter: Items2_Filter, params: SelectParams, onData: (item: Items2) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    count: (filter?: Items2_Filter) => Promise<number>;
    update: (filter: Items2_Filter, newData: Items2, params?: UpdateParams) => Promise<void | Items2>;
    upsert: (filter: Items2_Filter, newData: Items2, params?: UpdateParams) => Promise<void | Items2>;
    insert: (data: (Items2 | Items2[]), params?: InsertParams) => Promise<void | Items2>;
    delete: (filter: Items2_Filter, params?: DeleteParams) => Promise<void | Items2>;
};
export declare type DBO_items3 = {
    getColumns: () => Promise<any[]>;
    find: (filter?: Items3_Filter, selectParams?: SelectParams) => Promise<Items3[] | any[]>;
    findOne: (filter?: Items3_Filter, selectParams?: SelectParams) => Promise<Items3 | any>;
    subscribe: (filter: Items3_Filter, params: SelectParams, onData: (items: Items3[]) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne: (filter: Items3_Filter, params: SelectParams, onData: (item: Items3) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    count: (filter?: Items3_Filter) => Promise<number>;
    update: (filter: Items3_Filter, newData: Items3, params?: UpdateParams) => Promise<void | Items3>;
    upsert: (filter: Items3_Filter, newData: Items3, params?: UpdateParams) => Promise<void | Items3>;
    insert: (data: (Items3 | Items3[]), params?: InsertParams) => Promise<void | Items3>;
    delete: (filter: Items3_Filter, params?: DeleteParams) => Promise<void | Items3>;
};
export declare type DBO_table = {
    getColumns: () => Promise<any[]>;
    find: (filter?: Table_Filter, selectParams?: SelectParams) => Promise<Table[] | any[]>;
    findOne: (filter?: Table_Filter, selectParams?: SelectParams) => Promise<Table | any>;
    subscribe: (filter: Table_Filter, params: SelectParams, onData: (items: Table[]) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne: (filter: Table_Filter, params: SelectParams, onData: (item: Table) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    count: (filter?: Table_Filter) => Promise<number>;
    update: (filter: Table_Filter, newData: Table, params?: UpdateParams) => Promise<void | Table>;
    upsert: (filter: Table_Filter, newData: Table, params?: UpdateParams) => Promise<void | Table>;
    insert: (data: (Table | Table[]), params?: InsertParams) => Promise<void | Table>;
    delete: (filter: Table_Filter, params?: DeleteParams) => Promise<void | Table>;
};
export declare type DBO_transaction = {
    getColumns: () => Promise<any[]>;
    find: (filter?: Transaction_Filter, selectParams?: SelectParams) => Promise<Transaction[] | any[]>;
    findOne: (filter?: Transaction_Filter, selectParams?: SelectParams) => Promise<Transaction | any>;
    subscribe: (filter: Transaction_Filter, params: SelectParams, onData: (items: Transaction[]) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    subscribeOne: (filter: Transaction_Filter, params: SelectParams, onData: (item: Transaction) => any) => Promise<{
        unsubscribe: () => any;
    }>;
    count: (filter?: Transaction_Filter) => Promise<number>;
    update: (filter: Transaction_Filter, newData: Transaction, params?: UpdateParams) => Promise<void | Transaction>;
    upsert: (filter: Transaction_Filter, newData: Transaction, params?: UpdateParams) => Promise<void | Transaction>;
    insert: (data: (Transaction | Transaction[]), params?: InsertParams) => Promise<void | Transaction>;
    delete: (filter: Transaction_Filter, params?: DeleteParams) => Promise<void | Transaction>;
};
export declare type JoinMakerTables = {
    items: JoinMaker;
    items2: JoinMaker;
    items3: JoinMaker;
};
export declare type DBObj = {
    items: DBO_items;
    items2: DBO_items2;
    items3: DBO_items3;
    table: DBO_table;
    transaction: DBO_transaction;
    leftJoin: JoinMakerTables;
    innerJoin: JoinMakerTables;
    leftJoinOne: JoinMakerTables;
    innerJoinOne: JoinMakerTables;
    tx: (t: TxCB) => Promise<any | void>;
};
//# sourceMappingURL=DBoGenerated.d.ts.map
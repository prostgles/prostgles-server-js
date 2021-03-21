/* This file was generated by Prostgles 
*/ 

 

/* COMMON TYPES */

export type Filter<T = any> = object | {} | T | undefined | any[];
export type GroupFilter<T = any> = { "$and": Filter<T> } | { "$or": Filter<T> } | { "$not": Filter<T> };
export type FieldFilter<T> = string[] | "*" | "" | {
    [Key in keyof Partial<T & { [key: string]: any }>]:  any;
};
export type AscOrDesc = 1 | -1 | boolean;
export type OrderBy = { key: string, asc: AscOrDesc }[] | { [key: string]: AscOrDesc }[] | { [key: string]: AscOrDesc } | string | string[];
        
export type SelectParams<T> = {
    select?: FieldFilter<T>;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    expectOne?: boolean;
}
export type UpdateParams<T> = {
    returning?: FieldFilter<T>;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
    multi?: boolean;
}
export type InsertParams<T> = {
    returning?: FieldFilter<T>;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
}
export type DeleteParams<T> = {
    returning?: FieldFilter<T>;
};
export type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>)
};
export type JoinMaker<T> = (filter?: Filter<T>, select?: FieldFilter<T>, options?: SelectParams<T>) => any;


export type ViewHandler<T> = {
    getColumns: () => Promise<any[]>;
    find: <TD = T>(filter?: Filter<T>, selectParams?: SelectParams<T>) => Promise<Partial<TD & { [x: string]: any }>[]>;
    findOne: <TD = T>(filter?: Filter<T>, selectParams?: SelectParams<T>) => Promise<Partial<TD & { [x: string]: any }>>;
    subscribe: <TD = T>(filter: Filter<T>, params: SelectParams<T>, onData: (items: Partial<TD & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
    subscribeOne: <TD = T>(filter: Filter<T>, params: SelectParams<T>, onData: (item: Partial<TD & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
    count: (filter?: Filter<T>) => Promise<number>
}

export type TableHandler<T> = ViewHandler<T> & {
    update: <TD = Partial<T> | void> (filter: Filter<T>, newData: T, params?: UpdateParams<T>) => Promise<TD>;
    updateBatch: <TD = Partial<T> | void> (updateData: [Filter<T>, T][], params?: UpdateParams<T>) => Promise<TD>;
    upsert: <TD = Partial<T> | void> (filter: Filter<T>, newData: T, params?: UpdateParams<T>) => Promise<TD>;
    insert: <TD = Partial<T> | void> (data: (T | T[]), params?: InsertParams<T>) => Promise<TD>;
    delete: <TD = Partial<T> | void> (filter?: T, params?: DeleteParams<T>) => Promise<TD>;
}



/* SCHEMA DEFINITON. Table names have been altered to work with Typescript */
export type D_34_42_34 = { 
  "\"*\""?: string;
  "id"?: number;
}
export type D_42 = { 
  "*"?: string;
  "id"?: number;
}
export type Ex_j_ins = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
  "public"?: string;
}
export type Item_children = { 
  "id"?: number;
  "item_id"?: number;
  "name"?: string;
  "tst"?: Date;
}
export type Items = { 
  "id"?: number;
  "name"?: string;
  "tst"?: Date;
}
export type Items2 = { 
  "hh"?: Array<string>;
  "id"?: number;
  "items_id"?: number;
  "name"?: string;
}
export type Items3 = { 
  "h"?: Array<string>;
  "id"?: number;
  "name"?: string;
}
export type Items4 = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
  "public"?: string;
}
export type Items4_pub = { 
  "added"?: Date;
  "id"?: number;
  "name"?: string;
  "public"?: string;
}
export type Planes = { 
  "flight_number"?: string;
  "id"?: number;
  "last_updated"?: number;
  "x"?: number;
  "y"?: number;
}
export type Transaction = { 
  "id"?: string;
}
export type Z = { 
  "ccc"?: string;
  "id"?: number;
}

export type JoinMakerTables = {
 "item_children": JoinMaker<Item_children>;
 "items": JoinMaker<Items>;
};

/* DBO Definition. Isomorphic */
export type DBObj = {
  "\"*\"": TableHandler<D_34_42_34> 
  "*": TableHandler<D_42> 
  "ex_j_ins": TableHandler<Ex_j_ins> 
  "item_children": TableHandler<Item_children> 
  "items": TableHandler<Items> 
  "items2": TableHandler<Items2> 
  "items3": TableHandler<Items3> 
  "items4": TableHandler<Items4> 
  "items4_pub": TableHandler<Items4_pub> 
  "planes": TableHandler<Planes> 
  "transaction": TableHandler<Transaction> 
  "z": TableHandler<Z> 
  leftJoin: JoinMakerTables;
  innerJoin: JoinMakerTables;
  leftJoinOne: JoinMakerTables;
  innerJoinOne: JoinMakerTables;
};

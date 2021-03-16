/* This file was generated by Prostgles 
*/ 

 
export type Filter = object | {} | undefined;
export type GroupFilter = { $and: Filter } | { $or: Filter };
export type FieldFilter = object | string[] | "*" | "";
export type AscOrDesc = 1 | -1 | boolean;
export type OrderBy = { key: string, asc: AscOrDesc }[] | { [key: string]: AscOrDesc }[] | { [key: string]: AscOrDesc } | string | string[];
        
export type SelectParams = {
    select?: FieldFilter;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    expectOne?: boolean;
}
export type UpdateParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
    multi?: boolean;
}
export type InsertParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
}
export type DeleteParams = {
    returning?: FieldFilter;
};
export type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>)
};
export type JoinMaker = (filter?: object, select?: FieldFilter, options?: SelectParams) => any;


export type D_34_42_34 = {
     "\"*\""?: string;
     "id"?: number;
};
export type D_34_42_34_Filter = D_34_42_34 | object | { $and: (D_34_42_34 | object)[] } | { $or: (D_34_42_34 | object)[] } 
export type D_42 = {
     "*"?: string;
     "id"?: number;
};
export type D_42_Filter = D_42 | object | { $and: (D_42 | object)[] } | { $or: (D_42 | object)[] } 
export type Ex_j_ins = {
     "added"?: Date;
     "id"?: number;
     "name"?: string;
     "public"?: string;
};
export type Ex_j_ins_Filter = Ex_j_ins | object | { $and: (Ex_j_ins | object)[] } | { $or: (Ex_j_ins | object)[] } 
export type Items = {
     "h"?: Array<string>;
     "id"?: number;
     "name"?: string;
};
export type Items_Filter = Items | object | { $and: (Items | object)[] } | { $or: (Items | object)[] } 
export type Items2 = {
     "hh"?: Array<string>;
     "id"?: number;
     "items_id"?: number;
     "name"?: string;
};
export type Items2_Filter = Items2 | object | { $and: (Items2 | object)[] } | { $or: (Items2 | object)[] } 
export type Items3 = {
     "h"?: Array<string>;
     "id"?: number;
     "name"?: string;
};
export type Items3_Filter = Items3 | object | { $and: (Items3 | object)[] } | { $or: (Items3 | object)[] } 
export type Items4 = {
     "added"?: Date;
     "id"?: number;
     "name"?: string;
     "public"?: string;
};
export type Items4_Filter = Items4 | object | { $and: (Items4 | object)[] } | { $or: (Items4 | object)[] } 
export type Items4_pub = {
     "added"?: Date;
     "id"?: number;
     "name"?: string;
     "public"?: string;
};
export type Items4_pub_Filter = Items4_pub | object | { $and: (Items4_pub | object)[] } | { $or: (Items4_pub | object)[] } 
export type Planes = {
     "flight_number"?: string;
     "id"?: number;
     "last_updated"?: number;
     "x"?: number;
     "y"?: number;
};
export type Planes_Filter = Planes | object | { $and: (Planes | object)[] } | { $or: (Planes | object)[] } 
export type T_ = {
     "t"?: string;
};
export type T__Filter = T_ | object | { $and: (T_ | object)[] } | { $or: (T_ | object)[] } 
export type Table = {
     "id"?: string;
};
export type Table_Filter = Table | object | { $and: (Table | object)[] } | { $or: (Table | object)[] } 
export type Transaction = {
     "id"?: string;
};
export type Transaction_Filter = Transaction | object | { $and: (Transaction | object)[] } | { $or: (Transaction | object)[] } 
export type V_items = {
     "id"?: number;
     "name"?: string;
};
export type V_items_Filter = V_items | object | { $and: (V_items | object)[] } | { $or: (V_items | object)[] } 

export type DBO__34_42_34 = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  D_34_42_34_Filter , selectParams?: SelectParams) => Promise<Partial<D_34_42_34 & { [x: string]: any }>[]>;
   findOne: (filter?:  D_34_42_34_Filter , selectParams?: SelectParams) => Promise<Partial<D_34_42_34 & { [x: string]: any }>>;
   subscribe: (filter:  D_34_42_34_Filter , params: SelectParams, onData: (items: Partial<D_34_42_34 & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  D_34_42_34_Filter , params: SelectParams, onData: (item: Partial<D_34_42_34 & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  D_34_42_34_Filter ) => Promise<number>;
   update: <T = Partial<D_34_42_34> | void> (filter:  D_34_42_34_Filter , newData: D_34_42_34, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<D_34_42_34> | void> (updateData: [ D_34_42_34_Filter , D_34_42_34][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<D_34_42_34> | void> (filter:  D_34_42_34_Filter , newData: D_34_42_34, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<D_34_42_34> | void> (data: (D_34_42_34 | D_34_42_34[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<D_34_42_34> | void> (filter?:  D_34_42_34_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO__42 = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  D_42_Filter , selectParams?: SelectParams) => Promise<Partial<D_42 & { [x: string]: any }>[]>;
   findOne: (filter?:  D_42_Filter , selectParams?: SelectParams) => Promise<Partial<D_42 & { [x: string]: any }>>;
   subscribe: (filter:  D_42_Filter , params: SelectParams, onData: (items: Partial<D_42 & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  D_42_Filter , params: SelectParams, onData: (item: Partial<D_42 & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  D_42_Filter ) => Promise<number>;
   update: <T = Partial<D_42> | void> (filter:  D_42_Filter , newData: D_42, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<D_42> | void> (updateData: [ D_42_Filter , D_42][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<D_42> | void> (filter:  D_42_Filter , newData: D_42, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<D_42> | void> (data: (D_42 | D_42[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<D_42> | void> (filter?:  D_42_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_ex_j_ins = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Ex_j_ins_Filter , selectParams?: SelectParams) => Promise<Partial<Ex_j_ins & { [x: string]: any }>[]>;
   findOne: (filter?:  Ex_j_ins_Filter , selectParams?: SelectParams) => Promise<Partial<Ex_j_ins & { [x: string]: any }>>;
   subscribe: (filter:  Ex_j_ins_Filter , params: SelectParams, onData: (items: Partial<Ex_j_ins & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Ex_j_ins_Filter , params: SelectParams, onData: (item: Partial<Ex_j_ins & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Ex_j_ins_Filter ) => Promise<number>;
   update: <T = Partial<Ex_j_ins> | void> (filter:  Ex_j_ins_Filter , newData: Ex_j_ins, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Ex_j_ins> | void> (updateData: [ Ex_j_ins_Filter , Ex_j_ins][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Ex_j_ins> | void> (filter:  Ex_j_ins_Filter , newData: Ex_j_ins, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Ex_j_ins> | void> (data: (Ex_j_ins | Ex_j_ins[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Ex_j_ins> | void> (filter?:  Ex_j_ins_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_items = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Items_Filter , selectParams?: SelectParams) => Promise<Partial<Items & { [x: string]: any }>[]>;
   findOne: (filter?:  Items_Filter , selectParams?: SelectParams) => Promise<Partial<Items & { [x: string]: any }>>;
   subscribe: (filter:  Items_Filter , params: SelectParams, onData: (items: Partial<Items & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Items_Filter , params: SelectParams, onData: (item: Partial<Items & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Items_Filter ) => Promise<number>;
   update: <T = Partial<Items> | void> (filter:  Items_Filter , newData: Items, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Items> | void> (updateData: [ Items_Filter , Items][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Items> | void> (filter:  Items_Filter , newData: Items, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Items> | void> (data: (Items | Items[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Items> | void> (filter?:  Items_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_items2 = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Items2_Filter , selectParams?: SelectParams) => Promise<Partial<Items2 & { [x: string]: any }>[]>;
   findOne: (filter?:  Items2_Filter , selectParams?: SelectParams) => Promise<Partial<Items2 & { [x: string]: any }>>;
   subscribe: (filter:  Items2_Filter , params: SelectParams, onData: (items: Partial<Items2 & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Items2_Filter , params: SelectParams, onData: (item: Partial<Items2 & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Items2_Filter ) => Promise<number>;
   update: <T = Partial<Items2> | void> (filter:  Items2_Filter , newData: Items2, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Items2> | void> (updateData: [ Items2_Filter , Items2][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Items2> | void> (filter:  Items2_Filter , newData: Items2, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Items2> | void> (data: (Items2 | Items2[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Items2> | void> (filter?:  Items2_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_items3 = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Items3_Filter , selectParams?: SelectParams) => Promise<Partial<Items3 & { [x: string]: any }>[]>;
   findOne: (filter?:  Items3_Filter , selectParams?: SelectParams) => Promise<Partial<Items3 & { [x: string]: any }>>;
   subscribe: (filter:  Items3_Filter , params: SelectParams, onData: (items: Partial<Items3 & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Items3_Filter , params: SelectParams, onData: (item: Partial<Items3 & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Items3_Filter ) => Promise<number>;
   update: <T = Partial<Items3> | void> (filter:  Items3_Filter , newData: Items3, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Items3> | void> (updateData: [ Items3_Filter , Items3][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Items3> | void> (filter:  Items3_Filter , newData: Items3, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Items3> | void> (data: (Items3 | Items3[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Items3> | void> (filter?:  Items3_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_items4 = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Items4_Filter , selectParams?: SelectParams) => Promise<Partial<Items4 & { [x: string]: any }>[]>;
   findOne: (filter?:  Items4_Filter , selectParams?: SelectParams) => Promise<Partial<Items4 & { [x: string]: any }>>;
   subscribe: (filter:  Items4_Filter , params: SelectParams, onData: (items: Partial<Items4 & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Items4_Filter , params: SelectParams, onData: (item: Partial<Items4 & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Items4_Filter ) => Promise<number>;
   update: <T = Partial<Items4> | void> (filter:  Items4_Filter , newData: Items4, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Items4> | void> (updateData: [ Items4_Filter , Items4][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Items4> | void> (filter:  Items4_Filter , newData: Items4, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Items4> | void> (data: (Items4 | Items4[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Items4> | void> (filter?:  Items4_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_items4_pub = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Items4_pub_Filter , selectParams?: SelectParams) => Promise<Partial<Items4_pub & { [x: string]: any }>[]>;
   findOne: (filter?:  Items4_pub_Filter , selectParams?: SelectParams) => Promise<Partial<Items4_pub & { [x: string]: any }>>;
   subscribe: (filter:  Items4_pub_Filter , params: SelectParams, onData: (items: Partial<Items4_pub & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Items4_pub_Filter , params: SelectParams, onData: (item: Partial<Items4_pub & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Items4_pub_Filter ) => Promise<number>;
   update: <T = Partial<Items4_pub> | void> (filter:  Items4_pub_Filter , newData: Items4_pub, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Items4_pub> | void> (updateData: [ Items4_pub_Filter , Items4_pub][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Items4_pub> | void> (filter:  Items4_pub_Filter , newData: Items4_pub, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Items4_pub> | void> (data: (Items4_pub | Items4_pub[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Items4_pub> | void> (filter?:  Items4_pub_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_planes = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Planes_Filter , selectParams?: SelectParams) => Promise<Partial<Planes & { [x: string]: any }>[]>;
   findOne: (filter?:  Planes_Filter , selectParams?: SelectParams) => Promise<Partial<Planes & { [x: string]: any }>>;
   subscribe: (filter:  Planes_Filter , params: SelectParams, onData: (items: Partial<Planes & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Planes_Filter , params: SelectParams, onData: (item: Partial<Planes & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Planes_Filter ) => Promise<number>;
   update: <T = Partial<Planes> | void> (filter:  Planes_Filter , newData: Planes, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Planes> | void> (updateData: [ Planes_Filter , Planes][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Planes> | void> (filter:  Planes_Filter , newData: Planes, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Planes> | void> (data: (Planes | Planes[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Planes> | void> (filter?:  Planes_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_t = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  T__Filter , selectParams?: SelectParams) => Promise<Partial<T_ & { [x: string]: any }>[]>;
   findOne: (filter?:  T__Filter , selectParams?: SelectParams) => Promise<Partial<T_ & { [x: string]: any }>>;
   subscribe: (filter:  T__Filter , params: SelectParams, onData: (items: Partial<T_ & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  T__Filter , params: SelectParams, onData: (item: Partial<T_ & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  T__Filter ) => Promise<number>;
   update: <T = Partial<T_> | void> (filter:  T__Filter , newData: T_, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<T_> | void> (updateData: [ T__Filter , T_][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<T_> | void> (filter:  T__Filter , newData: T_, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<T_> | void> (data: (T_ | T_[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<T_> | void> (filter?:  T__Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_table = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Table_Filter , selectParams?: SelectParams) => Promise<Partial<Table & { [x: string]: any }>[]>;
   findOne: (filter?:  Table_Filter , selectParams?: SelectParams) => Promise<Partial<Table & { [x: string]: any }>>;
   subscribe: (filter:  Table_Filter , params: SelectParams, onData: (items: Partial<Table & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Table_Filter , params: SelectParams, onData: (item: Partial<Table & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Table_Filter ) => Promise<number>;
   update: <T = Partial<Table> | void> (filter:  Table_Filter , newData: Table, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Table> | void> (updateData: [ Table_Filter , Table][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Table> | void> (filter:  Table_Filter , newData: Table, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Table> | void> (data: (Table | Table[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Table> | void> (filter?:  Table_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_transaction = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  Transaction_Filter , selectParams?: SelectParams) => Promise<Partial<Transaction & { [x: string]: any }>[]>;
   findOne: (filter?:  Transaction_Filter , selectParams?: SelectParams) => Promise<Partial<Transaction & { [x: string]: any }>>;
   subscribe: (filter:  Transaction_Filter , params: SelectParams, onData: (items: Partial<Transaction & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Transaction_Filter , params: SelectParams, onData: (item: Partial<Transaction & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Transaction_Filter ) => Promise<number>;
   update: <T = Partial<Transaction> | void> (filter:  Transaction_Filter , newData: Transaction, params?: UpdateParams) => Promise<T>;
   updateBatch: <T = Partial<Transaction> | void> (updateData: [ Transaction_Filter , Transaction][], params?: UpdateParams) => Promise<T>;
   upsert: <T = Partial<Transaction> | void> (filter:  Transaction_Filter , newData: Transaction, params?: UpdateParams) => Promise<T>;
   insert: <T = Partial<Transaction> | void> (data: (Transaction | Transaction[]), params?: InsertParams) => Promise<T>;
   delete: <T = Partial<Transaction> | void> (filter?:  Transaction_Filter , params?: DeleteParams) => Promise<T>; 
};
export type DBO_v_items = {
    getColumns: () => Promise<any[]>;
   find: (filter?:  V_items_Filter , selectParams?: SelectParams) => Promise<Partial<V_items & { [x: string]: any }>[]>;
   findOne: (filter?:  V_items_Filter , selectParams?: SelectParams) => Promise<Partial<V_items & { [x: string]: any }>>;
   subscribe: (filter:  V_items_Filter , params: SelectParams, onData: (items: Partial<V_items & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  V_items_Filter , params: SelectParams, onData: (item: Partial<V_items & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  V_items_Filter ) => Promise<number>; 
};

export type JoinMakerTables = {
 "items": JoinMaker;
 "items2": JoinMaker;
 "items3": JoinMaker;
};

export type DBObj = {
 "\"*\"": DBO__34_42_34;
 "*": DBO__42;
 "ex_j_ins": DBO_ex_j_ins;
 "items": DBO_items;
 "items2": DBO_items2;
 "items3": DBO_items3;
 "items4": DBO_items4;
 "items4_pub": DBO_items4_pub;
 "planes": DBO_planes;
 "t": DBO_t;
 "table": DBO_table;
 "transaction": DBO_transaction;
 "v_items": DBO_v_items;
 leftJoin: JoinMakerTables;
 innerJoin: JoinMakerTables;
 leftJoinOne: JoinMakerTables;
 innerJoinOne: JoinMakerTables;
 tx: (t: TxCB) => Promise<any | void> ;
};

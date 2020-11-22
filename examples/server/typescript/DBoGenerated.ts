/* This file was generated by Prostgles 
* Sun, 22 Nov 2020 15:06:55 GMT 
*/

export type Filter = object | {} | undefined;
export type GroupFilter = { $and: Filter } | { $or: Filter };
export type FieldFilter = object | string[] | "*" | "";
export type OrderBy = { key: string, asc: boolean }[] | { [key: string]: boolean }[] | string | string[];
        
export type SelectParams = {
    select?: FieldFilter;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    expectOne?: boolean;
}
export type UpdateParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;TxHandler
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

export type Items = {
     name?: string;
     id?: number;
};
export type Items_Filter = Items | object | { $and: (Items | object)[] } | { $or: (Items | object)[] } 
export type Table = {
     id?: string;
};
export type Table_Filter = Table | object | { $and: (Table | object)[] } | { $or: (Table | object)[] } 
export type Transaction = {
     id?: string;
};
export type Transaction_Filter = Transaction | object | { $and: (Transaction | object)[] } | { $or: (Transaction | object)[] } 

export type DBO_items = {
    find: (filter?:  Items_Filter , selectParams?: SelectParams) => Promise<Items[]>;
   findOne: (filter?:  Items_Filter , selectParams?: SelectParams) => Promise<Items>;
   subscribe: (filter:  Items_Filter , params: SelectParams, onData: (items: Items[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Items_Filter , params: SelectParams, onData: (item: Items) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Items_Filter ) => Promise<number>;
   update: (filter: object, newData: Items, params?: UpdateParams) => Promise<void | Items>;
   upsert: (filter: object, newData: Items, params?: UpdateParams) => Promise<void | Items>;
   insert: (data: (Items | Items[]), params?: InsertParams) => Promise<void | Items>;
   delete: (filter: object, params?: DeleteParams) => Promise<void | Items>; 
};
export type DBO_table = {
    find: (filter?:  Table_Filter , selectParams?: SelectParams) => Promise<Table[]>;
   findOne: (filter?:  Table_Filter , selectParams?: SelectParams) => Promise<Table>;
   subscribe: (filter:  Table_Filter , params: SelectParams, onData: (items: Table[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Table_Filter , params: SelectParams, onData: (item: Table) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Table_Filter ) => Promise<number>;
   update: (filter: object, newData: Table, params?: UpdateParams) => Promise<void | Table>;
   upsert: (filter: object, newData: Table, params?: UpdateParams) => Promise<void | Table>;
   insert: (data: (Table | Table[]), params?: InsertParams) => Promise<void | Table>;
   delete: (filter: object, params?: DeleteParams) => Promise<void | Table>; 
};
export type DBO_transaction = {
    find: (filter?:  Transaction_Filter , selectParams?: SelectParams) => Promise<Transaction[]>;
   findOne: (filter?:  Transaction_Filter , selectParams?: SelectParams) => Promise<Transaction>;
   subscribe: (filter:  Transaction_Filter , params: SelectParams, onData: (items: Transaction[]) => any) => Promise<{ unsubscribe: () => any }>;
   subscribeOne: (filter:  Transaction_Filter , params: SelectParams, onData: (item: Transaction) => any) => Promise<{ unsubscribe: () => any }>;
   count: (filter?:  Transaction_Filter ) => Promise<number>;
   update: (filter: object, newData: Transaction, params?: UpdateParams) => Promise<void | Transaction>;
   upsert: (filter: object, newData: Transaction, params?: UpdateParams) => Promise<void | Transaction>;
   insert: (data: (Transaction | Transaction[]), params?: InsertParams) => Promise<void | Transaction>;
   delete: (filter: object, params?: DeleteParams) => Promise<void | Transaction>; 
};

export type DBObj = {
 items: DBO_items;
 table: DBO_table;
 transaction: DBO_transaction;
 tt: (t: TxCB) => Promise<any | void> ;
};
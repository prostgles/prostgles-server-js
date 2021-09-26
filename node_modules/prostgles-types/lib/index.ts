
import { FullFilter, AnyObject, FullFilterBasic } from "./filters";

export const _PG_strings = ['bpchar','char','varchar','text','citext','uuid','bytea','inet','time','timetz','interval','name'] as const;
export const _PG_numbers = ['int2','int4','int8','float4','float8','numeric','money','oid'] as const;
export const _PG_json = ['json', 'jsonb'] as const;
export const _PG_bool = ['bool'] as const;
export const _PG_date = ['date', 'timestamp', 'timestamptz'] as const;
export const _PG_postgis = ['geometry'] as const;
export type PG_COLUMN_UDT_DATA_TYPE = 
    | typeof _PG_strings[number] 
    | typeof _PG_numbers[number] 
    | typeof _PG_json[number] 
    | typeof _PG_bool[number] 
    | typeof _PG_date[number] 
    | typeof _PG_postgis[number];
    
export const TS_PG_Types = {
    "string": _PG_strings,
    "number": _PG_numbers,
    "boolean": _PG_bool,
    "Object": _PG_json,
    "Date": _PG_date,
    "Array<number>": _PG_numbers.map(s => `_${s}`),
    "Array<boolean>": _PG_bool.map(s => `_${s}`),
    "Array<string>": _PG_strings.map(s => `_${s}`),
    "Array<Object>": _PG_json.map(s => `_${s}`),
    "Array<Date>": _PG_date.map(s => `_${s}`),
    "any": [],
} as const;
export type TS_COLUMN_DATA_TYPES = keyof typeof TS_PG_Types;

export type ColumnInfo = {
  name: string;

  /**
   * Column display name. Will be first non empty value from i18n data, comment, name 
   */
  label: string;

  /**
   * Column description (if provided)
   */
  comment: string;

  /**
   * Ordinal position of the column within the table (count starts at 1)
   */
  ordinal_position: number;

  /**
   * True if column is nullable. A not-null constraint is one way a column can be known not nullable, but there may be others.
   */
  is_nullable: boolean;

  /**
   * Simplified data type
   */
  data_type: string;

  /**
   * Postgres raw data types. values starting with underscore means it's an array of that data type
   */
  udt_name: PG_COLUMN_UDT_DATA_TYPE;

  /**
   * Element data type
   */
  element_type: string;

  /**
   * Element raw data type
   */
  element_udt_name: string;

  /**
   * PRIMARY KEY constraint on column. A table can have more then one PK
   */
  is_pkey: boolean;

  /**
   * Foreign key constraint 
   */
  references?: {
    ftable: string;
    fcols: string[];
    cols: string[];
  }

  /**
   * true if column has a default value
   * Used for excluding pkey from insert
   */
  has_default: boolean;
}

export type ValidatedColumnInfo = ColumnInfo & {

  /**
   * TypeScript data type
   */
  tsDataType: TS_COLUMN_DATA_TYPES;

  /**
   * Fields that can be viewed
   */
  select: boolean;

  /**
   * Fields that can be filtered by
   */
  filter: boolean;

  /**
   * Fields that can be inserted
   */
  insert: boolean;

  /**
   * Fields that can be updated
   */
  update: boolean;

  /**
   * Fields that can be used in the delete filter
   */
  delete: boolean;
}

/**
 * List of fields to include or exclude
 */
export declare type FieldFilter = {} | string[] | "*" | "" | {
  [key: string]: (1 | 0 | boolean);
};

export type AscOrDesc = 1 | -1 | boolean;

/**
 * @example
 * { product_name: -1 } -> SORT BY product_name DESC
 * [{ field_name: (1 | -1 | boolean) }]
 * true | 1 -> ascending
 * false | -1 -> descending
 * Array order is maintained
 */
export type _OrderBy<T = AnyObject> = 
  | { [K in keyof Partial<T>]: AscOrDesc }
  | { [K in keyof Partial<T>]: AscOrDesc }[]
  | { key: keyof T, asc?: AscOrDesc, nulls?: "last" | "first" }[] 
  | Array<keyof T>
  | keyof T
  ;

export type OrderBy<T = AnyObject> = 
  | _OrderBy<T>
  | _OrderBy<AnyObject>
  ;

export type Select<T = AnyObject> = 
  | { [K in keyof Partial<T>]: any } 
  | {} 
  | undefined 
  | "" 
  | "*" 
  | AnyObject 
  | Array<keyof T>
  ;
export type SelectBasic = 
  | { [key: string]: any } 
  | {} 
  | undefined 
  | "" 
  | "*" 
  ;

/* Simpler types */

 export type SelectParamsBasic = {
  select?: SelectBasic;
  limit?: number;
  offset?: number;
  orderBy?: OrderBy;

  /**
   * Will group by all non aggregated fields specified in select (or all fields by default)
   */
  groupBy?: boolean;

  returnType?: 

  /**
   * Will return the first row as an object. Will throw an error if more than a row is returned. Use limit: 1 to avoid error.
   */
  | "row"

  /**
    * Will return the first value from the selected field
    */
  | "value"

  /**
    * Will return an array of values from the selected field. Similar to array_agg(field).
    */
  | "values"
 ;
}

export type SelectParams<T = AnyObject> = SelectParamsBasic & {
  select?: Select<T>;
  orderBy?: OrderBy<T>;
}
export type SubscribeParams<T = AnyObject> = SelectParams<T> & {
  throttle?: number;
};

export type UpdateParams<T = AnyObject> = {
  returning?: Select<T>;
  onConflictDoNothing?: boolean;
  fixIssues?: boolean;

  /* true by default. If false the update will fail if affecting more than one row */
  multi?: boolean;
}
export type InsertParams<T = AnyObject> = {
  returning?: Select<T>;
  onConflictDoNothing?: boolean;
  fixIssues?: boolean;
}
export type DeleteParams<T = AnyObject> = {
  returning?: Select<T>;
}

export type SubscribeParamsBasic = SelectParamsBasic & {
  throttle?: number;
};

export type UpdateParamsBasic = {
  returning?: SelectBasic;
  onConflictDoNothing?: boolean;
  fixIssues?: boolean;

  /* true by default. If false the update will fail if affecting more than one row */
  multi?: boolean;
}
export type InsertParamsBasic = {
  returning?: SelectBasic;
  onConflictDoNothing?: boolean;
  fixIssues?: boolean;
}
export type DeleteParamsBasic = {
  returning?: SelectBasic;
}
/**
 * Adds unknown props to object
 * Used in represent data returned from a query that can have arbitrary computed fields
 */

export type PartialLax<T = AnyObject> = Partial<T>  & AnyObject;

export type TableInfo = {
  oid: number;
  comment?: string;
  /**
   * Created by prostgles for managing files
   */
  is_media?: boolean;
}

export type OnError = (err: any) => void;

export type SubscriptionHandler<T = AnyObject> = Promise<{
    unsubscribe: () => Promise<any>;
    update?: (newData: T, updateParams: UpdateParams<T>) => Promise<any>;
    delete?: (deleteParams: DeleteParams<T>) => Promise<any>;
    filter: FullFilter<T> | {};
}>

export type ViewHandler<TT = AnyObject> = {
  getInfo?: (lang?: string) => Promise<TableInfo>;
  getColumns?: (lang?: string) => Promise<ValidatedColumnInfo[]>;
  find: <TD = TT>(filter?: FullFilter<TD>, selectParams?: SelectParams<TD>) => Promise<PartialLax<TD>[]>;
  findOne: <TD = TT>(filter?: FullFilter<TD>, selectParams?: SelectParams<TD>) => Promise<PartialLax<TD>>;
  subscribe: <TD = TT>(filter: FullFilter<TD>, params: SubscribeParams<TD>, onData: (items: PartialLax<TD>[], onError?: OnError) => any) => SubscriptionHandler;
  subscribeOne: <TD = TT>(filter: FullFilter<TD>, params: SubscribeParams<TD>, onData: (item: PartialLax<TD>) => any, onError?: OnError) => SubscriptionHandler;
  count: <TD = TT>(filter?: FullFilter<TD>) => Promise<number>;
}

export type TableHandler<TT = AnyObject> = ViewHandler<TT> & {
  update: <TD = TT>(filter: FullFilter<TD>, newData: PartialLax<TD>, params?: UpdateParams<TD>) => Promise<PartialLax<TD> | void>;
  updateBatch: <TD = TT>(data: [FullFilter<TD>, PartialLax<TD>][], params?: UpdateParams<TD>) => Promise<PartialLax<TD> | void>;
  upsert: <TD = TT>(filter: FullFilter<TD>, newData: PartialLax<TD>, params?: UpdateParams<TD>) => Promise<PartialLax<TD> | void>;
  insert: <TD = TT>(data: (PartialLax<TD> | PartialLax<TD>[]), params?: InsertParams<TD>) => Promise<PartialLax<TD> | void>;
  delete: <TD = TT>(filter?: FullFilter<TD>, params?: DeleteParams<TD>) => Promise<PartialLax<TD> | void>;
}

// const c: TableHandler<{ h: number }> = {} as any;
// c.findOne({ }, { select: { h: 2 }}).then(r => {
//   r.hd;
// });
// c.update({ da: 2 }, { zd: '2' });
// c.subscribe({ x: 10}, {}, d => {
//   d.filter(dd => dd.x === 20);
// })


export type ViewHandlerBasic = {
  getInfo?: (lang?: string) => Promise<TableInfo>;
  getColumns?: (lang?: string) => Promise<ValidatedColumnInfo[]>;
  find: <TD = AnyObject>(filter?: FullFilterBasic, selectParams?: SelectParamsBasic) => Promise<PartialLax<TD>[]>;
  findOne: <TD = AnyObject>(filter?: FullFilterBasic, selectParams?: SelectParamsBasic) => Promise<PartialLax<TD>>;
  subscribe: <TD = AnyObject>(filter: FullFilterBasic, params: SubscribeParamsBasic, onData: (items: PartialLax<TD>[], onError?: OnError) => any) => Promise<{ unsubscribe: () => any }>;
  subscribeOne: <TD = AnyObject>(filter: FullFilterBasic, params: SubscribeParamsBasic, onData: (item: PartialLax<TD>, onError?: OnError) => any) => Promise<{ unsubscribe: () => any }>;
  count: (filter?: FullFilterBasic) => Promise<number>;
}

export type TableHandlerBasic = ViewHandlerBasic & {
  update: <TD = AnyObject>(filter: FullFilterBasic, newData: PartialLax<TD>, params?: UpdateParamsBasic) => Promise<PartialLax<TD> | void>;
  updateBatch: <TD = AnyObject>(data: [FullFilterBasic, PartialLax<TD>][], params?: UpdateParamsBasic) => Promise<PartialLax<TD> | void>;
  upsert: <TD = AnyObject>(filter: FullFilterBasic, newData: PartialLax<TD>, params?: UpdateParamsBasic) => Promise<PartialLax<TD> | void>;
  insert: <TD = AnyObject>(data: (PartialLax<TD> | PartialLax<TD>[]), params?: InsertParamsBasic) => Promise<PartialLax<TD> | void>;
  delete: <TD = AnyObject>(filter?: FullFilterBasic, params?: DeleteParamsBasic) => Promise<PartialLax<TD> | void>;
}

export type JoinMaker<TT = AnyObject> = (filter?: FullFilter<TT>, select?: Select<TT>, options?: SelectParams<TT>) => any;
export type JoinMakerBasic = (filter?: FullFilterBasic, select?: SelectBasic, options?: SelectParamsBasic) => any;

export type TableJoin = {
  [key: string]: JoinMaker;
}
export type TableJoinBasic = {
  [key: string]: JoinMakerBasic;
}

export type DbJoinMaker = {
  innerJoin: TableJoin;
  leftJoin: TableJoin;
  innerJoinOne: TableJoin;
  leftJoinOne: TableJoin;
}

export type SQLResult = {
  command: "SELECT" | "UPDATE" | "DELETE" | "CREATE" | "ALTER" | "LISTEN" | "UNLISTEN" | "INSERT" | string;
  rowCount: number;
  rows: AnyObject[];
  fields: {
      name: string;
      dataType: string;
      tableName?: string;
  }[];
  duration: number;
}
export type DBEventHandles = {
  socketChannel: string;
  socketUnsubChannel: string;
  addListener: (listener: (event: any) => void) => { removeListener: () => void; } 
};

/**
 * 
 * @param query <string> query. e.g.: SELECT * FROM users;
 * @param params <any[] | object> query arguments to be escaped. e.g.: { name: 'dwadaw' }
 * @param options <object> { returnType: "statement" | "rows" | "noticeSubscription" }
 */
function sql<ReturnType extends SQLOptions["returnType"] = undefined, OtherOptions = undefined>(
  query: string, 
  args?: any | any[], 
  options?: SQLOptions,
  otherOptions?: OtherOptions
): Promise<(
  ReturnType extends "row"? AnyObject :
  ReturnType extends "rows"? AnyObject[] :
  ReturnType extends "value"? any :
  ReturnType extends "values"? any[] :
  ReturnType extends "statement"? string :
  ReturnType extends "noticeSubscription"? DBEventHandles :
  ReturnType extends undefined? SQLResult :
  SQLResult
)> {
  return "" as unknown as any;
}
export type SQLHandler = typeof sql;

export type DBHandler = {
  [key: string]: Partial<TableHandler>;
} & DbJoinMaker;


/**
 * Simpler DBHandler types to reduce load on TS
 */
export type DBHandlerBasic = {
  [key: string]: Partial<TableHandlerBasic>;
} & {
  innerJoin: TableJoinBasic;
  leftJoin: TableJoinBasic;
  innerJoinOne: TableJoinBasic;
  leftJoinOne: TableJoinBasic;
} & {
  sql?: SQLHandler
}



/**
 * Other
 */

export type DBNoticeConfig = {
  socketChannel: string;
  socketUnsubChannel: string;
}

export type DBNotifConfig = DBNoticeConfig & {
  notifChannel: string;
}


export type SQLOptions = {
  /**
   * Return type
   */
  returnType: SelectParamsBasic["returnType"] | "statement" | "rows" | "noticeSubscription";
} ;

export type SQLRequest = {
  query: string;
  params?: any | any[];
  options?:  SQLOptions
}

export type NotifSubscription = {
  socketChannel: string;
  socketUnsubChannel: string;
  notifChannel: string;
}

export type NoticeSubscription = {
  socketChannel: string;
  socketUnsubChannel: string;
}

const preffix = "_psqlWS_.";
export const CHANNELS = {
  SCHEMA_CHANGED: preffix + "schema-changed",
  SCHEMA: preffix + "schema",


  DEFAULT: preffix,
  SQL: `${preffix}sql`,
  METHOD: `${preffix}method`,
  NOTICE_EV: `${preffix}notice`,
  LISTEN_EV: `${preffix}listen`,

  /* Auth channels */
  REGISTER: `${preffix}register`,
  LOGIN: `${preffix}login`,
  LOGOUT: `${preffix}logout`,

  _preffix: preffix,
}

// import { md5 } from "./md5";
// export { get, getTextPatch, unpatchText, isEmpty, WAL, WALConfig, asName } from "./util";
export * from "./util";
export * from "./filters";

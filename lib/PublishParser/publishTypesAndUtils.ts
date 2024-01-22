import { AnyObject, DBSchema, FullFilter, Method, RULE_METHODS } from "prostgles-types";
import { SessionUser } from "../AuthHandler";
import type { DBOFullyTyped, PublishFullyTyped } from "../DBSchemaBuilder";
import { CommonTableRules, Filter, LocalParams, PRGLIOSocket, TableOrViewInfo } from "../DboBuilder/DboBuilder";
import { DB, DBHandlerServer } from "../Prostgles";

export type PublishMethods<S = void, SUser extends SessionUser = SessionUser> = (params: PublishParams<S, SUser>) => { [key: string]: Method } | Promise<{ [key: string]: Method } | null>;

export type Awaitable<T> = T | Promise<T>;

type Request = {
  socket?: any;
  httpReq?: any;
}

export type DboTable = Request & {
  tableName: string;
  localParams: LocalParams;
}
export type DboTableCommand = Request & DboTable & {
  command: string;
  localParams: LocalParams;
}

export const RULE_TO_METHODS = [
  {
    rule: "getColumns",
    sqlRule: "select",
    methods: RULE_METHODS.getColumns,
    no_limits: true,
    allowed_params: [],
    table_only: false,
    hint: ` expecting false | true | undefined`
  },
  {
    rule: "getInfo",
    sqlRule: "select",
    methods: RULE_METHODS.getInfo,
    no_limits: true,
    allowed_params: [],
    table_only: false,
    hint: ` expecting false | true | undefined`
  },
  {
    rule: "insert",
    sqlRule: "insert",
    methods: RULE_METHODS.insert,
    no_limits: <SelectRule>{ fields: "*" },
    table_only: true,
    allowed_params: { checkFilter: 1, fields: 1, forcedData: 1, postValidate: 1, preValidate: 1, returningFields: 1, validate: 1, allowedNestedInserts: 1 } satisfies Record<keyof InsertRule, 1>,
    hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
  },
  {
    rule: "update",
    sqlRule: "update",
    methods: RULE_METHODS.update,
    no_limits: <UpdateRule>{ fields: "*", filterFields: "*", returningFields: "*" },
    table_only: true,
    allowed_params: { checkFilter: 1, dynamicFields: 1, fields: 1, filterFields: 1, forcedData: 1, forcedFilter: 1, postValidate: 1, returningFields: 1, validate: 1, } satisfies Record<keyof UpdateRule, 1>,
    hint: ` expecting "*" | true | { fields: string | string[] | {}  }`
  },
  {
    rule: "select",
    sqlRule: "select",
    methods: RULE_METHODS.select,
    no_limits: <SelectRule>{ fields: "*", filterFields: "*" },
    table_only: false,
    allowed_params: { fields: 1, filterFields: 1, forcedFilter: 1, maxLimit: 1, orderByFields: 1, validate: 1 } satisfies Record<keyof SelectRule, 1>,
    hint: ` expecting "*" | true | { fields: ( string | string[] | {} )  }`
  },
  {
    rule: "delete",
    sqlRule: "delete",
    methods: RULE_METHODS.delete,
    no_limits: <DeleteRule>{ filterFields: "*" },
    table_only: true,
    allowed_params: { returningFields: 1, validate: 1, filterFields: 1, forcedFilter: 1 } satisfies Record<keyof DeleteRule, 1>,
    hint: ` expecting "*" | true | { filterFields: ( string | string[] | {} ) } \n Will use "select", "update", "delete" and "insert" rules`
  },
  {
    rule: "sync",
    sqlRule: "select",
    methods: RULE_METHODS.sync,
    no_limits: null,
    table_only: true,
    allowed_params: { allow_delete: 1, batch_size: 1, id_fields: 1, synced_field: 1, throttle: 1 } satisfies Record<keyof SyncRule, 1>,
    hint: ` expecting "*" | true | { id_fields: string[], synced_field: string }`
  },
  {
    rule: "subscribe",
    sqlRule: "select",
    methods: RULE_METHODS.subscribe,
    no_limits: <SubscribeRule>{ throttle: 0 },
    table_only: false,
    allowed_params: { throttle: 1 } satisfies Record<keyof SubscribeRule, 1>,
    hint: ` expecting "*" | true | { throttle: number; throttleOpts?: { skipFirst?: boolean; } } \n Will use "select" rules`
  }
] as const;

import { FieldFilter, SelectParams } from "prostgles-types";
import { TableSchemaColumn } from "../DboBuilder/DboBuilderTypes";

export type InsertRequestData = {
  data: object | object[]
  returning: FieldFilter;
}
export type SelectRequestData = {
  filter: object;
  params: SelectParams;
}
export type DeleteRequestData = {
  filter: object;
  returning: FieldFilter;
}
export type UpdateRequestDataOne<R extends AnyObject, S extends DBSchema | void = void> = {
  filter: FullFilter<R, S>
  data: Partial<R>;
  returning: FieldFilter<R>;
}
export type UpdateReq<R extends AnyObject, S extends DBSchema | void = void> = {
  filter: FullFilter<R, S>
  data: Partial<R>;
}
export type UpdateRequestDataBatch<R extends AnyObject> = {
  data: UpdateReq<R>[];
}
export type UpdateRequestData<R extends AnyObject = AnyObject> = UpdateRequestDataOne<R> | UpdateRequestDataBatch<R>;

export type ValidateRowArgs<R = AnyObject, DBX = DBHandlerServer> = {
  row: R;
  dbx: DBX;
  localParams: LocalParams;
}
export type ValidateUpdateRowArgs<U = Partial<AnyObject>, F = Filter, DBX = DBHandlerServer> = {
  update: U;
  filter: F;
  dbx: DBX;
  localParams: LocalParams;
}
export type ValidateRow<R extends AnyObject = AnyObject, S = void> = (args: ValidateRowArgs<R, DBOFullyTyped<S>>) => R | Promise<R>;
export type PostValidateRow<R extends AnyObject = AnyObject, S = void> = (args: ValidateRowArgs<R, DBOFullyTyped<S>>) => void | Promise<void>;
export type PostValidateRowBasic = (args: ValidateRowArgs) => void | Promise<void>;
export type ValidateRowBasic = (args: ValidateRowArgs) => AnyObject | Promise<AnyObject>;
export type ValidateUpdateRow<R extends AnyObject = AnyObject, S extends DBSchema | void = void> = (args: ValidateUpdateRowArgs<Partial<R>, FullFilter<R, S>, DBOFullyTyped<S>>) => Partial<R> | Promise<Partial<R>>;
export type ValidateUpdateRowBasic = (args: ValidateUpdateRowArgs) => AnyObject | Promise<AnyObject>;


export type SelectRule<Cols extends AnyObject = AnyObject, S extends DBSchema | void = void> = {

  /**
   * Fields allowed to be selected.   
   * Tip: Use false to exclude field
   */
  fields: FieldFilter<Cols>;

  /**
   * Fields allowed to sorted
   * Defaults to the "fields". Use empty array/object to disallow sorting
   */
  orderByFields?: FieldFilter<Cols>;

  /**
   * The maximum number of rows a user can get in a select query. null by default. Unless a null or higher limit is specified 100 rows will be returned by the default
   */
  maxLimit?: number | null;

  /**
   * Filter added to every query (e.g. user_id) to restrict access
   */
  forcedFilter?: FullFilter<Cols, S>;

  /**
   * Fields user can filter by 
   * */
  filterFields?: FieldFilter<Cols>;

  /**
   * Validation logic to check/update data for each request
   */
  validate?(args: SelectRequestData): SelectRequestData | Promise<SelectRequestData>;

}

export type CommonInsertUpdateRule<Cols extends AnyObject = AnyObject, S extends DBSchema | void = void> = {

  /**
   * Filter that the new records must match or the update/insert will fail
   * Similar to a policy WITH CHECK clause 
   */
  checkFilter?: SelectRule<Cols, S>["forcedFilter"];

  /**
   * Data to include and overwrite on each update/insert
   * These fields cannot be updated by the user
   */
  forcedData?: Partial<Cols>;
}

export type InsertRule<Cols extends AnyObject = AnyObject, S extends DBSchema | void = void> = CommonInsertUpdateRule<Cols, S> & {

  /**
   * Fields allowed to be inserted.   Tip: Use false to exclude field
   */
  fields: SelectRule<Cols>["fields"]

  /**
   * Fields user can view after inserting
   */
  returningFields?: SelectRule<Cols>["fields"]

  /**
   * Validation logic to check/update data for each request. Happens before publish rule checks (for fields, forcedData/forcedFilter)
   */
  preValidate?: S extends DBSchema? ValidateRow<Cols, S> : ValidateRowBasic;

  /**
   * Validation logic to check/update data for each request. Happens after publish rule checks (for fields, forcedData/forcedFilter)
   */
  validate?: S extends DBSchema? ValidateRow<Cols, S> : ValidateRowBasic;

  /**
   * Validation logic to check/update data after the insert. 
   * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
   */
  postValidate?: S extends DBSchema? PostValidateRow<Required<Cols>, S> : PostValidateRowBasic;

  /**
   * If defined then only nested inserts from these tables are allowed
   * Direct inserts will fail
   */
  allowedNestedInserts?: {
    table: string;
    column: string;
  }[];
}


export type UpdateRule<Cols extends AnyObject = AnyObject, S extends DBSchema | void = void> = CommonInsertUpdateRule<Cols, S> & {

  /**
   * Fields allowed to be updated.   Tip: Use false/0 to exclude field
   */
  fields: SelectRule<Cols>["fields"]

  /**
   * Row level FGAC
   * Used when the editable fields change based on the updated row
   * If specified then the fields from the first matching filter table.count({ ...filter, ...updateFilter }) > 0 will be used
   * If none matching then the "fields" will be used
   * Specify in decreasing order of specificity otherwise a more general filter will match first
   */
  dynamicFields?: {
    filter: FullFilter<Cols, S>;
    fields: SelectRule<Cols>["fields"]
  }[];

  /**
   * Filter added to every query (e.g. user_id) to restrict access
   * This filter cannot be updated
   */
  forcedFilter?: SelectRule<Cols, S>["forcedFilter"]

  /**
   * Fields user can use to find the updates
   */
  filterFields?: SelectRule<Cols>["fields"]

  /**
   * Fields user can view after updating
   */
  returningFields?: SelectRule<Cols>["fields"]

  /**
   * Validation logic to check/update data for each request
   */
  validate?: S extends DBSchema? ValidateUpdateRow<Cols, S> : ValidateUpdateRowBasic;

  /**
   * Validation logic to check/update data after the insert. 
   * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
   */
  postValidate?: S extends DBSchema? PostValidateRow<Required<Cols>, S> : PostValidateRowBasic;
};

export type DeleteRule<Cols extends AnyObject = AnyObject, S extends DBSchema | void = void> = {

  /**
   * Filter added to every query (e.g. user_id) to restrict access
   */
  forcedFilter?: SelectRule<Cols, S>["forcedFilter"]

  /**
   * Fields user can filter by
   */
  filterFields: FieldFilter<Cols>;

  /**
   * Fields user can view after deleting
   */
  returningFields?: SelectRule<Cols>["filterFields"]

  /**
   * Validation logic to check/update data for each request
   */
  validate?(...args: any[]): Awaitable<void>;// UpdateRequestData<Cols>;
}
export type SyncRule<Cols extends AnyObject = AnyObject> = {

  /**
   * Primary keys used in updating data
   */
  id_fields: (keyof Cols)[];

  /**
   * Numerical incrementing fieldname (last updated timestamp) used to sync items
   */
  synced_field: keyof Cols;

  /**
   * EXPERIMENTAL. Disabled by default. If true then server will attempt to delete any records missing from client.
   */
  allow_delete?: boolean;

  /**
   * Throttle replication transmission in milliseconds. Defaults to 100
   */
  throttle?: number;

  /**
   * Number of rows to send per trip. Defaults to 50 
   */
  batch_size?: number;
}
export type SubscribeRule = {
  throttle?: number;
}

export type ViewRule<S extends AnyObject = AnyObject> = CommonTableRules & {
  /**
   * What can be read from the table
   */
  select?: SelectRule<S>;
};
export type TableRule<RowType extends AnyObject = AnyObject, S extends DBSchema | void = void> = ViewRule<RowType> & {
  insert?: InsertRule<RowType, S>;
  update?: UpdateRule<RowType, S>;
  delete?: DeleteRule<RowType, S>;
  sync?: SyncRule<RowType>;
  subscribe?: SubscribeRule;
};
export type PublishViewRule<Col extends AnyObject = AnyObject, S extends DBSchema | void = void> = {
  select?: SelectRule<Col, S> | PublishAllOrNothing
  getColumns?: PublishAllOrNothing;
  getInfo?: PublishAllOrNothing;
};
export type PublishTableRule<Col extends AnyObject = AnyObject, S extends DBSchema | void = void> = PublishViewRule<Col, S> & {
  insert?: InsertRule<Col, S> | PublishAllOrNothing
  update?: UpdateRule<Col, S> | PublishAllOrNothing
  delete?: DeleteRule<Col, S> | PublishAllOrNothing
  sync?: SyncRule<Col>;
  subscribe?: SubscribeRule | PublishAllOrNothing;
};


export type ParsedPublishTable = {
  select?: SelectRule
  getColumns?: true;
  getInfo?: true;

  insert?: InsertRule;
  update?: UpdateRule;
  delete?: DeleteRule;
  sync?: SyncRule;
  subscribe?: SubscribeRule;
  subscribeOne?: SubscribeRule;
}
export type DbTableInfo = {
  name: string;
  info: TableOrViewInfo;
  columns: TableSchemaColumn[];
}
export type PublishParams<S = void, SUser extends SessionUser = SessionUser> = {
  sid?: string;
  dbo: DBOFullyTyped<S>;
  db: DB;
  user?: SUser["user"];
  socket: PRGLIOSocket;
  tables: DbTableInfo[];
}
export type RequestParams = { dbo?: DBHandlerServer, socket?: any };
export type PublishAllOrNothing = true | "*" | false | null;
export type PublishObject = {
  [table_name: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing)
};
export type ParsedPublishTables = {
  [table_name: string]: ParsedPublishTable
};
export type PublishedResult<Schema = void> = PublishAllOrNothing | PublishFullyTyped<Schema>;
export type Publish<Schema = void, SUser extends SessionUser = SessionUser> = PublishedResult<Schema> | ((params: PublishParams<Schema, SUser>) => Awaitable<PublishedResult<Schema>>);

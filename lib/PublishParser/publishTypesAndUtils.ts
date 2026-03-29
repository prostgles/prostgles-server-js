import type { DBOFullyTyped, PublishFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { Filter, LocalParams, TableOrViewInfo } from "../DboBuilder/DboBuilder";
import type { DB, DBHandlerServer } from "../Prostgles";

export type Awaitable<T> = T | Promise<T>;

export type DboTable = {
  tableName: string;
  clientReq: AuthClientRequest | undefined;
};
export type DboTableCommand = DboTable & {
  command: string;
};

import type pgPromise from "pg-promise";
import type {
  AnyObject,
  DBSchema,
  FieldFilter,
  FullFilter,
  RequiredNestedInsert,
  SelectParams,
  SQLHandler,
  TableSchema,
} from "prostgles-types";
import type { AuthClientRequest, LoginClientInfo, SessionUser } from "../Auth/AuthTypes";
import type { TableSchemaColumn } from "../DboBuilder/DboBuilderTypes";
import type { ClientHandlers } from "../WebsocketAPI/getClientHandlers";

export type InsertRequestData = {
  data: object | object[];
  returning: FieldFilter;
};
export type SelectRequestData = {
  filter: object;
  params: SelectParams;
};
export type DeleteRequestData = {
  filter: object;
  returning: FieldFilter;
};
export type UpdateRequestDataOne<R extends AnyObject, S extends DBSchema | void = void> = {
  filter: FullFilter<R, S>;
  data: Partial<R>;
  returning: FieldFilter<R>;
};
export type UpdateReq<R extends AnyObject, S extends DBSchema | void = void> = {
  filter: FullFilter<R, S>;
  data: Partial<R>;
};
export type UpdateRequestDataBatch<R extends AnyObject> = {
  data: UpdateReq<R>[];
};
export type UpdateRequestData<R extends AnyObject = AnyObject> =
  | UpdateRequestDataOne<R>
  | UpdateRequestDataBatch<R>;

export type ValidateRowArgsCommon<R = AnyObject, DBX = DBHandlerServer> = {
  row: R;
  dbx: DBX;
  tx: pgPromise.ITask<{}> | DB;
} & (
  | {
      command: "insert";
      data: R;
    }
  | {
      command: "update";
      data: Partial<R>;
    }
);

export type ValidateRowsArgsCommon<R = AnyObject, DBX = DBHandlerServer> = {
  rows: R[];
  dbx: DBX;
  tx: pgPromise.ITask<{}> | DB;
} & (
  | {
      command: "insert";
      data: R[];
    }
  | {
      command: "update";
      data: Partial<R>[];
    }
);

export type ValidateRowArgs<R = AnyObject, DBX = DBHandlerServer> = ValidateRowArgsCommon<
  R,
  DBX
> & {
  localParams: LocalParams;
};
export type ValidateUpdateRowArgs<U = Partial<AnyObject>, F = Filter, DBX = DBHandlerServer> = {
  update: U;
  filter: F;
  dbx: DBX;
  localParams: LocalParams;
};
export type ValidateRow<R extends AnyObject = AnyObject, S = void> = (
  args: ValidateRowArgs<R, DBOFullyTyped<S>>,
) => R | Promise<R>;
export type PostValidateRow<R extends AnyObject = AnyObject, S = void> = (
  args: ValidateRowArgs<R, DBOFullyTyped<S>>,
) => void | Promise<void>;
export type PostValidateRowBasic = (args: ValidateRowArgs) => void | Promise<void>;
export type ValidateRowBasic = (args: ValidateRowArgs) => AnyObject | Promise<AnyObject>;
export type ValidateUpdateRow<R extends AnyObject = AnyObject, S extends DBSchema | void = void> = (
  args: ValidateUpdateRowArgs<Partial<R>, FullFilter<R, S>, DBOFullyTyped<S>>,
) => Partial<R> | Promise<Partial<R>>;
export type ValidateUpdateRowBasic = (
  args: ValidateUpdateRowArgs,
) => AnyObject | Promise<AnyObject>;

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
   * Fields user can filter by. If undefined will use the fields (allowed to be selected)
   * */
  filterFields?: FieldFilter<Cols>;

  /**
   * Validation logic to check/update data for each request
   */
  validate?(args: SelectRequestData): SelectRequestData | Promise<SelectRequestData>;

  subscribeThrottle?: number;

  disableMethods?: Partial<Record<"sync" | "subscribe", 1>>;
};

export type CommonInsertUpdateRule<
  Cols extends AnyObject = AnyObject,
  S extends DBSchema | void = void,
> = {
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
};

export type InsertRule<
  Cols extends AnyObject = AnyObject,
  S extends DBSchema | void = void,
> = CommonInsertUpdateRule<Cols, S> & {
  /**
   * Fields allowed to be inserted.   Tip: Use false to exclude field
   */
  fields: SelectRule<Cols>["fields"];

  /**
   * Fields user can view after inserting
   */
  returningFields?: SelectRule<Cols>["fields"];

  /**
   * Validation logic to check/update data for each request. Happens before publish rule checks (for fields, forcedData/forcedFilter)
   */
  preValidate?: S extends DBSchema ? ValidateRow<Cols, S> : ValidateRowBasic;

  /**
   * Validation logic to check/update data for each request. Happens after publish rule checks (for fields, forcedData/forcedFilter)
   */
  validate?: S extends DBSchema ? ValidateRow<Cols, S> : ValidateRowBasic;

  /**
   * Validation logic to check/update data after the insert.
   * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
   */
  postValidate?: S extends DBSchema ? PostValidateRow<Required<Cols>, S> : PostValidateRowBasic;

  /**
   * If defined then only nested inserts from these tables are allowed
   * Direct inserts will fail
   */
  allowedNestedInserts?: {
    table: string;
    column: string;
  }[];

  requiredNestedInserts?: RequiredNestedInsert[];
};

export type UpdateRule<
  Cols extends AnyObject = AnyObject,
  S extends DBSchema | void = void,
> = CommonInsertUpdateRule<Cols, S> & {
  /**
   * Fields allowed to be updated.   Tip: Use false/0 to exclude field
   */
  fields: SelectRule<Cols>["fields"];

  /**
   * Row level FGAC
   * Used when the editable fields change based on the updated row
   * If specified then the fields from the first matching filter table.count({ ...filter, ...updateFilter }) > 0 will be used
   * If none matching then the "fields" will be used
   * Specify in decreasing order of specificity otherwise a more general filter will match first
   */
  dynamicFields?: {
    filter: FullFilter<Cols, S>;
    fields: SelectRule<Cols>["fields"];
  }[];

  /**
   * Filter added to every query (e.g. user_id) to restrict access
   * This filter cannot be updated
   */
  forcedFilter?: SelectRule<Cols, S>["forcedFilter"];

  /**
   * Fields user can use to find the updates
   */
  filterFields?: SelectRule<Cols>["fields"];

  /**
   * Fields user can view after updating
   */
  returningFields?: SelectRule<Cols>["fields"];

  /**
   * Validation logic to check/update data for each request
   */
  validate?: S extends DBSchema ? ValidateUpdateRow<Cols, S> : ValidateUpdateRowBasic;

  /**
   * Validation logic to check/update data after the insert.
   * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
   */
  postValidate?: S extends DBSchema ? PostValidateRow<Required<Cols>, S> : PostValidateRowBasic;

  disableMethods?: Partial<Record<"updateBatch", 1>>;
};

export type DeleteRule<Cols extends AnyObject = AnyObject, S extends DBSchema | void = void> = {
  /**
   * Filter added to every query (e.g. user_id) to restrict access
   */
  forcedFilter?: SelectRule<Cols, S>["forcedFilter"];

  /**
   * Fields user can filter by
   */
  filterFields: FieldFilter<Cols>;

  /**
   * Fields user can view after deleting
   */
  returningFields?: SelectRule<Cols>["filterFields"];

  /**
   * Validation logic to check/update data for each request
   */
  validate?(filter: FullFilter<Cols, S>): Awaitable<void>;
};

export type SyncConfig<Cols extends AnyObject = AnyObject> = {
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
  // allow_delete?: boolean;

  /**
   * Throttle replication transmission in milliseconds. Defaults to 100
   */
  throttle?: number;

  /**
   * Number of rows to send per trip. Defaults to 50
   */
  batch_size?: number;
};

/**
 * Required but possibly undefined type
 * */
export type Required_ish<T> = {
  [K in keyof Required<T>]: T[K];
};
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: NonNullable<T[P]> };

export type TableRule<RowType extends AnyObject = AnyObject, S extends DBSchema | void = void> = {
  select?: SelectRule<RowType, S>;
  insert?: InsertRule<RowType, S>;
  update?: UpdateRule<RowType, S>;
  delete?: DeleteRule<RowType, S>;
  sync?: SyncConfig<RowType>;
};

export type ParsedViewRule<S extends AnyObject = AnyObject> = {
  /**
   * What can be read from the table
   */
  select?: WithRequired<SelectRule<S>, "filterFields" | "orderByFields">;
};
export type ParsedTableRule<
  RowType extends AnyObject = AnyObject,
  S extends DBSchema | void = void,
> = ParsedViewRule<RowType> & {
  insert?: WithRequired<InsertRule<RowType, S>, "returningFields">;
  update?: WithRequired<UpdateRule<RowType, S>, "filterFields" | "returningFields">;
  delete?: WithRequired<DeleteRule<RowType, S>, "returningFields">;
};

export const parsePublishTableRule = <R extends ParsedPublishTable>(tableRules: R | undefined) => {
  const selectRules: ParsedTableRule["select"] | undefined = tableRules?.select && {
    ...tableRules.select,
    /**
     * Unless specified. Filtering should be allowed on fields the user can select
     */
    filterFields: tableRules.select.filterFields ?? tableRules.select.fields,
    orderByFields: tableRules.select.orderByFields ?? tableRules.select.fields,
  };

  const parsedTableRules: ParsedTableRule | undefined = tableRules && {
    ...tableRules,
    select: selectRules,
    insert: tableRules.insert && {
      ...tableRules.insert,
      returningFields:
        tableRules.insert.returningFields ?? selectRules?.fields ?? tableRules.insert.fields,
    },
    update: tableRules.update && {
      ...tableRules.update,
      filterFields: tableRules.update.filterFields ?? selectRules?.filterFields ?? [],
      returningFields:
        tableRules.update.returningFields ?? selectRules?.fields ?? tableRules.update.fields,
    },
    delete: tableRules.delete && {
      ...tableRules.delete,
      returningFields:
        tableRules.delete.returningFields ?? selectRules?.fields ?? tableRules.delete.filterFields,
    },
  };
  return parsedTableRules;
};

export type PublishTableRule<
  Col extends AnyObject = AnyObject,
  S extends DBSchema | void = void,
> = {
  select?: SelectRule<Col, S> | PublishAllOrNothing;
  insert?: InsertRule<Col, S> | PublishAllOrNothing;
  update?: UpdateRule<Col, S> | PublishAllOrNothing;
  delete?: DeleteRule<Col, S> | PublishAllOrNothing;
};

export const TABLE_RULE_NO_LIMITS = {
  select: {
    fields: "*",
    disableMethods: undefined,
    subscribeThrottle: 1,
  },
  insert: {
    fields: "*",
  },
  update: {
    fields: "*",
    filterFields: "*",
  },
  delete: {
    filterFields: "*",
  },
} as const satisfies PublishTableRule;

export type ParsedPublishTable = {
  select?: SelectRule;

  insert?: InsertRule;
  update?: UpdateRule;
  delete?: DeleteRule;
};
export type DbTableInfo = {
  name: string;
  info: TableOrViewInfo;
  columns: TableSchemaColumn[];
};
export type PermissionScope = {
  allowSql?: boolean;
  tables?: Record<
    string,
    Partial<{
      select:
        | true
        | {
            fields?: FieldFilter;
            forcedFilter?: AnyObject | undefined;
          };
      insert:
        | true
        | {
            fields?: FieldFilter;
          };
      update:
        | true
        | {
            fields?: FieldFilter;
            forcedFilter?: AnyObject | undefined;
          };
      delete:
        | true
        | {
            forcedFilter?: AnyObject | undefined;
          };
    }>
  >;
  methods?: Record<string, boolean>;
};
export type PublishParams<S = void, SUser extends SessionUser = SessionUser> = {
  sid: string | undefined;
  dbo: DBOFullyTyped<S>;
  db: DB;
  sql: SQLHandler;
  user?: SUser["user"];
  clientReq: AuthClientRequest;
  clientInfo: LoginClientInfo;
  tables: TableSchema[];
  getClientDBHandlers: (
    /**
     * Used to filter permissions
     */
    scope: PermissionScope | undefined,
  ) => Promise<ClientHandlers<S>>;
};
export type RequestParams = { dbo?: DBHandlerServer; socket?: any };
export type PublishAllOrNothing = boolean | "*" | null;
export type PublishObject = Record<string, PublishTableRule | PublishAllOrNothing>;
export type ParsedPublishTables = {
  [table_name: string]: ParsedPublishTable;
};

type PublishAllOrNothingRoot = Exclude<PublishAllOrNothing, boolean>;
export type PublishedResult<Schema = void> = PublishAllOrNothingRoot | PublishFullyTyped<Schema>;
export type Publish<Schema = void, SUser extends SessionUser = SessionUser> =
  | PublishedResult<Schema>
  | ((params: PublishParams<Schema, SUser>) => Awaitable<PublishedResult<Schema>>);

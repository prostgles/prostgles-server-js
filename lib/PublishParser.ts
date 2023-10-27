import { getKeys, RULE_METHODS, AnyObject, TableSchemaForClient, DBSchemaTable, MethodKey, TableInfo, FullFilter, isObject, Method, DBSchema } from "prostgles-types";
import { AuthResult, SessionUser } from "./AuthHandler";
import { CommonTableRules, Filter, isPlainObject, LocalParams, PRGLIOSocket, TableOrViewInfo, TableSchemaColumn } from "./DboBuilder";
import { Prostgles, DBHandlerServer, DB, TABLE_METHODS } from "./Prostgles";
import type { DBOFullyTyped, PublishFullyTyped } from "./DBSchemaBuilder";

export type PublishMethods<S = void, SUser extends SessionUser = SessionUser> = (params: PublishParams<S, SUser>) => { [key: string]: Method } | Promise<{ [key: string]: Method } | null>;

export type Awaitable<T> = T | Promise<T>;

type Request = {
  socket?: any;
  httpReq?: any;
}

type DboTable = Request & {
  tableName: string;
  localParams: LocalParams;
}
type DboTableCommand = Request & DboTable & {
  command: string;
  localParams: LocalParams;
}

const RULE_TO_METHODS = [
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
import { DEFAULT_SYNC_BATCH_SIZE } from "./PubSubManager/PubSubManager";
import { TableHandler } from "./DboBuilder/TableHandler/TableHandler";
import { ViewHandler } from "./DboBuilder/ViewHandler/ViewHandler";
import { parseFieldFilter } from "./DboBuilder/ViewHandler/parseFieldFilter";

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
export type ValidateRowBasic = (args: ValidateRowArgs) => AnyObject | Promise<AnyObject>;
export type ValidateUpdateRow<R extends AnyObject = AnyObject, S extends DBSchema | void = void> = (args: ValidateUpdateRowArgs<Partial<R>, FullFilter<R, S>, DBOFullyTyped<S>>) => R | Promise<R>;
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
  preValidate?: ValidateRow<Cols, S>;

  /**
   * Validation logic to check/update data for each request. Happens after publish rule checks (for fields, forcedData/forcedFilter)
   */
  validate?: ValidateRow<Cols, S>;

  /**
   * Validation logic to check/update data after the insert. 
   * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
   */
  postValidate?: ValidateRow<Required<Cols>, S>;

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
  validate?: ValidateUpdateRow<Cols, S>;

  /**
   * Validation logic to check/update data after the insert. 
   * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
   */
  postValidate?: ValidateRow<Required<Cols>, S>;
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

// export type Publish = {
//     tablesOrViews: {[key:string]: TableRule | ViewRule | "*" }
// }
export type PublishParams<S = void, SUser extends SessionUser = SessionUser> = {
  sid?: string;
  dbo: DBOFullyTyped<S>;
  db: DB;
  user?: SUser["user"];
  socket: PRGLIOSocket;
  tables: {
    name: string;
    info: TableOrViewInfo;
    columns: TableSchemaColumn[];
  }[];
}
export type RequestParams = { dbo?: DBHandlerServer, socket?: any };
export type PublishAllOrNothing = true | "*" | false | null;
type PublishObject = {
  [table_name: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing)
};
export type ParsedPublishTables = {
  [table_name: string]: ParsedPublishTable
};
export type PublishedResult<Schema = void> = PublishAllOrNothing | PublishFullyTyped<Schema>;
export type Publish<Schema = void, SUser extends SessionUser = SessionUser> = PublishedResult<Schema> | ((params: PublishParams<Schema, SUser>) => Awaitable<PublishedResult<Schema>>);

export class PublishParser {
  publish: any;
  publishMethods?: PublishMethods<void, SessionUser> | undefined;
  publishRawSQL?: any;
  dbo: DBHandlerServer;
  db: DB
  prostgles: Prostgles;

  constructor(publish: any, publishMethods: PublishMethods<void, SessionUser> | undefined, publishRawSQL: any, dbo: DBHandlerServer, db: DB, prostgles: Prostgles) {
    this.publish = publish;
    this.publishMethods = publishMethods;
    this.publishRawSQL = publishRawSQL;
    this.dbo = dbo;
    this.db = db;
    this.prostgles = prostgles;

    if (!this.dbo || !this.publish) throw "INTERNAL ERROR: dbo and/or publish missing";
  }

  async getPublishParams(localParams: LocalParams, clientInfo?: AuthResult): Promise<PublishParams> {
    if (!this.dbo) throw "dbo missing"
    return {
      ...(clientInfo || await this.prostgles.authHandler?.getClientInfo(localParams)),
      dbo: this.dbo,
      db: this.db,
      socket: localParams.socket!,
      tables: (this.prostgles.dboBuilder.tablesOrViews ?? []).map(({ name, columns }) => ({
        name,
        columns,
        info: this.dbo[name]!.tableOrViewInfo!
      }))
    }
  }

  async getAllowedMethods(socket: any, userData?: AuthResult): Promise<{ [key: string]: Method; }> {
    const methods: { [key: string]: Method; } = {};

    const publishParams = await this.getPublishParams({ socket }, userData);
    const _methods = await applyParamsIfFunc(this.publishMethods, publishParams);

    if (_methods && Object.keys(_methods).length) {
      getKeys(_methods).map(key => {
        const isFuncLike = (maybeFunc: any) => (typeof maybeFunc === "function" || maybeFunc && typeof maybeFunc.then === "function");
        const method = _methods[key]
        if (method && (isFuncLike(method) || isObject(method) && isFuncLike(method.run))) {
          methods[key] = _methods[key];
        } else {
          throw `invalid publishMethods item -> ${key} \n Expecting a function or promise`
        }
      });
    }

    return methods;
  }

  /**
   * Parses the first level of publish. (If false then nothing if * then all tables and views)
   * @param socket 
   * @param user 
   */
  async getPublish(localParams: LocalParams, clientInfo?: AuthResult): Promise<PublishObject> {
    const publishParams = await this.getPublishParams(localParams, clientInfo)
    const _publish = await applyParamsIfFunc(this.publish, publishParams);

    if (_publish === "*") {
      const publish = {} as any;
      this.prostgles.dboBuilder.tablesOrViews?.map(tov => {
        publish[tov.name] = "*";
      });
      return publish;
    }

    return _publish;
  }
  async getValidatedRequestRuleWusr({ tableName, command, localParams }: DboTableCommand): Promise<TableRule> {
    
    const clientInfo = await this.prostgles.authHandler!.getClientInfo(localParams);
    const rules = await this.getValidatedRequestRule({ tableName, command, localParams }, clientInfo);
    /**
     * Allow inserting into files table from a referencedColumn
     */
    if(command === "insert" && localParams.nestedInsert){
      const { referencingColumn, previousTable } = localParams.nestedInsert
      const table = this.dbo[tableName];
      const fileRef = this.prostgles.opts.fileTable?.referencedTables?.[previousTable];
      if(table?.is_media && referencingColumn && isObject(fileRef) && isObject(fileRef.referenceColumns) && fileRef.referenceColumns[referencingColumn]){
        return {
          ...rules,
          insert: {
            fields: "*"
          },
        }
      }
    }
    return rules;
  }

  async getValidatedRequestRule({ tableName, command, localParams }: DboTableCommand, clientInfo?: AuthResult): Promise<TableRule> {
    if (!this.dbo) throw "INTERNAL ERROR: dbo is missing";

    if (!command || !tableName) throw "command OR tableName are missing";

    //@ts-ignore
    const rtm = RULE_TO_METHODS.find(rtms => (rtms.methods as any).includes(command));
    if (!rtm) {
      throw "Invalid command: " + command;
    }

    /* Must be local request -> allow everything */
    if (!localParams || (!localParams.socket && !localParams.httpReq)) {
      return RULE_TO_METHODS.reduce((a, v) => ({
        ...a,
        [v.rule]: v.no_limits
      }), {})
    }

    /* Must be from socket. Must have a publish */
    if (!this.publish) throw "publish is missing";

    /* Get any publish errors for socket */
    const schm = localParams?.socket?.prostgles?.schema?.[tableName]?.[command];

    if (schm && schm.err) throw schm.err;

    const table_rule = await this.getTableRules({ tableName, localParams }, clientInfo);
    if (!table_rule) throw { stack: ["getValidatedRequestRule()"], message: "Invalid or disallowed table: " + tableName };


    if (command === "upsert") {
      if (!table_rule.update || !table_rule.insert) {
        throw { stack: ["getValidatedRequestRule()"], message: `Invalid or disallowed command: upsert` };
      }
    }

    if (rtm && table_rule && table_rule[rtm.rule]) {
      return table_rule;
    } else throw { stack: ["getValidatedRequestRule()"], message: `Invalid or disallowed command: ${tableName}.${command}` };
  }

  async getTableRules(args: DboTable, clientInfo?: AuthResult): Promise<ParsedPublishTable | undefined> {

    if(this.dbo[args.tableName]?.is_media){
      const fileTablePublishRules = await this.getTableRulesWithoutFileTable(args, clientInfo)
      const { allowedInserts, rules } = await getFileTableRules.bind(this)(args.tableName, fileTablePublishRules, args.localParams, clientInfo);
      return rules;
    }

    return this.getTableRulesWithoutFileTable(args, clientInfo)
  }
  async getTableRulesWithoutFileTable({ tableName, localParams }: DboTable, clientInfo?: AuthResult): Promise<ParsedPublishTable | undefined> {

    if (!localParams || !tableName) throw { stack: ["getTableRules()"], message: "publish OR socket OR dbo OR tableName are missing" };

    const _publish = await this.getPublish(localParams, clientInfo);

    const raw_table_rules = _publish[tableName];
    if (!raw_table_rules || isObject(raw_table_rules) && Object.values(raw_table_rules).every(v => !v)) {
      return undefined;
    }

    let parsed_table: ParsedPublishTable = {};

    /* Get view or table specific rules */
    const tHandler = (this.dbo[tableName] as TableHandler | ViewHandler);
    const is_view = tHandler.is_view;
    const canSubscribe = (!is_view || tHandler.columns.some(c => c.references));
    if (!tHandler) {
      throw { stack: ["getTableRules()"], message: `${tableName} could not be found in dbo` };
    }
    
    //@ts-ignore
    const MY_RULES = RULE_TO_METHODS.filter(r => {

      /** Check PG User privileges */
      const pgUserIsAllowedThis = tHandler.tableOrViewInfo.privileges[r.sqlRule];
      let result = (!is_view || !r.table_only) && pgUserIsAllowedThis;

      if (!pgUserIsAllowedThis && isPlainObject(raw_table_rules) && (raw_table_rules as PublishTableRule)[r.sqlRule]) {
        throw `Your postgres user is not allowed ${r.sqlRule} on table ${tableName}`;
      }

      if ((r.rule === "subscribe" || r.rule === "sync") && !this.prostgles.isSuperUser) {
        result = false;
        if (isPlainObject(raw_table_rules) && (raw_table_rules as PublishTableRule)[r.rule]) {
          throw `Cannot publish realtime rule ${tableName}.${r.rule}. Superuser is required for this`
        }
      }

      if(r.rule === "subscribe" && !canSubscribe){
        result = false;
      }

      return result;
    });



    /* All methods allowed. Add no limits for table rules */
    if ([true, "*"].includes(raw_table_rules as any)) {
      parsed_table = {};
      MY_RULES.filter(r => r.no_limits).forEach(r => {
        parsed_table[r.rule] = { ...r.no_limits as object } as any;
      });

      /** Specific rules allowed */
    } else if (isPlainObject(raw_table_rules) && getKeys(raw_table_rules).length) {
      const allRuleKeys: (keyof PublishViewRule | keyof PublishTableRule)[] = getKeys(raw_table_rules);
      const dissallowedRuleKeys = allRuleKeys.filter(m => !(raw_table_rules as PublishTableRule)[m])

      MY_RULES.map(r => {
        /** Unless specifically disabled these are allowed */
        if (["getInfo", "getColumns"].includes(r.rule) && !dissallowedRuleKeys.includes(r.rule as any)) {
          parsed_table[r.rule] = r.no_limits as any;
          return;
        }

        /** Add no_limit values for implied/ fully allowed methods */
        if ([true, "*"].includes((raw_table_rules as PublishTableRule)[r.rule] as any) && r.no_limits) {
          parsed_table[r.rule] = Object.assign({}, r.no_limits) as any;

          /** Carry over detailed config */
        } else if (isPlainObject((raw_table_rules as any)[r.rule])) {
          parsed_table[r.rule] = (raw_table_rules as any)[r.rule]
        }
      });

      allRuleKeys.filter(m => parsed_table[m])
        .forEach((method) => {
          const rule = parsed_table[method];
          
          const rm = MY_RULES.find(r => r.rule === method || (r.methods as readonly string[]).includes(method));
          if (!rm) {
            let extraInfo = "";
            if (is_view && RULE_TO_METHODS.find(r => !is_view && r.rule === method || (r.methods as any).includes(method))) {
              extraInfo = "You've specified table rules to a view\n";
            }
            throw `Invalid rule in publish.${tableName} -> ${method} \n${extraInfo}Expecting any of: ${MY_RULES.flatMap(r => [r.rule, ...r.methods]).join(", ")}`;
          }

          /* Check RULES for invalid params */
          /* Methods do not have params -> They use them from rules */
          if (method === rm.rule && isObject(rule)) {
            const method_params = Object.keys(rule);
            const allowed_params = Object.keys(rm?.allowed_params)
            const iparam = method_params.find(p => !allowed_params.includes(p));
            if (iparam) {
              throw `Invalid setting in publish.${tableName}.${method} -> ${iparam}. \n Expecting any of: ${allowed_params.join(", ")}`;
            }
          }

          /* Add default params (if missing) */
          if (method === "sync") {

            if ([true, "*"].includes(parsed_table[method] as any)) {
              throw "Invalid sync rule. Expecting { id_fields: string[], synced_field: string } ";
            }

            if (typeof parsed_table[method]?.throttle !== "number") {
              parsed_table[method]!.throttle = 100;
            }
            if (typeof parsed_table[method]?.batch_size !== "number") {
              parsed_table[method]!.batch_size = DEFAULT_SYNC_BATCH_SIZE;
            }
          }

          /* Enable subscribe if not explicitly disabled OR if VIEW with referenced tables */
          const subKey = "subscribe" as const;

          if (method === "select" && !dissallowedRuleKeys.includes(subKey)) {
            const sr = MY_RULES.find(r => r.rule === subKey);
            if (sr && canSubscribe) {
              parsed_table[subKey] = { ...sr.no_limits as SubscribeRule };
              parsed_table.subscribeOne = { ...sr.no_limits as SubscribeRule };
            }
          }
        });

    } else {
      throw "Unexpected publish"
    }

    const getImpliedMethods = (tableRules: ParsedPublishTable): ParsedPublishTable => {
      const res = { ...tableRules };

      /* Add implied methods if not specifically dissallowed */
      MY_RULES.map(r => {

        /** THIS IS A MESS -> some methods cannot be dissallowed (unsync, unsubscribe...) */
        r.methods.forEach(method => {
          const isAllowed = tableRules[r.rule] && (tableRules as any)[method] === undefined;
          if (isAllowed) {

            if (method === "updateBatch" && (!tableRules.update || tableRules.update.checkFilter || tableRules.update.postValidate)) {
              // not allowed

            } else if (method === "upsert" && (!tableRules.update || !tableRules.insert)) {
              // not allowed

            } else {
              (res as any)[method] ??= true;
            }
          }
        });
      });

      return res;
    }

    parsed_table = getImpliedMethods(parsed_table);

    return parsed_table; 
  }



  /* Prepares schema for client. Only allowed views and commands will be present */
  async getSchemaFromPublish(socket: any, userData?: AuthResult): Promise<{ schema: TableSchemaForClient; tables: DBSchemaTable[] }> {
    const schema: TableSchemaForClient = {};
    const tables: DBSchemaTable[] = []

    try {
      /* Publish tables and views based on socket */
      const clientInfo = userData ?? await this.prostgles.authHandler?.getClientInfo({ socket });

      let _publish: PublishObject | undefined;
      try {
        _publish = await this.getPublish(socket, clientInfo);
      } catch(err){
        console.error("Error within then Publish function ", err)
        throw err;
      }


      if (_publish && Object.keys(_publish).length) {
        let txKey = "tx";
        if (!this.prostgles.opts.transactions) txKey = "";
        if (typeof this.prostgles.opts.transactions === "string") txKey = this.prostgles.opts.transactions;

        const tableNames = Object.keys(_publish).filter(k => !txKey || txKey !== k);

        const fileTableName = this.prostgles.fileManager?.tableName;
        if(fileTableName && this.dbo[fileTableName]?.is_media && !tableNames.includes(fileTableName)){
          const isReferenced = this.prostgles.dboBuilder.tablesOrViews?.some(t => t.columns.some(c => c.references?.some(r => r.ftable === fileTableName)))
          if(isReferenced){
            tableNames.push(fileTableName);
          }
        }
        await Promise.all(tableNames
          .map(async tableName => {
            if (!this.dbo[tableName]) {
              const errMsg = [
                `Table ${tableName} does not exist`,
                `Expecting one of: ${JSON.stringify(this.prostgles.dboBuilder.tablesOrViews?.map(tov => tov.name))}`,
                `DBO tables: ${JSON.stringify(Object.keys(this.dbo).filter(k => (this.dbo[k] as any).find))}`,
              ].join("\n");
              throw errMsg;
            }

            const table_rules = await this.getTableRules({ localParams: { socket }, tableName }, clientInfo);

            if (table_rules && Object.keys(table_rules).length) {
              schema[tableName] = {};
              const tableSchema = schema[tableName]!;
              let methods: MethodKey[] = [];
              let tableInfo: TableInfo | undefined;
              let tableColumns: DBSchemaTable["columns"] | undefined;

              if (typeof table_rules === "object") {
                methods = getKeys(table_rules) as any;
              }

              await Promise.all(methods.filter(m => m !== "select" as any).map(async method => {
                if (method === "sync" && table_rules[method]) {

                  /* Pass sync info */
                  tableSchema[method] = table_rules[method];
                } else if ((table_rules as any)[method]) {

                  tableSchema[method] = {};

                  /* Test for issues with the common table CRUD methods () */
                  if (TABLE_METHODS.includes(method as any)) {

                    let err = null;
                    try {
                      const valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, localParams: { socket } }, clientInfo);
                      await (this.dbo[tableName] as any)[method]({}, {}, {}, valid_table_command_rules, { socket, isRemoteRequest: true, testRule: true });

                    } catch (e) {
                      err = "INTERNAL PUBLISH ERROR";
                      tableSchema[method] = { err };

                      throw `publish.${tableName}.${method}: \n   -> ${e}`;
                    }
                  }


                  if (method === "getInfo" || method === "getColumns") {
                    const tableRules = await this.getValidatedRequestRule({ tableName, command: method, localParams: { socket } }, clientInfo);
                    const res = await (this.dbo[tableName] as any)[method](undefined, undefined, undefined, tableRules, { socket, isRemoteRequest: true });
                    if (method === "getInfo") {
                      tableInfo = res;
                    } else if (method === "getColumns") {
                      tableColumns = res;
                    }
                  }
                }
              }));

              if (tableInfo && tableColumns) {

                tables.push({
                  name: tableName,
                  info: tableInfo,
                  columns: tableColumns
                })
              }
            }

            return true;
          })
        );
      }


    } catch (e) {
      console.error("Prostgles \nERRORS IN PUBLISH: ", JSON.stringify(e));
      throw e;
    }

    return { schema, tables };
  }

}


function applyParamsIfFunc(maybeFunc: any, ...params: any): any {
  if (
    (maybeFunc !== null && maybeFunc !== undefined) &&
    (typeof maybeFunc === "function" || typeof maybeFunc.then === "function")
  ) {
    return maybeFunc(...params);
  }

  return maybeFunc;
}

/**
 * Permissions for referencedTables columns are propagated to the file table (even if file table has no permissions)
 * Select on a referenced column allows selecting from file table any records that join the referenced table and the select filters
 * Insert on a referenced column allows inserting a file (according to any file type/size rules) only if it is a nested from that table 
 * Update on a referenced column allows updating a file (delete and insert) only if it is a nested update from that table 
 * Delete on a referenced column table allows deleting any referenced file 
 */ 
export async function getFileTableRules (this: PublishParser, fileTableName: string, fileTablePublishRules: ParsedPublishTable | undefined, localParams: LocalParams, clientInfo: AuthResult | undefined) {
  const opts = this.prostgles.opts;
  const forcedDeleteFilters: FullFilter<AnyObject, void>[] = [];
  const forcedSelectFilters: FullFilter<AnyObject, void>[] = [];
  const allowedNestedInserts: { table: string; column: string }[] = [];
  if(opts.fileTable?.referencedTables){
    Object.entries(opts.fileTable.referencedTables).forEach(async ([tableName, colopts]) => {
      if(isObject(colopts) && typeof colopts !== "string"){
        const refCols = Object.keys(colopts.referenceColumns);
        const table_rules = await this.getTableRules({ localParams, tableName }, clientInfo);
        if(table_rules){
          refCols.map(column => {

            if(table_rules.delete){
              forcedDeleteFilters.push({
                $existsJoined: {
                  path: [{ table: tableName, on: [{ [column]: "id" }] }],
                  filter: table_rules.delete.forcedFilter ?? {},
                }
              })
            }
            if(table_rules.select){
              const parsedFields = parseFieldFilter(table_rules.select.fields, false, [column]);
              /** Must be allowed to view this column */
              if(parsedFields.includes(column as any)){
                forcedSelectFilters.push({
                  $existsJoined: {
                    path: [{ table: tableName, on: [{ [column]: "id" }] }],
                    filter: table_rules.select.forcedFilter ?? {},
                  }
                });
              }
            }
            if(table_rules.insert){
              const parsedFields = parseFieldFilter(table_rules.insert.fields, false, [column]);
              /** Must be allowed to view this column */
              if(parsedFields.includes(column as any)){
                allowedNestedInserts.push({ table: tableName, column });
              }
            }
          })
        }
      }
    })
  }


  const fileTableRule: ParsedPublishTable = {
    ...fileTablePublishRules,
  };
  if(forcedSelectFilters.length || fileTablePublishRules?.select){
    fileTableRule.select = {
      fields: "*",
      ...fileTablePublishRules?.select,
      forcedFilter: {
        $or: forcedSelectFilters.concat(fileTablePublishRules?.select?.forcedFilter ?? []),
      }
    }
  }
  if(forcedDeleteFilters.length || fileTablePublishRules?.delete){
    fileTableRule.delete = {
      filterFields: "*",
      ...fileTablePublishRules?.delete,
      forcedFilter: {
        $or: forcedDeleteFilters.concat(fileTablePublishRules?.delete?.forcedFilter ?? []),
      }
    }
  }

  if(allowedNestedInserts.length || fileTablePublishRules?.insert){
    fileTableRule.insert = {
      fields: "*",
      ...fileTablePublishRules?.insert,
      // preValidate: async ({ dbx, localParams, row: _row }) => {
      //   const row = (await fileTablePublishRules?.insert?.preValidate?.({ dbx, localParams, row: _row })) ?? _row;
      //   /** If direct insert not allowed ensure only referenced inserts are allowed */
      //   const { nestedInsert } = localParams
      //   if(!fileTablePublishRules?.insert && (!nestedInsert || !allowedNestedInserts.some(ai => ai.table === nestedInsert?.previousTable && ai.column === nestedInsert.referencingColumn))){
      //     throw "Only nested inserts allowed from these tables: " + allowedNestedInserts.map(d => d.table);
      //   }
      //   return row;
      // },
      allowedNestedInserts: fileTablePublishRules?.insert? undefined : allowedNestedInserts,
    }
  }

  return { rules: fileTableRule, allowedInserts: allowedNestedInserts };
}
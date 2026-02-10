import type * as pgPromise from "pg-promise";
import type {
  AnyObject,
  ColumnInfo,
  FieldFilter,
  SelectParams,
  SubscribeParams,
  SubscriptionChannels,
} from "prostgles-types";
import { asName, isObject, postgresToTsType } from "prostgles-types";
import type { TableEvent } from "../../Logging";
import type { DB } from "../../Prostgles";
import type { Join } from "../../ProstglesTypes";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Graph } from "../../shortestPath";
import type { DboBuilder, Filter, LocalParams, TableHandlers } from "../DboBuilder";
import { getSerializedClientErrorFromPGError } from "../DboBuilder";
import type { TableSchema } from "../DboBuilderTypes";
import { getValidatedRules } from "../TableRules/getValidatedRules";
import { getColumns } from "../getColumns";
import { count } from "./count";
import { find } from "./find";
import { getInfo } from "./getInfo";
import { parseFieldFilter } from "./parseFieldFilter";
import { prepareWhere } from "./prepareWhere";
import { size } from "./size";
import type { OnData } from "./subscribe";
import { subscribe } from "./subscribe";
import { validateViewRules } from "./validateViewRules";
import { escapeTSNames } from "../../utils/utils";

export type JoinPaths = {
  t1: string;
  t2: string;
  path: string[];
}[];

export class ViewHandler {
  db: DB;
  name: string;
  escapedName: string;
  columns: TableSchema["columns"];
  columnsForTypes: ColumnInfo[];
  column_names: string[];
  tableOrViewInfo: TableSchema;
  tsColumnDefs: string[] = [];
  joins: Join[];
  joinGraph?: Graph;
  joinPaths?: JoinPaths;
  dboBuilder: DboBuilder;

  tx?: {
    t: pgPromise.ITask<{}>;
    dbTX: TableHandlers;
  };
  get dbHandler() {
    return this.tx?.t ?? this.db;
  }

  is_view = true;
  filterDef = "";
  is_media = false;
  constructor(
    db: DB,
    tableOrViewInfo: TableSchema,
    dboBuilder: DboBuilder,
    tx?: { t: pgPromise.ITask<{}>; dbTX: TableHandlers },
    joinPaths?: JoinPaths,
  ) {
    this.db = db;
    this.tx = tx;
    this.joinPaths = joinPaths;
    this.tableOrViewInfo = tableOrViewInfo;
    this.name = tableOrViewInfo.escaped_identifier;
    this.escapedName = tableOrViewInfo.escaped_identifier;
    this.columns = tableOrViewInfo.columns;
    /* cols are sorted by name to reduce .d.ts schema rewrites */
    this.columnsForTypes = tableOrViewInfo.columns
      .slice(0)
      .sort((a, b) => a.name.localeCompare(b.name));

    this.column_names = tableOrViewInfo.columns.map((c) => c.name);

    this.dboBuilder = dboBuilder;
    this.joins = this.dboBuilder.joins;
    this.columnsForTypes.map(({ name, udt_name, is_nullable }) => {
      this.tsColumnDefs.push(
        `${escapeTSNames(name)}?: ${postgresToTsType(udt_name) as string} ${is_nullable ? " | null " : ""};`,
      );
    });
  }

  _log = ({
    command,
    data,
    localParams,
    duration,
    error,
  }: Pick<TableEvent, "command" | "data" | "localParams"> & {
    duration: number;
    error?: any;
  }) => {
    if (localParams?.noLog) {
      if (localParams.clientReq) {
        throw new Error("noLog option is not allowed from a remote client");
      }
      return;
    }
    const sid = this.dboBuilder.prostgles.authHandler.getSIDNoError(localParams?.clientReq);
    return this.dboBuilder.prostgles.opts.onLog?.({
      type: "table",
      command,
      duration,
      error,
      txInfo: this.tx?.t.ctx,
      sid,
      socketId: localParams?.clientReq?.socket?.id,
      tableName: this.name,
      data,
      localParams,
    });
  };

  getRowHashSelect(allowedFields: FieldFilter, alias?: string, tableAlias?: string): string {
    let allowed_cols = this.column_names;
    if (allowedFields) allowed_cols = this.parseFieldFilter(allowedFields);
    return (
      "md5(" +
      allowed_cols
        /* CTID not available in AFTER trigger */
        // .concat(this.is_view? [] : ["ctid"])
        .sort()
        .map((f) => (tableAlias ? asName(tableAlias) + "." : "") + asName(f))
        .map((f) => `md5(coalesce(${f}::text, 'dd'))`)
        .join(" || ") +
      `)` +
      (alias ? ` as ${asName(alias)}` : "")
    );
  }

  validateViewRules = validateViewRules.bind(this);

  // DEAD CODE?!
  // getShortestJoin(
  //   table1: string,
  //   table2: string,
  //   startAlias: number,
  //   isInner = false
  // ): { query: string; toOne: boolean } {
  //   const getJoinCondition = (
  //     on: Record<string, string>[],
  //     leftTable: string,
  //     rightTable: string
  //   ) => {
  //     return on
  //       .map((cond) =>
  //         Object.keys(cond)
  //           .map((lKey) => `${leftTable}.${lKey} = ${rightTable}.${cond[lKey]}`)
  //           .join("\nAND ")
  //       )
  //       .join(" OR ");
  //   };

  //   // let toOne = true;
  //   const query = this.joins
  //     .map(({ tables, on, type }, i) => {
  //       if (type.split("-")[1] === "many") {
  //         // toOne = false;
  //       }
  //       const tl = `tl${startAlias + i}`,
  //         tr = `tr${startAlias + i}`;
  //       return `FROM ${tables[0]} ${tl} ${isInner ? "INNER" : "LEFT"} JOIN ${tables[1]} ${tr} ON ${getJoinCondition(on, tl, tr)}`;
  //     })
  //     .join("\n");
  //   return { query, toOne: false };
  // }

  checkFilter(filter: any) {
    if (filter === null || (filter && !isObject(filter)))
      throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
  }

  getInfo = getInfo.bind(this);

  getColumns = getColumns.bind(this);

  getValidatedRules = getValidatedRules.bind(this);

  find = find.bind(this);

  async findOne(
    filter?: Filter,
    selectParams?: SelectParams,
    _param3_unused?: undefined,
    table_rules?: ParsedTableRule,
    localParams?: LocalParams,
  ): Promise<any> {
    try {
      const { limit, ...params } = selectParams ?? {};
      if (limit) {
        throw "limit not allowed in findOne()";
      }
      const start = Date.now();
      const result = await this.find(
        filter,
        { ...params, limit: 1, returnType: "row" },
        undefined,
        table_rules,
        localParams,
      );
      await this._log({
        command: "find",
        localParams,
        data: { filter, selectParams },
        duration: Date.now() - start,
      });
      return result;
    } catch (e) {
      throw getSerializedClientErrorFromPGError(e, {
        type: "tableMethod",
        localParams,
        view: this,
      });
    }
  }

  async subscribe(
    filter: Filter,
    params: SubscribeParams,
    onData: OnData,
  ): Promise<{ unsubscribe: () => any }>;

  async subscribe(
    filter: Filter,
    params: SubscribeParams,
    onData?: OnData,
    table_rules?: ParsedTableRule,
    localParams?: LocalParams,
  ): Promise<SubscriptionChannels>;

  async subscribe(
    filter: Filter,
    params: SubscribeParams,
    onData?: OnData,
    table_rules?: ParsedTableRule,
    localParams?: LocalParams,
  ): Promise<{ unsubscribe: () => any } | SubscriptionChannels> {
    const result = await subscribe.bind(this)(
      filter,
      params,
      //@ts-ignore
      onData,
      table_rules,
      localParams,
    );
    return result;
  }

  /* This should only be called from server */
  subscribeOne(
    filter: Filter,
    params: SubscribeParams,
    onData: (item: AnyObject | undefined, error?: unknown) => any,
  ): Promise<{ unsubscribe: () => any }>;
  subscribeOne(
    filter: Filter,
    params: SubscribeParams,
    onData: undefined,
    table_rules: ParsedTableRule,
    localParams: LocalParams,
  ): Promise<SubscriptionChannels>;
  subscribeOne(
    filter: Filter,
    params: SubscribeParams = {},
    onData?: (item: AnyObject | undefined, error?: unknown) => void,
    table_rules?: ParsedTableRule,
    localParams?: LocalParams,
  ): Promise<SubscriptionChannels | { unsubscribe: () => any }> {
    const func =
      localParams || !onData ? undefined : (
        (rows: AnyObject[], error?: unknown) => onData(rows[0], error)
      );
    return this.subscribe(filter, { ...params, limit: 2 }, func, table_rules, localParams);
  }

  count = count.bind(this);
  size = size.bind(this);

  getAllowedSelectFields(
    selectParams: FieldFilter = "*",
    allowed_cols: FieldFilter,
    allow_empty = true,
  ): string[] {
    const all_columns = this.column_names.slice(0);
    let allowedFields = all_columns.slice(0),
      resultFields: string[] = [];

    if (selectParams) {
      resultFields = this.parseFieldFilter(selectParams, allow_empty);
    }
    if (allowed_cols) {
      allowedFields = this.parseFieldFilter(allowed_cols, allow_empty);
    }
    let col_names = resultFields.filter((f) => allowedFields.includes(f));

    /* Maintain allowed cols order */
    if (selectParams === "*" && allowedFields.length) {
      col_names = allowedFields;
    }

    return col_names;
  }

  /**
   * Parses group or simple filter
   */
  prepareWhere = prepareWhere.bind(this);

  intersectColumns(
    allowedFields: FieldFilter,
    dissallowedFields: FieldFilter,
    removeDisallowedFields = false,
  ): string[] {
    let result: string[] = [];
    if (allowedFields) {
      result = this.parseFieldFilter(allowedFields);
    }
    if (dissallowedFields) {
      const _dissalowed = this.parseFieldFilter(dissallowedFields);

      if (!removeDisallowedFields) {
        throw `dissallowed/invalid field found for ${this.name}: `;
      }
      result = result.filter((key) => !_dissalowed.includes(key));
    }

    return result;
  }

  parseFieldFilter(
    fieldParams: FieldFilter = "*",
    allow_empty = true,
    allowed_cols?: string[],
  ): string[] {
    return parseFieldFilter(fieldParams, allow_empty, allowed_cols ?? this.column_names.slice(0));
  }
}

/**
 * Throw error if illegal keys found in object
 */
export const validateObj = <T extends Record<string, any>>(obj: T, allowedKeys: string[]): T => {
  if (Object.keys(obj).length) {
    const invalid_keys = Object.keys(obj).filter((k) => !allowedKeys.includes(k));
    if (invalid_keys.length) {
      throw "Invalid/Illegal fields found: " + invalid_keys.join(", ");
    }
  }

  return obj;
};

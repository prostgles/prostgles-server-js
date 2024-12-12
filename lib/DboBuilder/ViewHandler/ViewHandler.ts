import * as pgPromise from 'pg-promise';
import {
  AnyObject,
  ColumnInfo, FieldFilter, SelectParams,
  SubscribeParams,
  asName,
  isEmpty,
  isObject
} from "prostgles-types";
import { TableEvent } from "../../Logging";
import { DB } from "../../Prostgles";
import { Join } from "../../ProstglesTypes";
import { TableRule } from "../../PublishParser/PublishParser";
import { Graph } from "../../shortestPath";
import {
  DboBuilder,
  Filter,
  LocalParams,
  TableHandlers, ValidatedTableRules,
  escapeTSNames,
  getSerializedClientErrorFromPGError,
  postgresToTsType
} from "../DboBuilder";
import { TableSchema } from '../DboBuilderTypes';
import { COMPUTED_FIELDS, FieldSpec } from "../QueryBuilder/Functions";
import { asNameAlias } from "../QueryBuilder/QueryBuilder";
import { getColumns } from "../getColumns";
import { count } from "./count";
import { find } from "./find";
import { getInfo } from "./getInfo";
import { parseFieldFilter } from "./parseFieldFilter";
import { prepareWhere } from "./prepareWhere";
import { size } from "./size";
import { LocalFuncs, subscribe } from "./subscribe";
import { validateViewRules } from "./validateViewRules";

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
  }
  get dbHandler() {
    return this.tx?.t ?? this.db;
  }

  is_view = true;
  filterDef = "";
  is_media = false;
  constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, tx?: { t: pgPromise.ITask<{}>, dbTX: TableHandlers }, joinPaths?: JoinPaths) {
    if (!db || !tableOrViewInfo) throw "";

    this.db = db;
    this.tx = tx;
    this.joinPaths = joinPaths;
    this.tableOrViewInfo = tableOrViewInfo;
    this.name = tableOrViewInfo.escaped_identifier;
    this.escapedName = tableOrViewInfo.escaped_identifier;
    this.columns = tableOrViewInfo.columns;
    /* cols are sorted by name to reduce .d.ts schema rewrites */
    this.columnsForTypes = tableOrViewInfo.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));

    this.column_names = tableOrViewInfo.columns.map(c => c.name);
 
    this.dboBuilder = dboBuilder;
    this.joins = this.dboBuilder.joins ?? []; 
    this.columnsForTypes.map(({ name, udt_name, is_nullable }) => {
      this.tsColumnDefs.push(`${escapeTSNames(name)}?: ${postgresToTsType(udt_name) as string} ${is_nullable ? " | null " : ""};`);
    });
  } 

  _log = ({ command, data, localParams, duration, error }: Pick<TableEvent, "command" | "data" | "localParams"> & { duration: number; error?: any; }) => {
    if(localParams?.noLog){
      if(localParams?.socket || localParams.httpReq) {
        throw new Error("noLog option is not allowed from a remote client");
      }
      return;
    }
    const sid = this.dboBuilder.prostgles.authHandler?.getSIDNoError(localParams);
    return this.dboBuilder.prostgles.opts.onLog?.({ 
      type: "table", 
      command, 
      duration, 
      error,
      txInfo: this.tx?.t.ctx,
      sid, 
      socketId: localParams?.socket?.id, 
      tableName: this.name, 
      data, 
      localParams, 
    });
  }

  getRowHashSelect(allowedFields: FieldFilter, alias?: string, tableAlias?: string): string {
    let allowed_cols = this.column_names;
    if (allowedFields) allowed_cols = this.parseFieldFilter(allowedFields);
    return "md5(" +
      allowed_cols
        /* CTID not available in AFTER trigger */
        // .concat(this.is_view? [] : ["ctid"])
        .sort()
        .map(f => (tableAlias ? (asName(tableAlias) + ".") : "") + asName(f))
        .map(f => `md5(coalesce(${f}::text, 'dd'))`)
        .join(" || ") +
      `)` + (alias ? ` as ${asName(alias)}` : "");
  }

  validateViewRules = validateViewRules.bind(this);

  getShortestJoin(table1: string, table2: string, startAlias: number, isInner = false): { query: string, toOne: boolean } { 
    const getJoinCondition = (on: Record<string, string>[], leftTable: string, rightTable: string) => {
      return on.map(cond => Object.keys(cond).map(lKey => `${leftTable}.${lKey} = ${rightTable}.${cond[lKey]}`).join("\nAND ")).join(" OR ")
    }

    // let toOne = true;
    const query = this.joins.map(({ tables, on, type }, i) => {
        if (type.split("-")[1] === "many") {
          // toOne = false;
        }
        const tl = `tl${startAlias + i}`,
          tr = `tr${startAlias + i}`;
        return `FROM ${tables[0]} ${tl} ${isInner ? "INNER" : "LEFT"} JOIN ${tables[1]} ${tr} ON ${getJoinCondition(on, tl, tr)}`;
      }).join("\n");
    return { query, toOne: false }
  }

  checkFilter(filter: any) {
    if (filter === null || filter && !isObject(filter)) throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
  }

  getInfo = getInfo.bind(this)

  getColumns = getColumns.bind(this);

  getValidatedRules(tableRules?: TableRule, localParams?: LocalParams): ValidatedTableRules {

    if (localParams?.socket && !tableRules) {
      throw "INTERNAL ERROR: Unexpected case -> localParams && !tableRules";
    }

    /* Computed fields are allowed only if select is allowed */
    const allColumns: FieldSpec[] = this.column_names.slice(0).map(fieldName => ({
      type: "column",
      name: fieldName,
      getQuery: ({ tableAlias }) => asNameAlias(fieldName, tableAlias),
      selected: false
    } as FieldSpec)).concat(COMPUTED_FIELDS.map(c => ({
      type: c.type,
      name: c.name,
      getQuery: ({ tableAlias, allowedFields }) => c.getQuery({
        allowedFields,
        ctidField: undefined,
        allColumns: this.columns,

        /* CTID not available in AFTER trigger */
        // ctidField: this.is_view? undefined : "ctid",
        tableAlias
      }),
      selected: false
    })));

    if (tableRules) {
      if (isEmpty(tableRules)) throw "INTERNAL ERROR: Unexpected case -> Empty table rules for " + this.name;
      const throwFieldsErr = (command: "select" | "update" | "delete" | "insert", fieldType = "fields") => {
        throw `Invalid publish.${this.name}.${command} rule -> ${fieldType} setting is missing.\nPlease specify allowed ${fieldType} in this format: "*" | { col_name: false } | { col1: true, col2: true }`;
      },
        getFirstSpecified = (...fieldParams: (FieldFilter | undefined)[]): string[] => {
          const firstValid = fieldParams.find(fp => fp !== undefined);
          return this.parseFieldFilter(firstValid)
        };

      const res: ValidatedTableRules = {
        allColumns,
        getColumns: tableRules?.getColumns ?? true,
        getInfo: tableRules?.getColumns ?? true,
      } as ValidatedTableRules;

      if (tableRules.select) {
        if (!tableRules.select.fields) return throwFieldsErr("select");

        let maxLimit: number | null = null;
        if (!localParams?.bypassLimit && tableRules.select.maxLimit !== undefined && tableRules.select.maxLimit !== maxLimit) {
          const ml = tableRules.select.maxLimit;
          if (ml !== null && (!Number.isInteger(ml) || ml < 0)) throw ` Invalid publish.${this.name}.select.maxLimit -> expecting   a positive integer OR null    but got ` + ml;
          maxLimit = ml;
        }

        const fields = this.parseFieldFilter(tableRules.select.fields)
        res.select = {
          fields,
          orderByFields: tableRules.select.orderByFields ? this.parseFieldFilter(tableRules.select.orderByFields) : fields,
          forcedFilter: { ...tableRules.select.forcedFilter },
          filterFields: this.parseFieldFilter(tableRules.select.filterFields),
          maxLimit
        };
      }

      if (tableRules.update) {
        if (!tableRules.update.fields) return throwFieldsErr("update");

        res.update = {
          fields: this.parseFieldFilter(tableRules.update.fields),
          forcedData: { ...tableRules.update.forcedData },
          forcedFilter: { ...tableRules.update.forcedFilter },
          returningFields: getFirstSpecified(tableRules.update?.returningFields, tableRules?.select?.fields, tableRules.update.fields),
          filterFields: this.parseFieldFilter(tableRules.update.filterFields)
        }
      }

      if (tableRules.insert) {
        if (!tableRules.insert.fields) return throwFieldsErr("insert");

        res.insert = {
          fields: this.parseFieldFilter(tableRules.insert.fields),
          forcedData: { ...tableRules.insert.forcedData },
          returningFields: getFirstSpecified(tableRules.insert.returningFields, tableRules?.select?.fields, tableRules.insert.fields)
        }
      }

      if (tableRules.delete) {
        if (!tableRules.delete.filterFields) return throwFieldsErr("delete", "filterFields");

        res.delete = {
          forcedFilter: { ...tableRules.delete.forcedFilter },
          filterFields: this.parseFieldFilter(tableRules.delete.filterFields),
          returningFields: getFirstSpecified(tableRules.delete.returningFields, tableRules?.select?.fields, tableRules.delete.filterFields)
        }
      }

      if (!tableRules.select && !tableRules.update && !tableRules.delete && !tableRules.insert) {
        if ([null, false].includes(tableRules.getInfo as any)) res.getInfo = false;
        if ([null, false].includes(tableRules.getColumns as any)) res.getColumns = false;
      }

      return res;
    } else {
      const allCols = this.column_names.slice(0);
      return {
        allColumns,
        getColumns: true,
        getInfo: true,
        select: {
          fields: allCols,
          filterFields: allCols,
          orderByFields: allCols,
          forcedFilter: {},
          maxLimit: null,
        },
        update: {
          fields: allCols,
          filterFields: allCols,
          forcedFilter: {},
          forcedData: {},
          returningFields: allCols
        },
        insert: {
          fields: allCols,
          forcedData: {},
          returningFields: allCols
        },
        delete: {
          filterFields: allCols,
          forcedFilter: {},
          returningFields: allCols
        }
      };

    }

  }
  find = find.bind(this);
  
  async findOne(filter?: Filter, selectParams?: SelectParams, _param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {

    try {
      const { limit, ...params } = selectParams ?? {};
      if (limit) {
        throw "limit not allowed in findOne()";
      }
      const start = Date.now();
      const result = await this.find(filter, { ...params, limit: 1, returnType: "row" }, undefined, table_rules, localParams);
      await this._log({ command: "find", localParams, data: { filter, selectParams }, duration: Date.now() - start });
      return result;
    } catch (e) {
      throw getSerializedClientErrorFromPGError(e, { type: "tableMethod", localParams, view: this });
    }
  }

  async subscribe(filter: Filter, params: SubscribeParams, localFuncs: LocalFuncs): Promise<{ unsubscribe: () => any }> 
  async subscribe(filter: Filter, params: SubscribeParams, localFuncs: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<string>
  async subscribe(filter: Filter, params: SubscribeParams, localFuncs?: LocalFuncs, table_rules?: TableRule, localParams?: LocalParams): 
    Promise<{ unsubscribe: () => any } | string> {
      //@ts-ignore
      return subscribe.bind(this)(filter, params, localFuncs, table_rules, localParams);
  }

  /* This should only be called from server */
  subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any): Promise<{ unsubscribe: () => any }>
  subscribeOne(filter: Filter, params: SubscribeParams, localFunc: undefined, table_rules: TableRule, localParams: LocalParams): Promise<string>
  subscribeOne(filter: Filter, params: SubscribeParams = {}, localFunc?: (item: AnyObject) => any, table_rules?: TableRule, localParams?: LocalParams):
    Promise<string | { unsubscribe: () => any }> {
       
      //@ts-ignore
      const func = localParams? undefined : (rows: AnyObject[]) => localFunc(rows[0]); 
      //@ts-ignore
      return this.subscribe(filter, { ...params, limit: 2 }, func, table_rules, localParams);
  }

  count = count.bind(this);
  size = size.bind(this);

  getAllowedSelectFields(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty = true): string[] {
    const all_columns = this.column_names.slice(0);
    let allowedFields = all_columns.slice(0),
      resultFields: string[] = [];

    if (selectParams) {
      resultFields = this.parseFieldFilter(selectParams, allow_empty);
    }
    if (allowed_cols) {
      allowedFields = this.parseFieldFilter(allowed_cols, allow_empty);
    }
    let col_names = (resultFields || []).filter(f => !allowedFields || allowedFields.includes(f));

    /* Maintain allowed cols order */
    if (selectParams === "*" && allowedFields && allowedFields.length){ 
      col_names = allowedFields;
    }

    return col_names;
  } 

  /**
   * Parses group or simple filter
   */
  prepareWhere = prepareWhere.bind(this); 

  intersectColumns(allowedFields: FieldFilter, dissallowedFields: FieldFilter, removeDisallowedFields = false): string[] {
    let result: string[] = [];
    if (allowedFields) {
      result = this.parseFieldFilter(allowedFields);
    }
    if (dissallowedFields) {
      const _dissalowed = this.parseFieldFilter(dissallowedFields);

      if (!removeDisallowedFields) {

        throw `dissallowed/invalid field found for ${this.name}: `
      }
      result = result.filter(key => !_dissalowed.includes(key));
    }

    return result;
  }

  parseFieldFilter(fieldParams: FieldFilter = "*", allow_empty = true, allowed_cols?: string[]): string[] {
    return parseFieldFilter(fieldParams, allow_empty, allowed_cols ?? this.column_names.slice(0))
  }

}


/** 
* Throw error if illegal keys found in object
*/
export const validateObj = <T extends Record<string, any>>(obj: T, allowedKeys: string[]): T => {
  if (obj && Object.keys(obj).length) {
    const invalid_keys = Object.keys(obj).filter(k => !allowedKeys.includes(k));
    if (invalid_keys.length) {
      throw "Invalid/Illegal fields found: " + invalid_keys.join(", ");
    }
  }

  return obj;
}
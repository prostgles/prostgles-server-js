import * as pgPromise from 'pg-promise';
import {
  AnyObject,
  ColumnInfo, FieldFilter, SelectParams,
  SubscribeParams,
  asName,
  isEmpty,
  isObject
} from "prostgles-types";
import {
  DboBuilder,
  Filter,
  LocalParams,
  TableHandlers, TableSchema, ValidatedTableRules,
  escapeTSNames,
  parseError, postgresToTsType,
  withUserRLS
} from "../../DboBuilder";
import { TableEvent } from "../../Logging";
import { DB, Join } from "../../Prostgles";
import { TableRule } from "../../PublishParser/PublishParser";
import { Graph } from "../../shortestPath";
import { COMPUTED_FIELDS, FieldSpec } from "../QueryBuilder/Functions";
import { asNameAlias } from "../QueryBuilder/QueryBuilder";
import { find } from "../find";
import { getColumns } from "../getColumns";
import { LocalFuncs, subscribe } from "../subscribe";
import { ColSet } from "./ColSet";
import { getInfo } from "./getInfo";
import { parseFieldFilter } from "./parseFieldFilter";
import { prepareWhere } from "./prepareWhere";
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
  tableOrViewInfo: TableSchema;// TableOrViewInfo;
  colSet: ColSet;
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

  // pubSubManager: PubSubManager;
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
 
    this.colSet = new ColSet(this.columns, this.name); 
    this.columnsForTypes.map(({ name, udt_name, is_nullable }) => {
      this.tsColumnDefs.push(`${escapeTSNames(name)}?: ${postgresToTsType(udt_name) as string} ${is_nullable ? " | null " : ""};`);
    });
  } 

  _log = ({ command, data, localParams }: Pick<TableEvent, "command" | "data" | "localParams">) => {
    return this.dboBuilder.prostgles.opts.onLog?.({ type: "table", tableName: this.name, command, data, localParams })
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
    // let searchedTables = [], result; 
    // while (!result && searchedTables.length <= this.joins.length * 2){

    // }

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

  // TODO: fix renamed table trigger problem

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

      /* SELECT */
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

      /* UPDATE */
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

      /* INSERT */
      if (tableRules.insert) {
        if (!tableRules.insert.fields) return throwFieldsErr("insert");

        res.insert = {
          fields: this.parseFieldFilter(tableRules.insert.fields),
          forcedData: { ...tableRules.insert.forcedData },
          returningFields: getFirstSpecified(tableRules.insert.returningFields, tableRules?.select?.fields, tableRules.insert.fields)
        }
      }

      /* DELETE */
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
      const all_cols = this.column_names.slice(0);
      return {
        allColumns,
        getColumns: true,
        getInfo: true,
        select: {
          fields: all_cols,
          filterFields: all_cols,
          orderByFields: all_cols,
          forcedFilter: {},
          maxLimit: null,
        },
        update: {
          fields: all_cols,
          filterFields: all_cols,
          forcedFilter: {},
          forcedData: {},
          returningFields: all_cols
        },
        insert: {
          fields: all_cols,
          forcedData: {},
          returningFields: all_cols
        },
        delete: {
          filterFields: all_cols,
          forcedFilter: {},
          returningFields: all_cols
        }
      };

    }

  }
  find = find.bind(this);
  
  async findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {

    try {
      await this._log({ command: "find", localParams, data: { filter, selectParams } });
      const { select = "*", orderBy, offset = 0 } = selectParams || {};
      if (selectParams) {
        const good_params = ["select", "orderBy", "offset"];
        const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
        if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
      }
      return this.find(filter, { select, orderBy, limit: 1, offset, returnType: "row" }, undefined, table_rules, localParams);
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `Issue with dbo.${this.name}.findOne()`);
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

  async count(_filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<number> {
    const filter = _filter || {};
    try {
      await this._log({ command: "count", localParams, data: { filter } });
      return await this.find(filter, { select: "", limit: 0 }, undefined, table_rules, localParams)
        .then(async _allowed => {          
          const q: string = await this.find(
            filter, 
            selectParams,
            undefined,
            table_rules,
            { ...localParams, returnQuery: "noRLS", bypassLimit: true }
            ) as any;
            const query = [
              withUserRLS(localParams, ""),
              "SELECT COUNT(*) FROM (",
              q,
              ") t"
            ].join("\n");
          return (this.tx?.t || this.db).one(query).then(({ count }) => +count);
        });
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.count()`)
    }
  }

  async size(_filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<string> {
    const filter = _filter || {};
    try {
      await this._log({ command: "size", localParams, data: { filter, selectParams } });
      return await this.find(filter, { ...selectParams, limit: 2 }, undefined, table_rules, localParams)
        .then(async _allowed => {
          
          const q: string = await this.find(
            filter, { ...selectParams, limit: selectParams?.limit ?? Number.MAX_SAFE_INTEGER },
            undefined,
            table_rules,
            { ...localParams, returnQuery: "noRLS", bypassLimit: true }
          ) as any;
          const query = withUserRLS(
            localParams,
            `${withUserRLS(localParams, "")}
              SELECT sum(pg_column_size((prgl_size_query.*))) as size 
              FROM (
                ${q}
              ) prgl_size_query
            `
          );

          return (this.tx?.t || this.db).one(query).then(({ size }) => size || '0');
        });
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.size()`);
    }
  }

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

  /* This relates only to SELECT */
  prepareLimitQuery(limit: number | null | undefined = null, p: ValidatedTableRules): number | null {

    if (limit !== undefined && limit !== null && !Number.isInteger(limit)) {
      throw "Unexpected LIMIT. Must be null or an integer";
    }

    let _limit = limit;
    /* If no limit then set as the lesser of (100, maxLimit) */
    if (_limit !== null && !Number.isInteger(_limit) && p.select.maxLimit !== null) {
      _limit = [100, p.select.maxLimit].filter(Number.isInteger).sort((a, b) => a - b)[0]!;
    } else {

      /* If a limit higher than maxLimit specified throw error */
      if (Number.isInteger(p.select.maxLimit) && _limit !== null && _limit > p.select.maxLimit!) {
        throw `Unexpected LIMIT ${_limit}. Must be less than the published maxLimit: ` + p.select.maxLimit;
      }
    }


    return _limit;
  }

  /* This relates only to SELECT */
  prepareOffsetQuery(offset?: number): number {
    if (Number.isInteger(offset)) {
      return offset!;
    }

    return 0;
  }


  intersectColumns(allowedFields: FieldFilter, dissallowedFields: FieldFilter, fixIssues = false): string[] {
    let result: string[] = [];
    if (allowedFields) {
      result = this.parseFieldFilter(allowedFields);
    }
    if (dissallowedFields) {
      const _dissalowed = this.parseFieldFilter(dissallowedFields);

      if (!fixIssues) {

        throw `dissallowed/invalid field found for ${this.name}: `
      }
      result = result.filter(key => !_dissalowed.includes(key));
    }

    return result;
  }

  /** 
  * Prepare and validate field object:   
  * @example ({ item_id: 1 }, { user_id: 32 }) => { item_id: 1, user_id: 32 }
  * OR
  * ({ a: 1 }, { b: 32 }, ["c", "d"]) => throw "a field is not allowed"
  * @param {Object} obj - initial data
  * @param {Object} forcedData - set/override property
  * @param {string[]} allowed_cols - allowed columns (excluding forcedData) from table rules
  */
  prepareFieldValues(obj: AnyObject = {}, forcedData: AnyObject = {}, allowed_cols: FieldFilter | undefined, removeDisallowedColumns = false): AnyObject {
    const column_names = this.column_names.slice(0);
    if (!column_names?.length) {
      throw "table column_names mising";
    }
    let _allowed_cols = column_names.slice(0);
    const _obj = { ...obj };

    if (allowed_cols) {
      _allowed_cols = this.parseFieldFilter(allowed_cols, false);
    }
    let final_filter = { ..._obj };
    const filter_keys: Array<keyof typeof final_filter> = Object.keys(final_filter);

    if (removeDisallowedColumns && filter_keys.length) {
      final_filter = {};
      filter_keys
        .filter(col => _allowed_cols.includes(col))
        .map(col => {
          final_filter[col] = _obj[col];
        });
    }

    /* If has keys check against allowed_cols */
    if (final_filter && Object.keys(final_filter).length && _allowed_cols) {
      validateObj(final_filter, _allowed_cols)
    }

    if (forcedData && Object.keys(forcedData).length) {
      final_filter = { ...final_filter, ...forcedData };
    }

    validateObj(final_filter, column_names.slice(0));
    return final_filter;
  }


  parseFieldFilter(fieldParams: FieldFilter = "*", allow_empty = true, allowed_cols?: string[]): string[] {
    return parseFieldFilter(fieldParams, allow_empty, allowed_cols || this.column_names.slice(0))
  }

}


/** 
* Throw error if illegal keys found in object
*/
function validateObj<T extends Record<string, any>>(obj: T, allowedKeys: string[]): T {
  if (obj && Object.keys(obj).length) {
    const invalid_keys = Object.keys(obj).filter(k => !allowedKeys.includes(k));
    if (invalid_keys.length) {
      throw "Invalid/Illegal fields found: " + invalid_keys.join(", ");
    }
  }

  return obj;
}
import { makeSelectQuery } from "../DboBuilder/QueryBuilder/makeSelectQuery"

import * as pgPromise from 'pg-promise';
import { canRunSQL, runSQL } from "../DboBuilder/runSQL";
import {
  ColumnInfo, FieldFilter, SelectParams,
  OrderBy,
  isEmpty,
  asName,
  TableInfo as TInfo,
  AnyObject,
  isObject, isDefined, getKeys,
  _PG_geometric, pickKeys, SubscribeParams
} from "prostgles-types";
import { DB, DBHandlerServer, Join } from "../Prostgles";
import {
  DboBuilder, escapeTSNames, ExistsFilterConfig, EXISTS_KEY, EXISTS_KEYS, Filter, isPlainObject,
  JoinInfo, LocalParams, makeErr, parseError, pgp, postgresToTsType, SortItem,
  TableHandlers, TableSchema, ValidatedTableRules
} from "../DboBuilder";
import { Graph } from "../shortestPath";
import { TableRule, UpdateRule, ValidateRow } from "../PublishParser";
import { asValue, omitKeys } from "../PubSubManager";
import { TableHandler } from "./TableHandler";
import { asNameAlias,  getNewQuery, parseFunctionObject, SelectItem, SelectItemValidated } from "./QueryBuilder/QueryBuilder";
import { COMPUTED_FIELDS, FieldSpec, FUNCTIONS, parseFunction,  } from "./QueryBuilder/Functions";
import { parseFilterItem } from "../Filtering";
import { getColumns } from "./getColumns";

export type JoinPaths = {
  t1: string;
  t2: string;
  path: string[];
}[];


const FILTER_FUNCS = FUNCTIONS.filter(f => f.canBeUsedForFilter);


class ColSet {
  opts: {
    columns: ColumnInfo[];
    tableName: string;
    colNames: string[];
  };

  constructor(columns: ColumnInfo[], tableName: string) {
    this.opts = { columns, tableName, colNames: columns.map(c => c.name) }
  }

  private async getRow(data: any, allowedCols: string[], dbTx: DBHandlerServer, validate?: ValidateRow): Promise<{ escapedCol: string; escapedVal: string; }[]> {
    const badCol = allowedCols.find(c => !this.opts.colNames.includes(c))
    if (!allowedCols || badCol) {
      throw "Missing or unexpected columns: " + badCol;
    }

    if (isEmpty(data)) throw "No data";

    let row = pickKeys(data, allowedCols);
    if (validate) {
      row = await validate(row, dbTx);
    }
    const rowKeys = Object.keys(row);

    return rowKeys.map(key => {
      const col = this.opts.columns.find(c => c.name === key);
      if (!col) throw "Unexpected missing col name";

      /**
       * Add conversion functions for PostGIS data
       */
      let escapedVal: string = "";
      if (["geometry", "geography"].includes(col.udt_name) && row[key] && isPlainObject(row[key])) {

        const basicFunc = (args: any[]) => {
          return args.map(arg => asValue(arg)).join(", ")
        }

        type ConvertionFunc =  { name: string; getQuery: (args: any[]) => string; }
        const convertionFuncs: ConvertionFunc[] = [
          ...[
          "ST_GeomFromText", 
          "ST_Point",
          "ST_MakePoint",
          "ST_MakePointM",
          "ST_PointFromText",
          "ST_GeomFromEWKT",
          "ST_GeomFromGeoJSON"].map(name => ({
            name, 
            getQuery: () => `${name}(${basicFunc(funcArgs)})`
          })),
          {
            name: "to_timestamp",
            getQuery: (args: any[]) => `to_timestamp(${asValue(args[0])}::BIGINT/1000.0)::timestamp`
          }
        ];

        const dataKeys = Object.keys(row[key]);
        const funcName = dataKeys[0];
        const func = convertionFuncs.find(f => f.name === funcName); 
        const funcArgs = row[key]?.[funcName]
        if (dataKeys.length !== 1 || !func || !Array.isArray(funcArgs)) {
          throw `Expecting only one function key (${convertionFuncs.join(", ")}) \nwith an array of arguments \n within column (${key}) data but got: ${JSON.stringify(row[key])} \nExample: { geo_col: { ST_GeomFromText: ["POINT(-71.064544 42.28787)", 4326] } }`;
        }
        escapedVal = func.getQuery(funcArgs);

      } else {
        /** Prevent pg-promise formatting jsonb */
        const colIsJSON = ["json", "jsonb"].includes(col.data_type);
        escapedVal = pgp.as.format(colIsJSON ? "$1:json" : "$1", [row[key]])
      }

      /**
       * Cast to type to avoid array errors (they do not cast automatically)
       */
      escapedVal += `::${col.udt_name}`

      return {
        escapedCol: asName(key),
        escapedVal,
      }
    });

  }

  async getInsertQuery(data: any[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined): Promise<string> {
    const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async d => {
      const rowParts = await this.getRow(d, allowedCols, dbTx, validate);
      const select = rowParts.map(r => r.escapedCol).join(", "),
        values = rowParts.map(r => r.escapedVal).join(", ");

      return `INSERT INTO ${asName(this.opts.tableName)} (${select}) VALUES (${values})`;
    }))).join(";\n") + " ";
    return res;
  }
  async getUpdateQuery(data: any[], allowedCols: string[], dbTx: DBHandlerServer, validate: ValidateRow | undefined): Promise<string> {
    const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async d => {
      const rowParts = await this.getRow(d, allowedCols, dbTx, validate);
      return `UPDATE ${asName(this.opts.tableName)} SET ` + rowParts.map(r => `${r.escapedCol} = ${r.escapedVal} `).join(",\n")
    }))).join(";\n") + " ";
    return res;
  }
}


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

  t?: pgPromise.ITask<{}>;
  dbTX?: TableHandlers;

  is_view: boolean = true;
  filterDef: string = "";

  // pubSubManager: PubSubManager;
  is_media: boolean = false;
  constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, dbTX?: TableHandlers, joinPaths?: JoinPaths) {
    if (!db || !tableOrViewInfo) throw "";

    this.db = db;
    this.t = t;
    this.dbTX = dbTX;
    this.joinPaths = joinPaths;
    this.tableOrViewInfo = tableOrViewInfo;
    this.name = tableOrViewInfo.name;
    this.escapedName = asName(this.name);
    this.columns = tableOrViewInfo.columns;

    /* cols are sorted by name to reduce .d.ts schema rewrites */
    this.columnsForTypes = tableOrViewInfo.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));

    this.column_names = tableOrViewInfo.columns.map(c => c.name);

    // this.pubSubManager = pubSubManager;
    this.dboBuilder = dboBuilder;
    this.joins = this.dboBuilder.joins ?? [];

    // fix this
    // and also make hot schema reload over ws 
    this.colSet = new ColSet(this.columns, this.name);

    const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;

    // this.tsDataName = snakify(this.name, true);
    // if(this.tsDataName === "T") this.tsDataName = this.tsDataName + "_";
    // this.tsDataDef = `export type ${this.tsDataName} = {\n`;
    this.columnsForTypes.map(({ name, udt_name, is_nullable }) => {
      this.tsColumnDefs.push(`${escapeTSNames(name)}?: ${postgresToTsType(udt_name) as string} ${is_nullable ? " | null " : ""};`);
    });
    // this.tsDataDef += "};";
    // this.tsDataDef += "\n";
    // this.tsDataDef += `export type ${this.tsDataName}_Filter = ${this.tsDataName} | object | { ${JSON.stringify($and_key)}: (${this.tsDataName} | object)[] } | { ${JSON.stringify($or_key)}: (${this.tsDataName} | object)[] } `;
    // this.filterDef = ` ${this.tsDataName}_Filter `;
    // const filterDef = this.filterDef;

    // this.tsDboDefs = [
    //     `   getColumns: () => Promise<any[]>;`,
    //     `   find: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<Partial<${this.tsDataName} & { [x: string]: any }>[]>;`,
    //     `   findOne: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<Partial<${this.tsDataName} & { [x: string]: any }>>;`,
    //     `   subscribe: (filter: ${filterDef}, params: SelectParams, onData: (items: Partial<${this.tsDataName} & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;`,
    //     `   subscribeOne: (filter: ${filterDef}, params: SelectParams, onData: (item: Partial<${this.tsDataName} & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;`,
    //     `   count: (filter?: ${filterDef}) => Promise<number>;`
    // ];
    // this.makeDef();
  }

  // makeDef(){
  //     this.tsDboName = `DBO_${snakify(this.name)}`;
  //     this.tsDboDef = `export type ${this.tsDboName} = {\n ${this.tsDboDefs.join("\n")} \n};\n`;
  // }

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

  async validateViewRules(args: {
    fields?: FieldFilter,
    filterFields?: FieldFilter,
    returningFields?: FieldFilter,
    forcedFilter?: AnyObject,
    dynamicFields?: UpdateRule["dynamicFields"],
    rule: "update" | "select" | "insert" | "delete"
  }) {
    const {
      fields,
      filterFields,
      returningFields,
      forcedFilter,
      dynamicFields,
      rule,
    } = args;

    /* Safely test publish rules */
    if (fields) {
      try {
        const _fields = this.parseFieldFilter(fields);
        if (this.is_media && rule === "insert" && !_fields.includes("id")) {
          throw "Must allow id insert for media table"
        }
      } catch (e) {
        throw ` issue with publish.${this.name}.${rule}.fields: \nVALUE: ` + JSON.stringify(fields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
      }
    }
    if (filterFields) {
      try {
        this.parseFieldFilter(filterFields);
      } catch (e) {
        throw ` issue with publish.${this.name}.${rule}.filterFields: \nVALUE: ` + JSON.stringify(filterFields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
      }
    }
    if (returningFields) {
      try {
        this.parseFieldFilter(returningFields);
      } catch (e) {
        throw ` issue with publish.${this.name}.${rule}.returningFields: \nVALUE: ` + JSON.stringify(returningFields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
      }
    }
    if (forcedFilter) {
      try {
        await this.find(forcedFilter, { limit: 0 });
      } catch (e) {
        throw ` issue with publish.${this.name}.${rule}.forcedFilter: \nVALUE: ` + JSON.stringify(forcedFilter, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
      }
    }
    if (dynamicFields) {
      for await (const dfieldRule of dynamicFields) {
        try {
          const { fields, filter } = dfieldRule;
          this.parseFieldFilter(fields);
          await this.find(filter, { limit: 0 });
        } catch (e) {
          throw ` issue with publish.${this.name}.${rule}.dynamicFields: \nVALUE: ` + JSON.stringify(dfieldRule, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
        }
      }
    }

    return true;
  }

  getShortestJoin(table1: string, table2: string, startAlias: number, isInner: boolean = false): { query: string, toOne: boolean } {
    // let searchedTables = [], result; 
    // while (!result && searchedTables.length <= this.joins.length * 2){

    // }

    const getJoinCondition = (on: Record<string, string>[], leftTable: string, rightTable: string) => {
      return on.map(cond => Object.keys(cond).map(lKey => `${leftTable}.${lKey} = ${rightTable}.${cond[lKey]}`).join("\nAND ")).join(" OR ")
    }

    let toOne = true,
      query = this.joins.map(({ tables, on, type }, i) => {
        if (type.split("-")[1] === "many") {
          toOne = false;
        }
        const tl = `tl${startAlias + i}`,
          tr = `tr${startAlias + i}`;
        return `FROM ${tables[0]} ${tl} ${isInner ? "INNER" : "LEFT"} JOIN ${tables[1]} ${tr} ON ${getJoinCondition(on, tl, tr)}`;
      }).join("\n");
    return { query, toOne: false }
  }

  getJoins(source: string, target: string, path?: string[], checkTableConfig?: boolean): JoinInfo {
    let paths: JoinInfo["paths"] = [];

    if (!this.joinPaths) throw `${source} - ${target} Join info missing or dissallowed`;

    if (path && !path.length) throw `Empty join path ( $path ) specified for ${source} <-> ${target}`

    /* Find the join path between tables */
    if (checkTableConfig) {
      const tableConfigJoinInfo = this.dboBuilder?.prostgles?.tableConfigurator?.getJoinInfo(source, target);
      if (tableConfigJoinInfo) return tableConfigJoinInfo;
    }

    let jp;
    if (!path) {
      jp = this.joinPaths.find(j => j.t1 === source && j.t2 === target);
    } else {
      jp = {
        t1: source,
        t2: target,
        path
      }
    }
    /* Self join */
    if (source === target) {
      const tableHandler = this.dboBuilder.tablesOrViews?.find(t => t.name === source);
      if (!tableHandler) throw `Table not found for joining ${source}`;

      const fcols = tableHandler.columns.filter(c => c.references?.some(({ ftable }) => ftable === this.name));
      if (fcols.length) {
        throw "Self referencing not supported yet"
        // return {
        //     paths: [{
        //         source,
        //         target,
        //         table: target,
        //         on: fcols.map(fc => fc.references!.some(({ fcols }) => fcols.map(fcol => [fc.name,  fcol])))
        //     }],
        //     expectOne: false
        // }
      }
    }
    if (!jp || !this.joinPaths.find(j => path ? j.path.join() === path.join() : j.t1 === source && j.t2 === target)) {
      throw `Joining ${source} <-...-> ${target} dissallowed or missing`;
    }

    /* Make the join chain info excluding root table */
    paths = (path || jp.path).slice(1).map((t2, i, arr) => {
      const t1 = i === 0 ? source : arr[i - 1];

      this.joins ??= this.dboBuilder.joins;

      /* Get join options */
      const jo = this.joins.find(j => j.tables.includes(t1) && j.tables.includes(t2));
      if (!jo) throw `Joining ${t1} <-> ${t2} dissallowed or missing`;;

      let on: [string, string][][] = [];

      jo.on.map(cond => {
        let condArr: [string, string][] = [];
        Object.keys(cond).map(leftKey => {
          const rightKey = cond[leftKey];

          /* Left table is joining on keys */
          if (jo.tables[0] === t1) {
            condArr.push([leftKey, rightKey])

            /* Left table is joining on values */
          } else {
            condArr.push([rightKey, leftKey])

          }
        });
        on.push(condArr);
      })


      return {
        source,
        target,
        table: t2,
        on
      };
    });
    let expectOne = false;
    // paths.map(({ source, target, on }, i) => {
    // if(expectOne && on.length === 1){
    //     const sourceCol = on[0][1];
    //     const targetCol = on[0][0];

    //     const sCol = this.dboBuilder.dbo[source].columns.find(c => c.name === sourceCol)
    //     const tCol = this.dboBuilder.dbo[target].columns.find(c => c.name === targetCol)
    //     console.log({ sourceCol, targetCol, sCol, source, tCol, target, on})
    //     expectOne = sCol.is_pkey && tCol.is_pkey
    // }
    // })
    return {
      paths,
      expectOne
    };
  }


  checkFilter(filter: any) {
    if (filter === null || filter && !isObject(filter)) throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
  }

  async getInfo(lang?: string, param2?: any, param3?: any, tableRules?: TableRule, localParams?: LocalParams): Promise<TInfo> {
    const p = this.getValidatedRules(tableRules, localParams);
    if (!p.getInfo) throw "Not allowed";

    let has_media: "one" | "many" | undefined = undefined;

    const mediaTable = this.dboBuilder.prostgles?.opts?.fileTable?.tableName;

    if (!this.is_media && mediaTable) {
      const joinConf = this.dboBuilder.prostgles?.opts?.fileTable?.referencedTables?.[this.name]
      if (joinConf) {
        has_media = typeof joinConf === "string" ? joinConf : "one";
      } else {
        const jp = this.dboBuilder.joinPaths.find(jp => jp.t1 === this.name && jp.t2 === mediaTable);
        if (jp && jp.path.length <= 3) {
          if (jp.path.length <= 2) {
            has_media = "one"
          } else {
            await Promise.all(jp.path.map(async tableName => {
              const pkeyFcols = this?.dboBuilder?.dbo?.[tableName]?.columns?.filter(c => c.is_pkey).map(c => c.name);
              const cols = this?.dboBuilder?.dbo?.[tableName]?.columns?.filter(c => c?.references?.some(({ ftable }) => jp.path.includes(ftable)));
              if (cols && cols.length && has_media !== "many") {
                if (cols.some(c => !pkeyFcols?.includes(c.name))) {
                  has_media = "many"
                } else {
                  has_media = "one"
                }
              }
            }));
          }
        }
      }
    }

    return {
      oid: this.tableOrViewInfo.oid,
      comment: this.tableOrViewInfo.comment,
      info: this.dboBuilder.prostgles?.tableConfigurator?.getTableInfo({ tableName: this.name, lang }),
      is_media: this.is_media,      // this.name === this.dboBuilder.prostgles?.opts?.fileTable?.tableName
      is_view: this.is_view,
      has_media,
      media_table_name: mediaTable,
      dynamicRules: {
        update: Boolean(tableRules?.update?.dynamicFields?.length)
      }
    }
  }

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
      const throwFieldsErr = (command: "select" | "update" | "delete" | "insert", fieldType: string = "fields") => {
        throw `Invalid publish.${this.name}.${command} rule -> ${fieldType} setting is missing.\nPlease specify allowed ${fieldType} in this format: "*" | { col_name: false } | { col1: true, col2: true }`;
      },
        getFirstSpecified = (...fieldParams: (FieldFilter | undefined)[]): string[] => {
          const firstValid = fieldParams.find(fp => fp !== undefined);
          return this.parseFieldFilter(firstValid)
        };

      let res: ValidatedTableRules = {
        allColumns,
        getColumns: tableRules?.getColumns ?? true,
        getInfo: tableRules?.getColumns ?? true,
      } as ValidatedTableRules;

      /* SELECT */
      if (tableRules.select) {
        if (!tableRules.select.fields) return throwFieldsErr("select");

        let maxLimit: number | null = null;
        if (tableRules.select.maxLimit !== undefined && tableRules.select.maxLimit !== maxLimit) {
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

  async find(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any[]> {
    try {
      filter = filter || {};
      const allowedReturnTypes: Array<SelectParams["returnType"]> = ["row", "value", "values", "statement"]
      const { returnType } = selectParams || {};
      if (returnType && !allowedReturnTypes.includes(returnType)) {
        throw `returnType (${returnType}) can only be ${allowedReturnTypes.join(" OR ")}`
      }

      const { testRule = false, returnQuery = false } = localParams || {};

      if (testRule) return [];
      if (selectParams) {
        const good_params: Array<keyof SelectParams> = ["select", "orderBy", "offset", "limit", "returnType", "groupBy"];
        const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k as any));
        if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
      }

      /* Validate publish */
      if (tableRules) {

        let fields: FieldFilter,
          filterFields: FieldFilter | undefined,
          forcedFilter: AnyObject | undefined,
          maxLimit: number | undefined | null;

        if (!tableRules.select) throw "select rules missing for " + this.name;
        fields = tableRules.select.fields;
        forcedFilter = tableRules.select.forcedFilter;
        filterFields = tableRules.select.filterFields;
        maxLimit = tableRules.select.maxLimit;

        if (<any>tableRules.select !== "*" && typeof tableRules.select !== "boolean" && !isPlainObject(tableRules.select)) throw `\nINVALID publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`
        if (!fields) throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;
        if (maxLimit && !Number.isInteger(maxLimit)) throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;
      }

      let q = await getNewQuery(this as unknown as TableHandler, filter, selectParams, param3_unused, tableRules, localParams, this.columns),
        _query = makeSelectQuery(this as unknown as TableHandler, q, undefined, undefined, selectParams);
      // console.log(_query, JSON.stringify(q, null, 2))
      if (testRule) {
        try {
          await this.db.any("EXPLAIN " + _query);
          return [];
        } catch (e) {
          console.error(e);
          throw `INTERNAL ERROR: Publish config is not valid for publish.${this.name}.select `
        }
      }

      if (returnQuery) return (_query as unknown as any[]);

      if (returnType === "statement") {
        if (!(await canRunSQL(this.dboBuilder.prostgles, localParams))) {
          throw `Not allowed:  {returnType: "statement"} requires sql privileges `
        }
        return _query as unknown as any[];
      }

      if (["row", "value"].includes(returnType!)) {
        return (this.t || this.db).oneOrNone(_query).then(data => {
          return (data && returnType === "value") ? Object.values(data)[0] : data;
        }).catch(err => makeErr(err, localParams, this));
      } else {
        return (this.t || this.db).any(_query).then(data => {
          if (returnType === "values") {
            return data.map(d => Object.values(d)[0]);
          }
          return data;
        }).catch(err => makeErr(err, localParams, this));
      }

    } catch (e) {
      // console.trace(e)
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.find()`);
      // throw { err: parseError(e), msg: `Issue with dbo.${this.name}.find()`, args: { filter, selectParams} };
    }
  }

  findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any> {

    try {
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



  async subscribe(filter: Filter, params: SubscribeParams, localFunc: (items: AnyObject[]) => any): Promise<{ unsubscribe: () => any }>
  async subscribe(filter: Filter, params: SubscribeParams, localFunc?: (items: AnyObject[]) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<string>
  async subscribe(filter: Filter, params: SubscribeParams = {}, localFunc?: (items: AnyObject[]) => any, table_rules?: TableRule, localParams?: LocalParams):
    Promise<string | { unsubscribe: () => any }> {
    try {
      // if (this.is_view) throw "Cannot subscribe to a view";

      if (this.t) throw "subscribe not allowed within transactions";
      if (!localParams && !localFunc) throw " missing data. provide -> localFunc | localParams { socket } ";
      if (localParams && localParams.socket && localFunc) {
        console.error({ localParams, localFunc })
        throw " Cannot have localFunc AND socket ";
      }

      const { filterFields, forcedFilter } = table_rules?.select || {},
        filterOpts = await this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: undefined, localParams, tableRule: table_rules }),
        condition = filterOpts.where,
        throttle = params?.throttle || 0,
        selectParams = omitKeys(params || {}, ["throttle"]);
 
      /** app_triggers condition field has an index which limits it's value */
      const filterSize = JSON.stringify(filter || {}).length;
      if (filterSize * 4 > 2704) {
        throw "filter too big. Might exceed the btree version 4 maximum 2704. Use a primary key or a $rowhash filter instead"
      }

      if (!localFunc) {
        if (!this.dboBuilder.prostgles.isSuperUser) throw "Subscribe not possible. Must be superuser to add triggers 1856";
        return await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams)
          .then(async isValid => {

            let relatedTableSubscriptions: {
              tableName: string;
              tableNameEscaped: string;
              condition: string;
            }[] | undefined = undefined;

            if(this.is_view){
              const viewName = this.name;
              const viewNameEscaped = this.escapedName;
              
              /** Get list of used columns and their parent tables */
              let { def } = (await this.db.oneOrNone("SELECT pg_get_viewdef(${viewName}) as def", { viewName })) as { def: string };
              def = def.trim();
              if(def.endsWith(";")) {
                def = def.slice(0, -1);
              }
              if(!def || typeof def !== "string") makeErr("Could get view definition");
              const { fields } = await this.dboBuilder.dbo.sql!(`SELECT * FROM ( \n ${def} \n ) prostgles_subscribe_view_definition LIMIT 0`, {});
              const tableColumns = fields.filter(f => f.tableName && f.columnName);

              /** Create exists filters for each table */
              const tableIds = Array.from(new Set(tableColumns.map(tc => tc.tableID!.toString())));
              let relatedTableSubscriptions = tableIds.map(tableID => {
                const table = this.dboBuilder.USER_TABLES?.find(t => t.relid === +tableID)!;
                let tableCols = tableColumns.filter(tc => tc.tableID!.toString() === tableID);

                /** If table has primary keys and they are all in this view then use only primary keys */
                if(table?.pkey_columns?.every(pkey => tableCols.some(c => c.columnName === pkey))){
                  tableCols = tableCols.filter(c => table?.pkey_columns?.includes(c.columnName!))
                } else {
                  /** Exclude non comparable data types */
                  tableCols = tableCols.filter(c => !["json", "xml"].includes(c.udt_name) )
                }

                const { tableName, tableSchema } = tableCols[0]!;

                if(!tableCols.length){
                  return {
                    tableName,
                    tableNameEscaped: [table.schemaname, table.relname].map(v => JSON.stringify(v)).join("."),
                    condition: "TRUE"
                  }
                } 

                const tableNameEscaped = [tableSchema!, tableName!].map(v => asName(v)).join(".");

                const relatedTableSubscription = {
                  tableName,
                  tableNameEscaped,
                  condition: `EXISTS (
                    SELECT 1
                    FROM ${viewNameEscaped}
                    WHERE ${tableCols.map(c => `${tableNameEscaped}.${JSON.stringify(c.columnName)} = ${viewNameEscaped}.${JSON.stringify(c.name)}`).join(" AND \n")}
                    AND ${condition || "TRUE"}
                  )`
                }

                return relatedTableSubscription;
              })
              
              /** Get list of remaining used inner tables */
              const allUsedTables: { table_name: string; table_schema: string; }[] = await this.db.any(
                "SELECT distinct table_name, table_schema FROM information_schema.view_column_usage WHERE view_name = ${viewName}", 
                { viewName }
              );

              /** Remaining tables will have listeners on all records (condition = "TRUE") */
              const remainingInnerTables = allUsedTables.filter(at => !tableColumns.some(dc => dc.tableName === at.table_name && dc.tableSchema === at.table_schema));
              relatedTableSubscriptions = [
                ...relatedTableSubscriptions,
                ...remainingInnerTables.map(t => ({
                  tableName: t.table_name,
                  tableNameEscaped: [t.table_name, t.table_schema].map(v => JSON.stringify(v)).join("."),
                  condition: ""
                }))
              ];

              if(!relatedTableSubscriptions.length){
                throw "Could not subscribe to this view: no related tables found";
              } 
            }

            const { socket } = localParams ?? {};
            const pubSubManager = await this.dboBuilder.getPubSubManager();
            return pubSubManager.addSub({
              table_info: this.tableOrViewInfo,
              socket,
              table_rules,
              table_name: this.name,
              condition: condition,
              relatedTableSubscriptions,
              func: undefined,
              filter: { ...filter },
              params: { ...selectParams },
              socket_id: socket?.id,
              throttle,
              last_throttled: 0, 
            }).then(channelName => ({ channelName }));
          }) as string;
      } else {
        const pubSubManager = await this.dboBuilder.getPubSubManager();
        pubSubManager.addSub({
          table_info: this.tableOrViewInfo,
          socket: undefined,
          table_rules,
          condition,
          func: localFunc,
          filter: { ...filter },
          params: { ...selectParams },
          socket_id: undefined,
          table_name: this.name,
          throttle,
          last_throttled: 0, 
        }).then(channelName => ({ channelName }));
        const unsubscribe = async () => {
          const pubSubManager = await this.dboBuilder.getPubSubManager();
          pubSubManager.removeLocalSub(this.name, condition, localFunc)
        };
        let res: { unsubscribe: () => any } = Object.freeze({ unsubscribe })
        return res;
      }
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.subscribe()`);
    }
  }

  /* This should only be called from server */
  subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any): Promise<{ unsubscribe: () => any }>
  subscribeOne(filter: Filter, params: SubscribeParams, localFunc: (item: AnyObject) => any, table_rules?: TableRule, localParams?: LocalParams): Promise<string>
  subscribeOne(filter: Filter, params: SubscribeParams = {}, localFunc: (item: AnyObject) => any, table_rules?: TableRule, localParams?: LocalParams):
    Promise<string | { unsubscribe: () => any }> {
    let func = localParams ? undefined : (rows: AnyObject[]) => localFunc(rows[0]);
    return this.subscribe(filter, { ...params, limit: 2 }, func, table_rules, localParams);
  }

  async count(filter?: Filter, param2_unused?: undefined, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<number> {
    filter = filter || {};
    try {
      return await this.find(filter, { select: "", limit: 0 }, undefined, table_rules, localParams)
        .then(async allowed => {
          const { filterFields, forcedFilter } = table_rules?.select || {};
          const where = (await this.prepareWhere({ filter, forcedFilter, filterFields, addKeywords: true, localParams, tableRule: table_rules })).where;
          let query = "SELECT COUNT(*) FROM " + this.escapedName + " " + where;
          return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ count }) => +count);
        });
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.count()`)
    }
  }

  async size(filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<string> {
    filter = filter || {};
    try {
      return await this.find(filter, { ...selectParams, limit: 2 }, undefined, table_rules, localParams)
        .then(async _allowed => {
          // let rules: TableRule = table_rules || {};
          // rules.select.maxLimit = Number.MAX_SAFE_INTEGER;
          // rules.select.fields = rules.select.fields || "*";

          const q: string = await this.find(
            filter, { ...selectParams, limit: selectParams?.limit ?? Number.MAX_SAFE_INTEGER },
            undefined,
            table_rules,
            { ...localParams, returnQuery: true }
          ) as any;
          const query = `
                      SELECT sum(pg_column_size((prgl_size_query.*))) as size 
                      FROM (
                          ${q}
                      ) prgl_size_query
                  `;

          return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ size }) => size || '0');
        });
    } catch (e) {
      if (localParams && localParams.testRule) throw e;
      throw parseError(e, `dbo.${this.name}.size()`);
    }
  }

  getAllowedSelectFields(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true): string[] {
    let all_columns = this.column_names.slice(0),
      allowedFields = all_columns.slice(0),
      resultFields: string[] = [];

    if (selectParams) {
      resultFields = this.parseFieldFilter(selectParams, allow_empty);
    }
    if (allowed_cols) {
      allowedFields = this.parseFieldFilter(allowed_cols, allow_empty);
    }
    let col_names = (resultFields || []).filter(f => !allowedFields || allowedFields.includes(f));

    /* Maintain allowed cols order */
    if (selectParams === "*" && allowedFields && allowedFields.length) col_names = allowedFields;

    return col_names;
  }

  prepareColumnSet(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true, onlyNames: boolean = true): string | pgPromise.ColumnSet {
    let all_columns = this.column_names.slice(0);
    let col_names = this.getAllowedSelectFields(selectParams, all_columns, allow_empty);
    /** Ensure order is maintained */
    if (selectParams && Array.isArray(selectParams) && typeof selectParams[0] === "string") {
      col_names = col_names.sort((a, b) => selectParams.indexOf(a) - selectParams.indexOf(b))
    }
    try {
      let colSet = new pgp.helpers.ColumnSet(col_names);
      return onlyNames ? colSet.names : colSet;
    } catch (e) {
      throw e;
    }
  }

  prepareSelect(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true, tableAlias?: string): string {
    if (tableAlias) {
      let cs = <pgPromise.ColumnSet>this.prepareColumnSet(selectParams, allowed_cols, true, false);
      return cs.columns.map(col => `${this.escapedName}.${asName(col.name)}`).join(", ");
    } else {
      return <string>this.prepareColumnSet(selectParams, allowed_cols, true, true);
    }
  }

  async prepareHaving(params: {
    having: Filter;
    select: SelectItem[];
    forcedFilter: object;
    filterFields: FieldFilter;
    addKeywords?: boolean;
    tableAlias?: string,
    localParams: LocalParams,
    tableRule: TableRule
  }): Promise<string> {
    return ""
  }

  /**
   * Parses group or simple filter
   */
  async prepareWhere(params: {
    filter?: Filter;
    select?: SelectItem[];
    forcedFilter?: AnyObject;
    filterFields?: FieldFilter;
    addKeywords?: boolean;
    tableAlias?: string,
    localParams: LocalParams | undefined,
    tableRule: TableRule | undefined
  }): Promise<{ where: string; filter: AnyObject; }> {
    const { filter, select, forcedFilter, filterFields: ff, addKeywords = true, tableAlias, localParams, tableRule } = params;
    const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;

    let filterFields = ff;
    /* Local update allow all. TODO -> FIX THIS */
    if (!ff && !tableRule) filterFields = "*";

    const parseFullFilter = async (f: any, parentFilter: any = null, isForcedFilterBypass: boolean): Promise<string> => {
      if (!f) throw "Invalid/missing group filter provided";
      let result = "";
      let keys = getKeys(f);
      if (!keys.length) return result;
      if ((keys.includes($and_key) || keys.includes($or_key))) {
        if (keys.length > 1) throw `\ngroup filter must contain only one array property. e.g.: { ${$and_key}: [...] } OR { ${$or_key}: [...] } `;
        if (parentFilter && Object.keys(parentFilter).includes("")) throw "group filter ($and/$or) can only be placed at the root or within another group filter";
      }

      const { [$and_key]: $and, [$or_key]: $or } = f,
        group: AnyObject[] = $and || $or;

      if (group && group.length) {
        const operand = $and ? " AND " : " OR ";
        let conditions = (await Promise.all(group.map(async gf => await parseFullFilter(gf, group, isForcedFilterBypass)))).filter(c => c);
        if (conditions && conditions.length) {
          if (conditions.length === 1) return conditions.join(operand);
          else return ` ( ${conditions.sort().join(operand)} ) `;
        }
      } else if (!group) {

        /** forcedFilters do not get checked against publish and are treated as server-side requests */
        result = await this.getCondition({
          filter: { ...f },
          select,
          allowed_colnames: isForcedFilterBypass ? this.column_names.slice(0) : this.parseFieldFilter(filterFields),
          tableAlias,
          localParams: isForcedFilterBypass ? undefined : localParams,
          tableRules: isForcedFilterBypass ? undefined : tableRule
        });
      }
      return result;
    }

    if (!isPlainObject(filter)) throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);


    /* A forced filter condition will not check if the existsJoined filter tables have been published */
    const forcedFilterCond = forcedFilter ? await parseFullFilter(forcedFilter, null, true) : undefined;
    const filterCond = await parseFullFilter(filter, null, false);
    let cond = [
      forcedFilterCond, filterCond
    ].filter(c => c).join(" AND ");

    const finalFilter = forcedFilter ? {
      [$and_key]: [forcedFilter, filter].filter(isDefined)
    } : { ...filter };

    if (cond && addKeywords) cond = "WHERE " + cond;
    return { where: cond || "", filter: finalFilter };
  }

  async prepareExistCondition(eConfig: ExistsFilterConfig, localParams: LocalParams | undefined): Promise<string> {
    let res = "";
    const thisTable = this.name;
    const isNotExists = ["$notExists", "$notExistsJoined"].includes(eConfig.existType);

    let { f2, tables, isJoined } = eConfig;
    let t2 = tables[tables.length - 1];

    tables.forEach(t => {
      if (!this.dboBuilder.dbo[t]) throw { stack: ["prepareExistCondition()"], message: `Invalid or dissallowed table: ${t}` };
    });


    /* Nested $exists not allowed */
    if (f2 && Object.keys(f2).find(fk => EXISTS_KEYS.includes(fk as EXISTS_KEY))) {
      throw { stack: ["prepareExistCondition()"], message: "Nested exists dissallowed" };
    }

    const makeTableChain = (finalFilter: string) => {

      let joinPaths: JoinInfo["paths"] = [];
      let expectOne = true;
      tables.map((t2, depth) => {
        let t1 = depth ? tables[depth - 1] : thisTable;
        let exactPaths: string[] | undefined = [t1, t2];

        if (!depth && eConfig.shortestJoin) exactPaths = undefined;
        const jinf = this.getJoins(t1, t2, exactPaths, true);
        expectOne = Boolean(expectOne && jinf.expectOne)
        joinPaths = joinPaths.concat(jinf.paths);
      });

      let r = makeJoin({ paths: joinPaths, expectOne }, 0);
      return r;

      function makeJoin(joinInfo: JoinInfo, ji: number) {
        const { paths } = joinInfo;
        const jp = paths[ji];

        // let prevTable = ji? paths[ji - 1].table : jp.source;
        let table = paths[ji].table;
        let tableAlias = asName(ji < paths.length - 1 ? `jd${ji}` : table);
        let prevTableAlias = asName(ji ? `jd${ji - 1}` : thisTable);

        let cond = `${jp.on.map(c => {
          return c.map(([c1, c2]) => `${prevTableAlias}.${asName(c1)} = ${tableAlias}.${asName(c2)}`).join(" AND ")
        }).join("\n OR ")
          }`;

        let j = `SELECT 1 \n` +
          `FROM ${asName(table)} ${tableAlias} \n` +
          `WHERE ${cond} \n`;//
        if (
          ji === paths.length - 1 &&
          finalFilter
        ) {
          j += `AND ${finalFilter} \n`;
        }

        const indent = (a: any, b: any) => a;

        if (ji < paths.length - 1) {
          j += `AND ${makeJoin(joinInfo, ji + 1)} \n`
        }

        j = indent(j, ji + 1);

        let res = `${isNotExists ? " NOT " : " "} EXISTS ( \n` +
          j +
          `) \n`;
        return indent(res, ji);
      }

    }

    let finalWhere = "";

    let t2Rules: TableRule | undefined = undefined,
      forcedFilter: AnyObject | undefined,
      filterFields: FieldFilter | undefined,
      tableAlias;

    /* Check if allowed to view data - forcedFilters will bypass this check through isForcedFilterBypass */
    if (localParams?.isRemoteRequest && (!localParams?.socket && !localParams?.httpReq)) throw "Unexpected: localParams isRemoteRequest and missing socket/httpReq: ";
    if (localParams && (localParams.socket || localParams.httpReq) && this.dboBuilder.publishParser) {

      t2Rules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: t2, command: "find", localParams }) as TableRule;
      if (!t2Rules || !t2Rules.select) throw "Dissallowed";
      ({ forcedFilter, filterFields } = t2Rules.select);
    }

    try {
      finalWhere = (await (this.dboBuilder.dbo[t2] as TableHandler).prepareWhere({
        filter: f2,
        forcedFilter,
        filterFields,
        addKeywords: false,
        tableAlias,
        localParams,
        tableRule: t2Rules
      })).where
    } catch (err) {
      // console.trace(err)
      throw err
    }

    if (!isJoined) {
      res = `${isNotExists ? " NOT " : " "} EXISTS (SELECT 1 \nFROM ${asName(t2)} \n${finalWhere ? `WHERE ${finalWhere}` : ""}) `
    } else {
      res = makeTableChain(finalWhere);
    }
    return res;
  }

  /**
   * parses a single filter
   * @example
   *  { fff: 2 } => "fff" = 2
   *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
   */
  async getCondition(params: { filter: any, select?: SelectItem[], allowed_colnames: string[], tableAlias?: string, localParams?: LocalParams, tableRules?: TableRule }) {
    const { filter, select, allowed_colnames, tableAlias, localParams, tableRules } = params;


    let data = { ... (filter as any) } as any;

    /* Exists join filter */
    const ERR = "Invalid exists filter. \nExpecting somethibng like: { $exists: { tableName.tableName2: Filter } } | { $exists: { \"**.tableName3\": Filter } }\n"
    const SP_WILDCARD = "**";
    let existsKeys: ExistsFilterConfig[] = Object.keys(data)
      .filter(k => EXISTS_KEYS.includes(k as EXISTS_KEY) && Object.keys(data[k] || {}).length)
      .map(key => {

        const isJoined = EXISTS_KEYS.slice(-2).includes(key as EXISTS_KEY);
        let firstKey = Object.keys(data[key])[0],
          tables = firstKey.split("."),
          f2 = data[key][firstKey],
          shortestJoin = false;

        if (!isJoined) {
          if (tables.length !== 1) throw "Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }"
        } else {
          /* First part can be the ** param meaning shortest join. Will be overriden by anything in tableConfig */

          if (!tables.length) throw ERR + "\nBut got: " + data[key];

          if (tables[0] === SP_WILDCARD) {
            tables = tables.slice(1);
            shortestJoin = true;
          }
        }

        return {
          key,
          existType: key as EXISTS_KEY,
          isJoined,
          shortestJoin,
          f2,
          tables
        }
      });
    /* Exists with exact path */
    // Object.keys(data).map(k => {
    //     let isthis = isPlainObject(data[k]) && !this.column_names.includes(k) && !k.split(".").find(kt => !this.dboBuilder.dbo[kt]);
    //     if(isthis) {
    //         existsKeys.push({
    //             key: k,
    //             notJoined: false,
    //             exactPaths: k.split(".")
    //         });
    //     }
    // });
    let funcConds: string[] = [];
    const funcFilterkeys = FILTER_FUNCS.filter(f => {
      return f.name in data;
    });
    funcFilterkeys.map(f => {
      const funcArgs = data[f.name];
      if (!Array.isArray(funcArgs)) throw `A function filter must contain an array. E.g: { $funcFilterName: ["col1"] } \n but got: ${JSON.stringify(pickKeys(data, [f.name]))} `;
      const fields = this.parseFieldFilter(f.getFields(funcArgs), true, allowed_colnames);

      const dissallowedCols = fields.filter(fname => !allowed_colnames.includes(fname))
      if (dissallowedCols.length) {
        throw `Invalid/disallowed columns found in function filter: ${dissallowedCols}`
      }
      funcConds.push(f.getQuery({ args: funcArgs, allColumns: this.columns, allowedFields: allowed_colnames, tableAlias }));
    })


    let existsCond = "";
    if (existsKeys.length) {
      existsCond = (await Promise.all(existsKeys.map(async k => await this.prepareExistCondition(k, localParams)))).join(" AND ");
    }

    /* Computed field queries */
    const p = this.getValidatedRules(tableRules, localParams);
    const computedFields = p.allColumns.filter(c => c.type === "computed");
    let computedColConditions: string[] = [];
    Object.keys(data || {}).map(key => {
      const compCol = computedFields.find(cf => cf.name === key);
      if (compCol) {
        computedColConditions.push(
          compCol.getQuery({
            tableAlias,
            allowedFields: p.select.fields,
            allColumns: this.columns,

            /* CTID not available in AFTER trigger */
            // ctidField: this.is_view? undefined : "ctid"

            ctidField: undefined,
          }) + ` = ${pgp.as.format("$1", [(data as any)[key]])}`
        );
        delete (data as any)[key];
      }
    });

    let allowedSelect: SelectItem[] = [];
    /* Select aliases take precedence over col names. This is to ensure filters work correctly and even on computed cols*/
    if (select) {
      /* Allow filtering by selected fields/funcs */
      allowedSelect = select.filter(s => {
        /*  */
        if (["function", "computed", "column"].includes(s.type)) {
          if (s.type !== "column" || allowed_colnames.includes(s.alias)) {
            return true;
          }
        }
        return false;
      })
    }

    /* Add remaining allowed fields */
    allowedSelect = allowedSelect.concat(
      p.allColumns.filter(c =>
        allowed_colnames.includes(c.name) &&
        !allowedSelect.find(s => s.alias === c.name)
      ).map(f => ({
        type: f.type,
        alias: f.name,
        getQuery: (tableAlias) => f.getQuery({
          tableAlias,
          allColumns: this.columns,
          allowedFields: allowed_colnames
        }),
        selected: false,
        getFields: () => [f.name],
        column_udt_type: f.type === "column" ? this.columns.find(c => c.name === f.name)?.udt_name : undefined
      }))
    );

    /* Parse complex filters
        { $filter: [{ $func: [...] }, "=", value | { $func: [..] }] } 
    */
    const complexFilters: string[] = [];
    const complexFilterKey = "$filter";
    const allowedComparators = [">", "<", "=", "<=", ">=", "<>", "!="]
    if (complexFilterKey in data) {
      const getFuncQuery = (funcData: any): string => {
        const { funcName, args } = parseFunctionObject(funcData);
        const funcDef = parseFunction({ func: funcName, args, functions: FUNCTIONS, allowedFields: allowed_colnames });
        return funcDef.getQuery({ args, tableAlias, allColumns: this.columns, allowedFields: allowed_colnames });
      }

      const complexFilter = data[complexFilterKey];
      if (!Array.isArray(complexFilter)) throw `Invalid $filter. Must contain an array of at least element but got: ${JSON.stringify(complexFilter)} `
      const leftFilter = complexFilter[0];
      const comparator = complexFilter[1];
      const rightFilterOrValue = complexFilter[2];
      const leftVal = getFuncQuery(leftFilter);
      let result = leftVal;
      if (comparator) {
        if (!allowedComparators.includes(comparator)) throw `Invalid $filter. comparator ${JSON.stringify(comparator)} is not valid. Expecting one of: ${allowedComparators}`
        if (!rightFilterOrValue) throw "Invalid $filter. Expecting a value or function after the comparator";
        const rightVal = isObject(rightFilterOrValue) ? getFuncQuery(rightFilterOrValue) : asValue(rightFilterOrValue);
        if (leftVal === rightVal) throw "Invalid $filter. Cannot compare two identical function signatures: " + JSON.stringify(leftFilter);
        result += ` ${comparator} ${rightVal}`;
      }
      complexFilters.push(result);
    }


    /* Parse join filters
        { $joinFilter: { $ST_DWithin: [table.col, foreignTable.col, distance] } 
        will make an exists filter
    */

    let filterKeys = Object.keys(data).filter(k => k !== complexFilterKey && !funcFilterkeys.find(ek => ek.name === k) && !computedFields.find(cf => cf.name === k) && !existsKeys.find(ek => ek.key === k));
    // if(allowed_colnames){
    //     const aliasedColumns = (select || []).filter(s => 
    //         ["function", "computed", "column"].includes(s.type) && allowed_colnames.includes(s.alias) ||  
    //         s.getFields().find(f => allowed_colnames.includes(f))
    //     ).map(s => s.alias);
    //     const validCols = [...allowed_colnames, ...aliasedColumns];

    // }
    const validFieldNames = allowedSelect.map(s => s.alias);
    const invalidColumn = filterKeys
      .find(fName => !validFieldNames.find(c =>
        c === fName ||
        (
          fName.startsWith(c) && (
            fName.slice(c.length).includes("->") ||
            fName.slice(c.length).includes(".")
          )
        )
      ));

    if (invalidColumn) {
      throw `Table: ${this.name} -> disallowed/inexistent columns in filter: ${invalidColumn} \n  Expecting one of: ${allowedSelect.map(s => s.type === "column" ? s.getQuery() : s.alias).join(", ")}`;
    }

    /* TODO: Allow filter funcs */
    // const singleFuncs = FUNCTIONS.filter(f => f.singleColArg);

    const f = pickKeys(data, filterKeys);
    const q = parseFilterItem({
      filter: f,
      tableAlias,
      pgp,
      select: allowedSelect
    });

    let templates: string[] = [q].filter(q => q);

    if (existsCond) templates.push(existsCond);
    templates = templates.concat(funcConds);
    templates = templates.concat(computedColConditions);
    templates = templates.concat(complexFilters);

    /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
    return templates.sort()
      .join(" AND \n");

  }

  /* This relates only to SELECT */
  prepareSortItems(orderBy: OrderBy | undefined, allowed_cols: string[], tableAlias: string | undefined, select: SelectItemValidated[]): SortItem[] {

    const throwErr = () => {
      throw "\nInvalid orderBy option -> " + JSON.stringify(orderBy) +
      "Expecting: \
                      { key2: false, key1: true } \
                      { key1: 1, key2: -1 } \
                      [{ key1: true }, { key2: false }] \
                      [{ key: 'colName', asc: true, nulls: 'first', nullEmpty: true }]"
    },
      parseOrderObj = (orderBy: any, expectOne = false): { key: string, asc: boolean, nulls?: "first" | "last", nullEmpty?: boolean }[] => {
        if (!isPlainObject(orderBy)) return throwErr();

        const keys = Object.keys(orderBy);
        if (keys.length && keys.find(k => ["key", "asc", "nulls", "nullEmpty"].includes(k))) {
          const { key, asc, nulls, nullEmpty = false } = orderBy;
          if (
            !["string"].includes(typeof key) ||
            !["boolean"].includes(typeof asc) ||
            !["first", "last", undefined, null].includes(nulls) ||
            !["boolean"].includes(typeof nullEmpty)
          ) {
            throw `Invalid orderBy option (${JSON.stringify(orderBy, null, 2)}) \n 
                          Expecting { key: string, asc?: boolean, nulls?: 'first' | 'last' | null | undefined, nullEmpty?: boolean } `
          }
          return [{ key, asc, nulls, nullEmpty }];
        }

        if (expectOne && keys.length > 1) {
          throw "\nInvalid orderBy " + JSON.stringify(orderBy) +
          "\nEach orderBy array element cannot have more than one key";
        }
        /* { key2: true, key1: false } */
        if (!Object.values(orderBy).find(v => ![true, false].includes(<any>v))) {
          return keys.map(key => ({ key, asc: Boolean(orderBy[key]) }))

          /* { key2: -1, key1: 1 } */
        } else if (!Object.values(orderBy).find(v => ![-1, 1].includes(<any>v))) {
          return keys.map(key => ({ key, asc: orderBy[key] === 1 }))

          /* { key2: "asc", key1: "desc" } */
        } else if (!Object.values(orderBy).find(v => !["asc", "desc"].includes(<any>v))) {
          return keys.map(key => ({ key, asc: orderBy[key] === "asc" }))
        } else return throwErr();
      };

    if (!orderBy) return [];

    let _ob: { key: string, asc: boolean, nulls?: "first" | "last", nullEmpty?: boolean }[] = [];
    if (isPlainObject(orderBy)) {
      _ob = parseOrderObj(orderBy);
    } else if (typeof orderBy === "string") {
      /* string */
      _ob = [{ key: orderBy, asc: true }];
    } else if (Array.isArray(orderBy)) {

      /* Order by is formed of a list of ascending field names */
      let _orderBy = (orderBy as any[]);
      if (_orderBy && !_orderBy.find(v => typeof v !== "string")) {
        /* [string] */
        _ob = _orderBy.map(key => ({ key, asc: true }));
      } else if (_orderBy.find(v => isPlainObject(v) && Object.keys(v).length)) {
        _ob = _orderBy.map(v => parseOrderObj(v, true)[0]);
      } else return throwErr();
    } else return throwErr();

    if (!_ob || !_ob.length) return [];

    const validatedAggAliases = select.filter(s =>
      s.type !== "joinedColumn" &&
      (!s.fields.length || s.fields.every(f => allowed_cols.includes(f)))
    ).map(s => s.alias)

    let bad_param = _ob.find(({ key }) =>
      !(validatedAggAliases || []).includes(key) &&
      !allowed_cols.includes(key)
    );
    if (!bad_param) {
      const selectedAliases = select.filter(s => s.selected).map(s => s.alias);
      // return (excludeOrder? "" : " ORDER BY ") + (_ob.map(({ key, asc, nulls, nullEmpty = false }) => {
      return _ob.map(({ key, asc, nulls, nullEmpty = false }) => {

        /* Order by column index when possible to bypass name collision when ordering by a computed column. 
            (Postgres will sort by existing columns wheundefined possible) 
        */
        const orderType = asc ? " ASC " : " DESC ";
        const index = selectedAliases.indexOf(key) + 1;
        const nullOrder = nulls ? ` NULLS ${nulls === "first" ? " FIRST " : " LAST "}` : "";
        let colKey = (index > 0 && !nullEmpty) ? index : [tableAlias, key].filter(isDefined).map(asName).join(".");
        if (nullEmpty) {
          colKey = `nullif(trim(${colKey}::text), '')`
        }

        const res = `${colKey} ${orderType} ${nullOrder}`;

        if (typeof colKey === "number") {
          return {
            asc,
            fieldPosition: colKey
          }
        }

        return {
          fieldQuery: colKey,
          asc,
        }
      })
    } else {
      throw "Invalid/disallowed orderBy fields or params: " + bad_param.key;
    }
  }

  /* This relates only to SELECT */
  prepareLimitQuery(limit = 1000, p: ValidatedTableRules): number {

    if (limit !== undefined && limit !== null && !Number.isInteger(limit)) {
      throw "Unexpected LIMIT. Must be null or an integer";
    }

    let _limit = limit;

    // if(_limit === undefined && p.select.maxLimit === null){
    //     _limit = 1000;

    /* If no limit then set as the lesser of (100, maxLimit) */
    // } else 
    if (_limit !== null && !Number.isInteger(_limit) && p.select.maxLimit !== null) {
      _limit = [100, p.select.maxLimit].filter(Number.isInteger).sort((a, b) => a - b)[0];
    } else {

      /* If a limit higher than maxLimit specified throw error */
      if (Number.isInteger(p.select.maxLimit) && _limit > p.select.maxLimit!) {
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


  intersectColumns(allowedFields: FieldFilter, dissallowedFields: FieldFilter, fixIssues: boolean = false): string[] {
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
  prepareFieldValues(obj: Record<string, any> = {}, forcedData: object = {}, allowed_cols: FieldFilter | undefined, fixIssues = false): AnyObject {
    let column_names = this.column_names.slice(0);
    if (!column_names || !column_names.length) throw "table column_names mising";
    let _allowed_cols = column_names.slice(0);
    let _obj = { ...obj };

    if (allowed_cols) {
      _allowed_cols = this.parseFieldFilter(allowed_cols, false);
    }
    let final_filter = { ..._obj },
      filter_keys: Array<keyof typeof final_filter> = Object.keys(final_filter);

    if (fixIssues && filter_keys.length) {
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


  parseFieldFilter(fieldParams: FieldFilter = "*", allow_empty: boolean = true, allowed_cols?: string[]): string[] {
    return ViewHandler._parseFieldFilter(fieldParams, allow_empty, allowed_cols || this.column_names.slice(0))
  }

  /** 
  * Filter string array
  * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
  * @param {boolean} allow_empty - allow empty select. defaults to true
  */
  static _parseFieldFilter<AllowedKeys extends string[]>(fieldParams: FieldFilter<Record<AllowedKeys[number], any>> = "*", allow_empty: boolean = true, all_cols: AllowedKeys): AllowedKeys | [""] {
    if (!all_cols) throw "all_cols missing"
    const all_fields = all_cols;// || this.column_names.slice(0);
    let colNames: AllowedKeys = [] as any,
      initialParams = JSON.stringify(fieldParams);

    if (fieldParams) {

      /* 
          "field1, field2, field4" | "*"
      */
      if (typeof fieldParams === "string") {
        fieldParams = fieldParams.split(",").map(k => k.trim());
      }

      /* string[] */
      if (Array.isArray(fieldParams) && !fieldParams.find(f => typeof f !== "string")) {
        /* 
            ["*"] 
        */
        if (fieldParams[0] === "*") {
          return all_fields.slice(0) as typeof all_fields;

          /* 
              [""] 
          */
        } else if (fieldParams[0] === "") {
          if (allow_empty) {
            return [""];
          } else {
            throw "Empty value not allowed";
          }
          /* 
              ["field1", "field2", "field3"] 
          */
        } else {
          colNames = fieldParams.slice(0) as AllowedKeys;
        }

        /*
            { field1: true, field2: true } = only field1 and field2
            { field1: false, field2: false } = all fields except field1 and field2
        */
      } else if (isPlainObject(fieldParams)) {

        if (!getKeys(fieldParams).length) {
          return [] as unknown as typeof all_fields; //all_fields.slice(0) as typeof all_fields;
        }

        let keys = getKeys(fieldParams as {
          [key: string]: boolean | 0 | 1;
        }) as AllowedKeys;
        if (keys[0] === "") {
          if (allow_empty) {
            return [""];
          } else {
            throw "Empty value not allowed";
          }
        }

        validate(keys);

        keys.forEach(key => {
          const allowedVals = [true, false, 0, 1];
          if (!allowedVals.includes((fieldParams as any)[key])) throw `Invalid field selection value for: { ${key}: ${(fieldParams as any)[key]} }. \n Allowed values: ${allowedVals.join(" OR ")}`
        })

        let allowed = keys.filter(key => (fieldParams as any)[key]),
          disallowed = keys.filter(key => !(fieldParams as any)[key]);


        if (disallowed && disallowed.length) {
          return all_fields.filter(col => !disallowed.includes(col)) as typeof all_fields;
        } else {
          return [...allowed] as any;
        }

      } else {
        throw " Unrecognised field filter.\nExpecting any of:   string | string[] | { [field]: boolean } \n Received ->  " + initialParams;
      }

      validate(colNames);
    }
    return colNames as any;

    function validate(cols: AllowedKeys) {
      let bad_keys = cols.filter(col => !all_fields.includes(col));
      if (bad_keys && bad_keys.length) {
        throw "\nUnrecognised or illegal fields: " + bad_keys.join(", ");
      }
    }
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

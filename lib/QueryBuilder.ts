
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pgp, Filter, LocalParams, asName, isPlainObject, TableHandler, ViewHandler } from "./DboBuilder";
import { TableRule, flat } from "./Prostgles";
import { SelectParams, isEmpty } from "prostgles-types";
import { get } from "./utils";

export type SelectItem = {
  type: "column" | "function" | "aggregation" | "joinedColumn" | "computed";
  getFields: () => string[];
  getQuery: (tableAlias?: string) => string;
  // columnName?: string; /* Must only exist if type "column" ... dissalow aliased columns? */
  alias: string;
  selected: boolean;
};

export type NewQuery = {
  allFields: string[];

  /**
   * Contains user selection and all the allowed columns. Allowed columns not selected are marked with  selected: false
   */
  select: SelectItem[];

  table: string;
  where: string;
  orderBy: string[];
  limit: number;
  offset: number;
  isLeftJoin: boolean;
  joins?: NewQuery[];
  tableAlias?: string;
  $path?: string[];
};

export const asNameAlias = (field: string, tableAlias?: string) => {
  let result = asName(field);
  if(tableAlias) return asName(tableAlias) + "." + result;
  return result;
}

export type FieldSpec = {
  name: string;
  type: "column" | "computed";
  /**
   * allowedFields passed for multicol functions (e.g.: $rowhash)
   */
  getQuery: (params: { allowedFields: string[], tableAlias?: string, ctidField?: string }) => string;
};

export type FunctionSpec = {
  name: string;
  type: "function" | "aggregation" | "computed";
  /**
   * getFields: string[] -> used to validate user supplied field names. It will be fired before querying to validate allowed columns
   *      if not field names are used from arguments then return an empty array
   */
  getFields: (args: any[]) => string[];
  /**
   * allowedFields passed for multicol functions (e.g.: $rowhash)
   */
  getQuery: (params: { allowedFields: string[], args: any[], tableAlias?: string, ctidField?: string }) => string;
};

/**
* Each function expects a column at the very least
*/
const FUNCTIONS: FunctionSpec[] = [

  // Hashing
  {
    name: "$md5_multi",
    type: "function",
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("md5(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")");
      return q
    }
  },
  {
    name: "$md5_multi_agg",
    type: "aggregation",
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("md5(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ','))");
      return q
    }
  },

  {
    name: "$sha256_multi",
    type: "function",
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha256((" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha256_multi_agg",
    type: "aggregation",
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha256(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ',')::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha512_multi",
    type: "function",
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha512((" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha512_multi_agg",
    type: "aggregation",
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha512(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ',')::text::bytea), 'hex')");
      return q
    }
  },





  {
    name: "$ST_AsGeoJSON",
    type: "function",
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("ST_AsGeoJSON($1:name)::json", [args[0]]);
    }
  },
  {
    name: "$left",
    type: "function",
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("LEFT($1:name, $2)", [args[0], args[1]]);
    }
  },

  {
    name: "$to_char",
    type: "function",
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      if(args.length === 3){
        return pgp.as.format("to_char($1:name, $2, $3)", [args[0], args[1], args[2]]);
      }
      return pgp.as.format("to_char($1:name, $2)", [args[0], args[1]]);
    }
  },

  /* Date funcs date_part */
  ...["date_trunc", "date_part"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    getFields: (args: any[]) => [args[1]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(funcName + "($1, $2:name)", [args[0], args[1]]);
    }
  } as FunctionSpec)),

  /* Handy date funcs */
  ...[
    ["date", "YYYY-MM-DD"],
    ["datetime", "YYYY-MM-DD HH24:MI"],
    ["timedate", "HH24:MI YYYY-MM-DD"],

    ["time", "HH24:MI"],
    ["time12", "HH:MI"],
    ["timeAM", "HH:MI AM"],

    ["dy", "dy"],
    ["Dy", "Dy"],
    ["day", "day"],
    ["Day", "Day"],

    ["DayNo", "DD"],
    ["DD", "DD"],

    ["dowUS", "D"],
    ["D", "D"],
    ["dow", "ID"],
    ["ID", "ID"],

    ["MonthNo", "MM"],
    ["MM", "MM"],

    ["mon", "mon"],
    ["Mon", "Mon"],
    ["month", "month"],
    ["Month", "Month"],

    ["year", "yyyy"],
    ["yyyy", "yyyy"],
    ["yy", "yy"],
    ["yr", "yy"],
  ].map(([funcName, txt]) => ({
    name: "$" + funcName,
    type: "function",
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("to_char($1:name, $2)", [args[0], txt]);
    }
  } as FunctionSpec)),

  /* Basic 1 arg col funcs */
  ...["upper", "lower", "length", "reverse", "trim", "initcap", "round", "ceil", "floor", "sign", "age"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(funcName + "($1:name)", [args[0]]);
    }
  } as FunctionSpec)),

  /* Aggs */
  ...["max", "min", "count", "avg", "json_agg", "string_agg", "array_agg", "sum"].map(aggName => ({
    name: "$" + aggName,
    type: "aggregation",
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(aggName + "($1:name)", [args[0]]);
    }
  } as FunctionSpec)),
  
];

/* The difference between a function and computed field is that the computed field does not require any arguments */
export const COMPUTED_FIELDS: FieldSpec[] = [
  {
    name: "$rowhash",
    type: "computed",
    getQuery: ({ allowedFields, tableAlias, ctidField }) => {
      return "md5(" +
        allowedFields
          .concat(ctidField? [ctidField] : [])
          .sort()
          .map(f => asNameAlias(f, tableAlias))
          .map(f => `md5(coalesce(${f}::text, 'dd'))`)
          .join(" || ") + 
      `)`;
    }
  }
];

export async function getNewQuery(
  _this: TableHandler,
  filter: Filter, 
  selectParams?: SelectParams & { alias?: string }, 
  param3_unused = null, 
  tableRules?: TableRule, 
  localParams?: LocalParams
): Promise<NewQuery> {

  // const all_columns: SelectItem[] = _this.column_names.slice(0).map(fieldName => ({
  //   type: "column",
  //   alias: fieldName,
  //   getQuery: () => asName(fieldName),
  //   getFields: () => [fieldName],
  //   selected: false
  // } as SelectItem))
  // .concat(COMPUTED_FIELDS.map(c => ({
  //   type: c.type,
  //   alias: c.name,
  //   getQuery: () => c.getQuery(),
  //   getFields: c.getFields,
  //   selected: false
  // })))

  let select: SelectItem[] = [],
    joinQueries: NewQuery[] = [];

    // const all_colnames = _this.column_names.slice(0).concat(COMPUTED_FIELDS.map(c => c.name));

  selectParams = selectParams || {};
  const { select: userSelect = "*" } = selectParams,
    allCols = _this.column_names.slice(0),
    allFieldsIncludingComputed = allCols.concat(COMPUTED_FIELDS.map(c => c.name)),
    allowedFields = _this.parseFieldFilter(get(tableRules, "select.fields")) || _this.column_names.slice(0),
    allowedFieldsIncludingComputed = _this.parseFieldFilter(get(tableRules, "select.fields"), true, allFieldsIncludingComputed) || allFieldsIncludingComputed,
    checkField = (f: string) => {
      if(!allowedFieldsIncludingComputed.includes(f)) throw "Field " + f + " is invalid or dissallowed";
      return f;
    },
    addItem = (item: SelectItem) => {
      item.getFields().map(checkField);
      if(select.find(s => s.alias === item.alias)) throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
      select.push(item);
    },
    addFunction = (funcDef: FunctionSpec, args: any[], alias: string) => {
      addItem({
        type: funcDef.type,
        alias,
        getFields: () => funcDef.getFields(args),
        getQuery: (tableAlias?: string) => funcDef.getQuery({ allowedFields, args, tableAlias, ctidField: _this.is_view? undefined : "ctid" }),
        selected: true
      });
    },
    addColumn = (fieldName: string, selected: boolean) => {

      /* Check if computed col */
      if(selected){
        const compCol = COMPUTED_FIELDS.find(cf => cf.name === fieldName);
        if(compCol && !select.find(s => s.alias === fieldName)){
          const cf: FunctionSpec = { 
            ...compCol,
            type: "computed",
            getFields: (args: any[]) => [] 
          }
          addFunction(cf, [], compCol.name)
          return;
        }
      }

      let alias = selected? fieldName : ("not_selected_" + fieldName);
      addItem({
        type: "column",
        alias,
        getQuery: () => asName(fieldName),
        getFields: () => [fieldName],
        selected
      });
    };

    /* Check for conflicting computed column names */
    const conflictingCol = allFieldsIncludingComputed.find((cf, i) => allFieldsIncludingComputed.find((_cf, _i) => cf === _cf && i !== _i));
    if(conflictingCol){
      const isComp = COMPUTED_FIELDS.find(c => c.name === conflictingCol);
      throw "INTERNAL ERROR: Cannot have duplicate column names ( " + conflictingCol + " ). " + (!isComp? "" : "One or more computed column names collide with the real ones");
    }

    /* Array select */
  if(Array.isArray(userSelect)){
    if(userSelect.find(key => typeof key !== "string")) throw "Invalid array select. Expecting an array if strings";

    userSelect.map(key => addColumn(key, true))

  /* Empty select */
  } else if(userSelect === ""){
    // select.push({
    //   type: "function",
    //   alias: "",
    //   getFields: () => [],
    //   getQuery: () => ""
    // })
  } else if(userSelect === "*"){
    allowedFields.map(key => addColumn(key, true) );
  } else if(isPlainObject(userSelect) && !isEmpty(userSelect as object)){
    const selectKeys = Object.keys(userSelect),
      selectValues = Object.values(userSelect);

    /* Cannot include and exclude at the same time */
    if(
      selectValues.filter(v => [0, false].includes(v)).length 
    ){
      if(selectValues.filter(v => ![0, false].includes(v)).length ){
        throw "\nCannot include and exclude fields at the same time";
      }

      /* Exclude only */
      allowedFields.filter(f => !selectKeys.includes(f)).map(key => addColumn(key, true) )
        
    } else {
      await Promise.all(selectKeys.map(async key => {
        const val = userSelect[key],
          throwErr = (extraErr: string = "") => {
            console.trace(extraErr)
            throw "Unexpected select -> " + JSON.stringify({ [key]: val }) + "\n" + extraErr;
          };
      
        /* Included fields */
        if([1, true].includes(val)){
          if(key === "*"){
            allowedFields.map(key => addColumn(key, true) )
          } else {
            addColumn(key, true);
          }

        /* Aggs and functions */
        } else if(typeof val === "string" || isPlainObject(val)) {

          /* Function 
              { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
          */  
          if(
            (typeof val === "string" && val !== "*") ||
            isPlainObject(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0])
          ){
            let funcName, args;
            if(typeof val === "string") {
              /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
              try {
                checkField(key)
              } catch (err){
                throwErr(`Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. Use correct column name or full function notation, e.g.: -> { key: { $func_name: ["column_name"] } } `)
              }
              funcName = val;
              args = [key];
            } else {
              const callKeys = Object.keys(val);
              if(callKeys.length !== 1 || !Array.isArray(val[callKeys[0]])) throw "\nIssue with select. \nUnexpected function definition. \nExpecting { field_name: func_name } OR { result_key: { func_name: [arg1, arg2 ...] } } \nBut got -> " + JSON.stringify({ [key]: val });
              funcName = callKeys[0];
              args = val[callKeys[0]];
            }

            const funcDef = FUNCTIONS.find(f => f.name === funcName);
            if(!funcDef) throw `Invalid or dissallowed function name: ` + funcName;
            
            addFunction(funcDef, args, key);
            // addItem({
            //   type: funcDef.type,
            //   alias: key,
            //   getFields: () => funcDef.getFields(args),
            //   getQuery: (tableAlias?: string) => funcDef.getQuery({ allowedFields, args, tableAlias, ctidField: _this.is_view? undefined : "ctid" }),
            //   selected: true
            // });

          /* Join */
          } else {
            // console.log({ key, val })
            let j_filter: Filter = {},
                j_selectParams: SelectParams = {},
                j_path: string[],
                j_alias: string,
                j_tableRules: TableRule,
                j_table: string,
                j_isLeftJoin: boolean = true;

            if(val === "*"){
              j_selectParams.select = "*";
              j_alias = key;
              j_table = key;
            } else {

              /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
              const JOIN_KEYS = ["$innerJoin", "$leftJoin"];
              const JOIN_PARAMS = ["select", "filter", "$path", "offset", "limit", "orderBy"];
              const joinKeys = Object.keys(val).filter(k => JOIN_KEYS.includes(k));
              if(joinKeys.length > 1) {
                throwErr("\nCannot specify more than one join type ( $innerJoin OR $leftJoin )");
              } else if(joinKeys.length === 1) {
                const invalidParams = Object.keys(val).filter(k => ![ ...JOIN_PARAMS, ...JOIN_KEYS ].includes(k));
                if(invalidParams.length) throw "Invalid join params: " + invalidParams.join(", ");
  
                j_isLeftJoin = joinKeys[0] === "$leftJoin";
                j_table = val[joinKeys[0]];
                j_alias = key;
                if(typeof j_table !== "string") throw "\nIssue with select. \nJoin type must be a string table name but got -> " + JSON.stringify({ [key]: val });
                
                j_selectParams.select = val.select || "*";
                j_filter = val.filter || {};
                j_selectParams.limit = val.limit;
                j_selectParams.offset = val.offset;
                j_selectParams.orderBy = val.orderBy;
                j_path = val.$path;
              } else {
                j_selectParams.select = val;
                j_alias = key;
                j_table = key;
              }
            }

            const _thisJoinedTable: any = _this.dboBuilder.dbo[j_table];
            if(!_thisJoinedTable) throw `Joined table ${j_table} is disallowed or inexistent`;

            let isLocal = true;
            if(localParams && localParams.socket){
              isLocal = false;
              j_tableRules = await _this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: j_table, command: "find", socket: localParams.socket });
            }
            
            if(isLocal || j_tableRules){

              const joinQuery: NewQuery = await getNewQuery(
                  _thisJoinedTable,
                  j_filter, 
                  { ...j_selectParams, alias: j_alias }, 
                  param3_unused, 
                  j_tableRules, 
                  localParams
                );
              joinQuery.isLeftJoin = j_isLeftJoin;
              joinQuery.tableAlias = j_alias;
              joinQuery.$path = j_path;
              joinQueries.push(joinQuery);
              // console.log(joinQuery)
            }
          }

        } else throwErr();

      }));
    }
  } else throw "Unexpected select -> " + JSON.stringify(userSelect);

  /* Add non selected columns */
  allowedFields.map(key => {
    if(!select.find(s => s.alias === key && s.type === "column")){
      addColumn(key, false);
    }
  });

  const validatedAggAliases = select.filter(s => s.type === "aggregation").map(s => s.alias);
  let resQuery: NewQuery = {
    allFields: allowedFields,
    select,
    table: _this.name,
    joins: joinQueries,
    where: await _this.prepareWhere(filter, get(tableRules, "select.forcedFilter"), get(tableRules, "select.filterFields"), null, selectParams.alias, localParams, tableRules),
    limit: _this.prepareLimitQuery(selectParams.limit, get(tableRules, "select.maxLimit")),
    orderBy: [_this.prepareSort(selectParams.orderBy, allowedFields, selectParams.alias, null, validatedAggAliases)],
    offset: _this.prepareOffsetQuery(selectParams.offset)
  } as NewQuery;

  // console.log(resQuery);
  // console.log(buildJoinQuery(_this, resQuery));
  return resQuery;
}



/* No validation/authorisation at this point */
export function makeQuery(
  _this: TableHandler,
  q: NewQuery, 
  depth: number = 0, 
  joinFields: string[] = []
): string {
  const PREF = `prostgles`,
      joins = q.joins || [],
      // aggs = q.aggs || [],
      makePref = (q: NewQuery) => !q.tableAlias? q.table : `${q.tableAlias || ""}_${q.table}`,
      makePrefANON = (joinAlias, table) => asName(!joinAlias? table : `${joinAlias || ""}_${table}`),
      makePrefAN = (q: NewQuery) => asName(makePref(q));

  const indentLine = (numInd, str, indentStr = "    ") => new Array(numInd).fill(indentStr).join("") + str;
  const indStr = (numInd, str: string) => str.split("\n").map(s => indentLine(numInd, s)).join("\n");
  const indjArr = (numInd, strArr: string[], indentStr = "    "): string[] => strArr.map(str => indentLine(numInd, str) );
  const indJ = (numInd, strArr: string[], separator = " \n ", indentStr = "    ") => indjArr(numInd, strArr, indentStr).join(separator);
  const selectArrComma = (strArr: string[]): string[] => strArr.map((s, i, arr)=> s + (i < arr.length - 1? " , " : " "));
  const prefJCAN = (q: NewQuery, str: string) => asName(`${q.tableAlias || q.table}_${PREF}_${str}`);

  // const indent = (a, b) => a;
  const joinTables = (q1: NewQuery, q2: NewQuery): string[] => {
    const paths = _this.getJoins(q1.table, q2.table, q2.$path);

    return flat(paths.map(({ table, on }, i) => {
      const getPrevColName = (col: string) => {
        return table === q1.table? q1.select.find(s => s.getQuery() === asName(col)).alias : col;
      }
      const getThisColName = (col: string) => {
        return table === q2.table? q2.select.find(s => s.getQuery() === asName(col)).alias : col;
      }

      const prevTable = i === 0? q1.table : (paths[i - 1].table);
      const thisAlias = makePrefANON(q2.tableAlias, table);
      const prevAlias = i === 0? makePrefAN(q1) : thisAlias;
      // If root then prev table is aliased from root query. Alias from join otherwise

      let iQ = [
          asName(table) + ` ${thisAlias}`
      ];

      /* If target table then add filters, options, etc */
      if(i === paths.length - 1){
            
          // const targetSelect = (
          //     q2.select.concat(
          //         (q2.joins || []).map(j => j.tableAlias || j.table)
          //     ).concat(
          //         /* Rename aggs to avoid collision with join cols */
          //         (q2.aggs || []).map(a => asName(`agg_${a.alias}`) + " AS " + asName(a.alias)) || [])
          //     ).filter(s => s).join(", ");
          
          const targetSelect = q2.select.filter(s => s.selected).map(s => {
              /* Rename aggs to avoid collision with join cols */
              if(s.type === "aggregation") return asName(`agg_${s.alias}`) + " AS " + asName(s.alias);
              return s.alias;
            }).join(", ");

          const _iiQ = makeQuery(_this, q2, depth + 1, on.map(([c1, c2]) => asName(c2)));
          // const iiQ = flat(_iiQ.split("\n")); // prettify for debugging
          // console.log(_iiQ)
          const iiQ = [_iiQ];

          iQ = [
              "("
          , ...indjArr(depth + 1, [
                  `-- 4. [target table] `
              ,   `SELECT *,`
              ,   `row_number() over() as ${prefJCAN(q2, `rowid_sorted`)},`
              ,   `row_to_json((select x from (SELECT ${targetSelect}) as x)) AS ${prefJCAN(q2, `json`)}`
              ,   `FROM (`
              ,   ...iiQ
              ,   `) ${asName(q2.table)}    `
          ])
          ,   `) ${thisAlias}`
          ]
      }
      let jres =  [
          `${q2.isLeftJoin? "LEFT" : "INNER"} JOIN `
      , ...iQ
      ,   `ON ${
              on.map(([c1, c2]) => 
                  `${prevAlias}.${asName(getPrevColName(c1))} = ${thisAlias}.${asName(getThisColName(c2))} `
              ).join(" AND ")
          }`
      ];
      return jres;
    }))
  }
      
  /* Leaf query -> no joins -> return simple query */
  const aggs = q.select.filter(s => s.type === "aggregation");
  const nonAggs = q.select.filter(s => depth || s.selected).filter(s => s.type !== "aggregation");
  if(!joins.length){
      /* Nested queries contain all fields to allow joining */
      let select = q.select.filter(s => depth || s.selected).map(s => {
          if(s.type === "aggregation"){
            /* Rename aggs to avoid collision with join cols */
            return s.getQuery(!depth? undefined : `agg_${s.alias}`) + " AS " + asName(s.alias);
          }
          return s.getQuery() + " AS " + asName(s.alias);
        }),
        groupBy = "";
      // console.log(select, q);

      /* If aggs exist need to set groupBy add joinFields into select */
      if(aggs.length){
          const missingFields = joinFields.filter(jf => !q.select.find(s => s.type === "column" && s.alias === jf));
          if(depth && missingFields.length){
              select = Array.from(new Set(missingFields.concat(select)));
          }

          if(nonAggs.length){
            groupBy = `GROUP BY ${nonAggs.map(sf => sf.type === "function"? sf.getQuery() :  asName(sf.alias)).join(", ")}\n`;
          }
      }
      
      let fres = indJ(depth, [
          `-- 0. or 5. [leaf query] `
      // ,   `SELECT ` + select.concat((q.selectFuncs || []).map(sf => sf.getQuery("$rowhash"))).join(", ")
      ,   `SELECT ` + q.select.filter(s => depth || s.selected).map(s => {
              // return s.getQuery() + ((s.type !== "column")? (" AS " + s.alias) : "")
              
              if(s.type === "aggregation"){
                /* Rename aggs to avoid collision with join cols */
                return s.getQuery() + " AS " + asName((depth? "agg_" : "") + s.alias);
              }
              return s.getQuery() + " AS " + asName(s.alias)
        }).join(", ")
      ,   `FROM ${asName(q.table)} `
      ,   q.where
      ,   groupBy //!aggs.length? "" : `GROUP BY ${nonAggs.map(sf => asName(sf.alias)).join(", ")}`,
      ,   q.orderBy.join(", ")
      ,   !depth? `LIMIT ${q.limit} ` : null
      ,   !depth? `OFFSET ${q.offset || 0} ` : null
      ].filter(v => v && (v + "").trim().length) as unknown as string[]);
      // console.log(fres);
      return fres;
  } else {
      // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
      if(
        q.select.find(s => s.type === "aggregation") && 
        joins.find(j => j.select.find(s => s.type === "aggregation"))
      ) throw "Cannot join two aggregates";
  }

  if(joins && joins.length && aggs.length) throw "Joins within Aggs dissallowed";

  // if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
  
  let rootGroupBy: string;
  if((aggs.length || q.joins && q.joins.length) && nonAggs.length){
    // console.log({ aggs, nonAggs, joins: q.joins })
    rootGroupBy = `GROUP BY ${(depth? q.allFields : nonAggs.map(s => s.type === "function"? s.getQuery() : asName(s.alias))).concat(aggs && aggs.length? [] : [`ctid`]).filter(s => s).join(", ")} `
  }

  /* Joined query */
  const rootSelect = [
      " \n"
  ,   `-- 0. [joined root]  `
  ,   "SELECT    "
  ,...selectArrComma(q.select.filter(s => depth || s.selected).map(s => s.getQuery() + " AS " + asName(s.alias)).concat(
      joins.map((j, i)=> {
          const jsq = `json_agg(${prefJCAN(j, `json`)}::jsonb ORDER BY ${prefJCAN(j, `rowid_sorted`)}) FILTER (WHERE ${prefJCAN(j, `limit`)} <= ${j.limit} AND ${prefJCAN(j, `dupes_rowid`)} = 1 AND ${prefJCAN(j, `json`)} IS NOT NULL)`;
          const resAlias = asName(j.tableAlias || j.table)

          // If limit = 1 then return a single json object (first one)
          return (j.limit === 1? `${jsq}->0 ` : `COALESCE(${jsq}, '[]') `) +  `  AS ${resAlias}`;
      })
    ))
  ,   `FROM ( `
  ,   ...indjArr(depth + 1, [
          "-- 1. [subquery limit + dupes] "
      ,   "SELECT     "
      ,    ...selectArrComma([`t1.*`].concat(
              joins.map((j, i)=> {
                  return  `row_number() over(partition by ${prefJCAN(j, `dupes_rowid`)}, ` + 
                      `ctid order by ${prefJCAN(j, `rowid_sorted`)}) AS ${prefJCAN(j, `limit`)}  `
              }))
          )
      ,   `FROM ( ----------- ${makePrefAN(q)}`
      ,   ...indjArr(depth + 1, [
              "-- 2. [source full select + ctid to group by] "
          ,   "SELECT "
          ,   ...selectArrComma(
                  q.allFields.concat(["ctid"])
                  .map(field => `${makePrefAN(q)}.${field}  `)
                  .concat(
                      joins.map((j, i)=> 
                      makePrefAN(j) + "." + prefJCAN(j, `json`) + ", " + makePrefAN(j) + "." + prefJCAN(j, `rowid_sorted`)
                      ).concat(
                          joins.map(j => `row_number() over(partition by ${makePrefAN(j)}.${prefJCAN(j, `rowid_sorted`)}, ${makePrefAN(q)}.ctid ) AS ${prefJCAN(j, `dupes_rowid`)}`)
                      )
              ))
          ,   `FROM ( `
          ,   ...indjArr(depth + 1, [
                  "-- 3. [source table] "
              ,   "SELECT "
              ,   "*, row_number() over() as ctid "
              ,   `FROM ${asName(q.table)} `
              ,   `${q.where} `
              ])
          ,   `) ${makePrefAN(q)} `
          ,   ...flat(joins.map((j, i)=> joinTables(q, j)))
          ])
      ,   ") t1"
      ])
  ,   ") t0"
  ,   rootGroupBy
  ,   q.orderBy
  ,   depth? null : `LIMIT ${q.limit || 0} OFFSET ${q.offset || 0}`
  ,   "-- EOF 0. joined root"
  ,   " \n"
  ].filter(v => v)

  let res = indJ(depth, rootSelect as unknown as string[]);
  // res = indent(res, depth);
  // console.log(res);
  return res;
}


/* Code cemetery */


    /* No validation/authorisation at this point */
  //   async buildJoinQuery(q: Query): Promise<string> {
  //     const makeQuery3 = (q: Query, depth: number = 0, joinFields: string[]) => {
  //         const PREF = `prostgles`,
  //             joins = q.joins || [],
  //             aggs = q.aggs || [],
  //             makePref = (q: Query) => !q.joinAlias? q.table : `${q.joinAlias || ""}_${q.table}`,
  //             makePrefANON = (joinAlias, table) => asName(!joinAlias? table : `${joinAlias || ""}_${table}`),
  //             makePrefAN = (q: Query) => asName(makePref(q));

  //         const indentLine = (numInd, str, indentStr = "    ") => new Array(numInd).fill(indentStr).join("") + str;
  //         const indStr = (numInd, str: string) => str.split("\n").map(s => indentLine(numInd, s)).join("\n");
  //         const indjArr = (numInd, strArr: string[], indentStr = "    "): string[] => strArr.map(str => indentLine(numInd, str) );
  //         const indJ = (numInd, strArr: string[], separator = " \n ", indentStr = "    ") => indjArr(numInd, strArr, indentStr).join(separator);
  //         const selectArrComma = (strArr: string[]): string[] => strArr.map((s, i, arr)=> s + (i < arr.length - 1? " , " : " "));
  //         const prefJCAN = (q: Query, str: string) => asName(`${q.joinAlias || q.table}_${PREF}_${str}`);

  //         // const indent = (a, b) => a;
  //         const joinTables = (q1: Query, q2: Query): string[] => {
  //             const paths = this.getJoins(q1.table, q2.table, q2.$path);

  //             return flat(paths.map(({ table, on }, i) => {
  //                 const prevTable = i === 0? q1.table : (paths[i - 1].table);
  //                 const thisAlias = makePrefANON(q2.joinAlias, table);
  //                 const prevAlias = i === 0? makePrefAN(q1) : thisAlias;
  //                 // If root then prev table is aliased from root query. Alias from join otherwise

  //                 let iQ = [
  //                     asName(table) + ` ${thisAlias}`
  //                 ];

  //                 /* If target table then add filters, options, etc */
  //                 if(i === paths.length - 1){
                       
  //                     const targetSelect = (
  //                         q2.select.concat(
  //                             (q2.joins || []).map(j => j.joinAlias || j.table)
  //                         ).concat(
  //                             /* Rename aggs to avoid collision with join cols */
  //                             (q2.aggs || []).map(a => asName(`agg_${a.alias}`) + " AS " + asName(a.alias)) || [])
  //                         ).filter(s => s).join(", ");

  //                     const _iiQ = makeQuery3(q2, depth + 1, on.map(([c1, c2]) => asName(c2)));
  //                     // const iiQ = flat(_iiQ.split("\n")); // prettify for debugging
  //                     // console.log(_iiQ)
  //                     const iiQ = [_iiQ];

  //                     iQ = [
  //                         "("
  //                     , ...indjArr(depth + 1, [
  //                             `-- 4. [target table] `
  //                         ,   `SELECT *,`
  //                         ,   `row_number() over() as ${prefJCAN(q2, `rowid_sorted`)},`
  //                         ,   `row_to_json((select x from (SELECT ${targetSelect}) as x)) AS ${prefJCAN(q2, `json`)}`
  //                         ,   `FROM (`
  //                         ,   ...iiQ
  //                         ,   `) ${asName(q2.table)}    `
  //                     ])
  //                     ,   `) ${thisAlias}`
  //                     ]
  //                 }
  //                 let jres =  [
  //                     `${q2.isLeftJoin? "LEFT" : "INNER"} JOIN `
  //                 , ...iQ
  //                 ,   `ON ${
  //                         on.map(([c1, c2]) => 
  //                             `${prevAlias}.${asName(c1)} = ${thisAlias}.${asName(c2)} `
  //                         ).join(" AND ")
  //                     }`
  //                 ];
  //                 return jres;
  //             }))
  //         }
              
  //         /* Leaf query */
  //         if(!joins.length){
  //             let select = (depth? q.allFields : q.select),
  //                 groupBy = "";
  //             // console.log(select, q);
  //             if(q.aggs && q.aggs.length){
  //                 q.select = q.select.filter(s => s && s.trim().length);
  //                 const missingFields = joinFields.filter(jf => !q.select.includes(jf));
  //                 let groupByFields = q.select;
  //                 if(depth && missingFields.length){
  //                     q.select = Array.from(new Set(missingFields.concat(q.select)));
  //                     groupByFields = q.select;
  //                 }

  //                 /* Rename aggs to avoid collision with join cols */
  //                 select = q.select.concat(q.aggs.map(a => !depth? a.query : a.getQuery(`agg_${a.alias}`)));
  //                 if(q.select.length){
  //                     groupBy = `GROUP BY ${groupByFields.concat((q.selectFuncs || []).map(sf => asName(sf.alias))).join(", ")}\n`;
  //                 }
  //             }
              
  //             // let res = "" +
  //             // `SELECT -- leaf query\n` + 
  //             // `${select} \n` +
  //             // `FROM ${asName(q.table)}\n`;

  //             // if(q.where) res += `${q.where}\n`;
  //             // if(groupBy) res += `${groupBy}\n`;
  //             // if(q.orderBy) res+= `${q.orderBy}\n`;
  //             // if(!depth) res += `LIMIT ${q.limit} \nOFFSET ${q.offset || 0}\n`;
  //             // console.log(select, q.selectFuncs)
  //             let fres = indJ(depth, [
  //                 `-- 0. or 5. [leaf query] `
  //             ,   `SELECT ` + select.concat((q.selectFuncs || []).map(sf => sf.getQuery("$rowhash"))).join(", ")
  //             ,   `FROM ${asName(q.table)} `
  //             ,   q.where
  //             ,   groupBy
  //             ,   q.orderBy
  //             ,   !depth? `LIMIT ${q.limit} ` : null
  //             ,   !depth? `OFFSET ${q.offset || 0} ` : null
  //             ].filter(v => v) as unknown as string[]);
  //             // console.log(fres);
  //             return fres;
  //         } else {
  //             // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
  //             if(q.aggs && q.aggs.length && joins.find(j => j.aggs && j.aggs.length)) throw "Cannot join two aggregates";
  //         }

  //         if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
          
  //         const rootSelect = [
  //             " "
  //         ,   `-- 0. [root final]  `
  //         ,   "SELECT    "
  //         ,...selectArrComma((depth? q.allFields : q.select).filter(s => s).concat(
  //             joins.map((j, i)=> {
  //                 const jsq = `json_agg(${prefJCAN(j, `json`)}::jsonb ORDER BY ${prefJCAN(j, `rowid_sorted`)})   FILTER (WHERE ${prefJCAN(j, `limit`)} <= ${j.limit} AND ${prefJCAN(j, `dupes_rowid`)} = 1 AND ${prefJCAN(j, `json`)} IS NOT NULL)`;
  //                 const resAlias = asName(j.joinAlias || j.table)

  //                 // If limit = 1 then return a single json object (first one)
  //                 return (j.limit === 1? `${jsq}->0 ` : `COALESCE(${jsq}, '[]') `) +  `  AS ${resAlias}`;
  //             })
  //           ).concat((aggs || []).map(a => a.getQuery(a.alias))))
  //         ,   `FROM ( `
  //         ,   ...indjArr(depth + 1, [
  //                 "-- 1. [subquery limit + dupes] "
  //             ,   "SELECT     "
  //             ,    ...selectArrComma([`t1.*`].concat(
  //                     joins.map((j, i)=> {
  //                         return  `row_number() over(partition by ${prefJCAN(j, `dupes_rowid`)}, ` + 
  //                             `ctid order by ${prefJCAN(j, `rowid_sorted`)}) AS ${prefJCAN(j, `limit`)}  `
  //                     }))
  //                 )
  //             ,   `FROM ( ----------- ${makePrefAN(q)}`
  //             ,   ...indjArr(depth + 1, [
  //                     "-- 2. [source full select + ctid to group by] "
  //                 ,   "SELECT "
  //                 ,   ...selectArrComma(
  //                         q.allFields.concat(["ctid"])
  //                         .map(field => `${makePrefAN(q)}.${field}  `)
  //                         .concat(
  //                             joins.map((j, i)=> 
  //                             makePrefAN(j) + "." + prefJCAN(j, `json`) + ", " + makePrefAN(j) + "." + prefJCAN(j, `rowid_sorted`)
  //                             ).concat(
  //                                 joins.map(j => `row_number() over(partition by ${makePrefAN(j)}.${prefJCAN(j, `rowid_sorted`)}, ${makePrefAN(q)}.ctid ) AS ${prefJCAN(j, `dupes_rowid`)}`)
  //                             )
  //                     ))
  //                 ,   `FROM ( `
  //                 ,   ...indjArr(depth + 1, [
  //                         "-- 3. [source table] "
  //                     ,   "SELECT "
  //                     ,   "*, row_number() over() as ctid "
  //                     ,   `FROM ${asName(q.table)} `
  //                     ,   `${q.where} `
  //                     ])
  //                 ,   `) ${makePrefAN(q)} `
  //                 ,   ...flat(joins.map((j, i)=> joinTables(q, j)))
  //                 ])
  //             ,   ") t1"
  //             ])
  //         ,   ") t0"
  //         ,   `GROUP BY ${(depth? q.allFields : q.select).concat(aggs && aggs.length? [] : [`ctid`]).filter(s => s).join(", ")} `
  //         ,   q.orderBy
  //         ,   depth? null : `LIMIT ${q.limit || 0} OFFSET ${q.offset || 0}`
  //         ,   "-- eof 0. root"
  //         ,   " "
  //         ].filter(v => v)

  //         let res = indJ(depth, rootSelect as unknown as string[]);
  //         // res = indent(res, depth);
  //         // console.log(res);
  //         return res;




  //         // WHY NOT THIS?
  //     //     return `WITH _posts AS (
  //     //         SELECT *, row_to_json((select x from (select id, title) as x)) as posts
  //     //         FROM posts
  //     // ), _comments AS (
  //     //         SELECT comments.ctid, comments.id, comments.post_id, comments.user_id, row_to_json((select x from (select _posts.id, json_agg(_posts.posts) as posts) as x)) as posts
  //     //         FROM comments
  //     //         LEFT JOIN _posts
  //     //         ON comments.post_id = _posts.id
  //     //         WHERE comments.id IS NOT NULL
  //     //         GROUP BY comments.ctid, comments.id, comments.post_id, comments.user_id, _posts.id
  //     //         ORDER BY comments.ctid
  //     // ), _users AS (
  //     //         SELECT users.id, users.username, COALESCE( json_agg((SELECT x FROM (SELECT _comments.id, _comments.posts) AS x)) FILTER (WHERE _comments.ctid IS NOT NULL), '[]') as comments
  //     //         FROM users
  //     //         LEFT JOIN _comments
  //     //         ON users.id = _comments.user_id
  //     //         GROUP BY users.id, users.username
  //     //         LIMIT 15
  //     // )
  //     };

  //     return makeQuery3(q, 0, []);
  // }









//   async buildQueryTree(filter: Filter, selectParams?: SelectParams & { alias?: string }, param3_unused = null, tableRules?: TableRule, localParams?: LocalParams): Promise<Query> {
//     this.checkFilter(filter);
//     const { select, alias } = selectParams || {};
//     let mainSelect = select;

//     let joinAliases: string[],
//         _Aggs: Aggregation[],
//         aggAliases = [],
//         aggs: string[],
//         joinQueries: Query[] = [];
        
//     // console.log("add checks for when to REINDEX TABLE CONCURRENTLY ... \nand also if join columns are missing indexes\nand also if running out of disk space!! (in nodejs)")
    
//     if(isPlainObject(select)){
//         if(
//             Object.values(select).find(v => (v === 1 || v === true)) &&
//             Object.values(select).find(v => (v === 0 || v === false))
//         ) throw "\nCannot include and exclude fields at the same time";

//         _Aggs = this.getAggs(filterObj(<object>select, Object.keys(select).filter(key => select[key] !== "*") )) || [];
//         let aggFields = Array.from(new Set(_Aggs.map(a => a.field)));
        
//         aggAliases = _Aggs.map(a => a.alias);
        
//         if(_Aggs.length){
//             /* Validate fields from aggs */
//             await this.prepareValidatedQuery({}, { select: aggFields }, param3_unused, tableRules, localParams);
//         }
//         joinAliases = Object.keys(select)
//             .filter(key => 
//                 !aggAliases.includes(key) && 
//                 ( 
//                     select[key] === "*" 
//                     ||  
//                     isPlainObject(select[key])
//                 ) 
//         );
//         if(joinAliases && joinAliases.length){
//             if(!this.joinPaths) throw "Joins not allowed";
//             for(let i = 0; i < joinAliases.length; i++){
//                 let jKey = joinAliases[i],
//                     jParams = select[jKey],
//                     jTable = jKey,
//                     isLeftJoin = true,
//                     jSelectAlias = jKey,
//                     jSelect = jParams,
//                     jFilter = {},
//                     jLimit = undefined,
//                     jOffset = undefined,
//                     jOrder = undefined,
//                     jPath = undefined;
                
//                 /* Detailed join config */
//                 if(isPlainObject(jParams)){
//                     /* Has params */
//                     const joinKeys = Object.keys(jParams).filter(key => ["$innerJoin", "$leftJoin"].includes(key)); 
//                     if(joinKeys.length){
//                         if(joinKeys.length > 1) throw "cannot use $innerJoin and $leftJoin at the same time on same table";
//                         jTable = jParams[joinKeys[0]];
//                         jSelect = jParams.select || "*";
//                         jFilter = jParams.filter || {};
//                         jLimit = jParams.limit;
//                         jOffset = jParams.offset;
//                         jOrder = jParams.orderBy;
//                         jPath = jParams.$path;
//                         isLeftJoin = joinKeys[0] === "$leftJoin";
//                     }
//                 }
//                 // const joinTable = joins[i];

//                 if(!this.dboBuilder.dbo[jTable]) throw `Joined table ${jTable} is disallowed or inexistent`;

//                 let joinTableRules = undefined, isLocal = true;
//                 if(localParams && localParams.socket){
//                     isLocal = false;
//                     joinTableRules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: jTable, command: "find", socket: localParams.socket });
//                 }
//                 if(isLocal || joinTableRules){

//                     const joinQuery = await (this.dboBuilder.dbo[jTable] as TableHandler).buildQueryTree(jFilter, { select: jSelect, limit: jLimit, offset: jOffset, orderBy: jOrder, alias: jSelectAlias }, param3_unused, joinTableRules, localParams);
//                     joinQuery.isLeftJoin = isLeftJoin;
//                     joinQuery.joinAlias = jSelectAlias;
//                     joinQuery.$path = jPath;
//                     joinQueries.push(joinQuery);
//                 }
//             }
//         } 
        
//         mainSelect = filterObj(<object>select, Object.keys(select).filter(key => !(aggAliases.concat(joinAliases).includes(key))));
//         /* Allow empty select */
//         if(Object.keys(mainSelect).length < 1) mainSelect = "";

//         /* Select star already selects all fields */
//         if(Object.keys(select).includes("*")) {
//             if(Object.keys(select).find(key => key !== "*" && [true, false, 1, 0].includes(select[key]))) throw "\nCannot use all ('*') together with other fields ";
//             mainSelect = "*";
//         }
//     }
    
//     let q = await this.prepareValidatedQuery(filter, { ...selectParams, select: mainSelect }, param3_unused, tableRules, localParams, aggAliases);
//     const ambiguousAggName = q.select.find(s => aggAliases.includes(s));
    
//     if(ambiguousAggName) throw `Cannot have select columns collide with aggregation alias for: ` + ambiguousAggName;
//     q.joins = joinQueries;
//     q.aggs = _Aggs;
//     q.joinAlias = alias;
//     return q;
// }
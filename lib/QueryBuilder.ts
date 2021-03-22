
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pgp, Filter, LocalParams, isPlainObject, TableHandler, ViewHandler, TS_PG_Types } from "./DboBuilder";
import { TableRule, flat } from "./Prostgles";
import { SelectParams, isEmpty, FieldFilter, asName } from "prostgles-types";
import { get } from "./utils";

export type SelectItem = {
  type: "column" | "function" | "aggregation" | "joinedColumn" | "computed";
  getFields: () => string[];
  getQuery: (tableAlias?: string) => string;
  columnDataType?: string;
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
  having: string;
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

  /**
   * If true then the first argument is expected to be a column name
   */
  singleColArg: boolean;
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
export const FUNCTIONS: FunctionSpec[] = [

  // Hashing
  {
    name: "$md5_multi",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("md5(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )" ).join(" || ") + ")");
      return q
    }
  },
  {
    name: "$md5_multi_agg",
    type: "aggregation",
    singleColArg: false,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("md5(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )" ).join(" || ") + ", ','))");
      return q
    }
  },

  {
    name: "$sha256_multi",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha256((" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha256_multi_agg",
    type: "aggregation",
    singleColArg: false,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha256(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ',')::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha512_multi",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha512((" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha512_multi_agg",
    type: "aggregation",
    singleColArg: false,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha512(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ',')::text::bytea), 'hex')");
      return q
    }
  },


  /* Full text search */
  {
    name: "$ts_headline",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      let qVal = args[1], qType = "to_tsquery";
      const searchTypes = ["websearch_to_tsquery", "to_tsquery"];
      if(isPlainObject(args[1])){
        const keys = Object.keys(args[1]);
        qType = keys[0];
        if(keys.length !==1 || !searchTypes.includes(qType)) throw "Expecting a an object with a single key named one of: " + searchTypes.join(", ");
        qVal = args[1][qType]
      } else {
        qVal = pgp.as.format(qType + "($1)", [qVal])
      }
      const res = pgp.as.format("ts_headline(" + asName(args[0]) + "::text, $1:raw)", [qVal]);
      return res
    }
  },



  {
    name: "$ST_AsGeoJSON",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("ST_AsGeoJSON(" + asName(args[0]) + ")::json");
    }
  },
  {
    name: "$left",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("LEFT(" + asName(args[0]) + ", $1)", [args[1]]);
    }
  },

  {
    name: "$to_char",
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      if(args.length === 3){
        return pgp.as.format("to_char(" + asName(args[0]) + ", $2, $3)", [args[0], args[1], args[2]]);
      }
      return pgp.as.format("to_char(" + asName(args[0]) + ", $2)", [args[0], args[1]]);
    }
  },

  /* Date funcs date_part */
  ...["date_trunc", "date_part"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    singleColArg: false,
    getFields: (args: any[]) => [args[1]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(funcName + "($1, " + asName(args[1]) + ")", [args[0], args[1]]);
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
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("trim(to_char(" + asName(args[0]) + ", $2))", [args[0], txt]);
    }
  } as FunctionSpec)),

  /* Basic 1 arg col funcs */
  ...["upper", "lower", "length", "reverse", "trim", "initcap", "round", "ceil", "floor", "sign", "age"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return funcName + "(" + asName(args[0]) + ")";
    }
  } as FunctionSpec)),

  /* Aggs */
  ...["max", "min", "count", "avg", "json_agg", "string_agg", "array_agg", "sum"].map(aggName => ({
    name: "$" + aggName,
    type: "aggregation",
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return aggName + "(" + asName(args[0]) + ")";
    }
  } as FunctionSpec)),

  /* More aggs */
  {
    name: "$countAll",
    type: "aggregation",
    singleColArg: false,
    getFields: (args: any[]) => [],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return "COUNT(*)";
    }
  } as FunctionSpec,
  
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

export class SelectItemBuilder {

  select: SelectItem[] = [];
  private allFields: string[];

  private allowedFields: string[];
  private computedFields: FieldSpec[];
  private functions: FunctionSpec[];
  private allowedFieldsIncludingComputed: string[];
  private isView: boolean;

  constructor(params: { allowedFields: string[]; computedFields: FieldSpec[]; functions: FunctionSpec[]; allFields: string[]; isView: boolean }){
    this.allFields = params.allFields;
    this.allowedFields = params.allowedFields;
    this.computedFields = params.computedFields;
    this.isView = params.isView;
    this.functions = params.functions;
    this.allowedFieldsIncludingComputed = this.allowedFields.concat(this.computedFields? this.computedFields.map(cf => cf.name) : []);
    if(!this.allowedFields.length){
      throw "allowedFields empty/missing";
    }

    /* Check for conflicting computed column names */
    const conflictingCol = this.allFields.find(fieldName => this.computedFields.find(cf => cf.name === fieldName));
    if(conflictingCol){
      throw "INTERNAL ERROR: Cannot have duplicate column names ( " + conflictingCol + " ). One or more computed column names are colliding with table columns ones";
    }
  }

  private checkField = (f: string) => {
    if(!this.allowedFieldsIncludingComputed.includes(f)) throw "Field " + f + " is invalid or dissallowed";
    return f;
  }

  private addItem = (item: SelectItem) => {
    item.getFields().map(this.checkField);
    if(this.select.find(s => s.alias === item.alias)) throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
    this.select.push(item);
  }

  private addFunctionByName = (funcName: string, args: any[], alias: string) => {
    const funcDef = this.functions.find(f => f.name === funcName);
    if(!funcDef) throw "Function " + funcName + " does not exist or is not allowed ";
    this.addFunction(funcDef, args, alias);
  }

  private addFunction = (funcDef: FunctionSpec, args: any[], alias: string) => {
    this.addItem({
      type: funcDef.type,
      alias,
      getFields: () => funcDef.getFields(args),
      getQuery: (tableAlias?: string) => funcDef.getQuery({ allowedFields: this.allowedFields, args, tableAlias, ctidField: this.isView? undefined : "ctid" }),
      selected: true
    });
  }

  addColumn = (fieldName: string, selected: boolean) => {
  
    /* Check if computed col */
    if(selected){
      const compCol = COMPUTED_FIELDS.find(cf => cf.name === fieldName);
      if(compCol && !this.select.find(s => s.alias === fieldName)){
        const cf: FunctionSpec = { 
          ...compCol,
          type: "computed",
          singleColArg: false,
          getFields: (args: any[]) => [] 
        }
        this.addFunction(cf, [], compCol.name)
        return;
      }
    }

    let alias = selected? fieldName : ("not_selected_" + fieldName);
    this.addItem({
      type: "column",
      alias,
      getQuery: () => asName(fieldName),
      getFields: () => [fieldName],
      selected
    });
  }

  parseUserSelect = async (userSelect: FieldFilter, joinParse?: (key: string, val: any, throwErr: (msg: string) => any) => any) => {

    /* Array select */
    if(Array.isArray(userSelect)){
      if(userSelect.find(key => typeof key !== "string")) throw "Invalid array select. Expecting an array of strings";
  
      userSelect.map(key => this.addColumn(key, true))
  
    /* Empty select */
    } else if(userSelect === ""){
      // select.push({
      //   type: "function",
      //   alias: "",
      //   getFields: () => [],
      //   getQuery: () => ""
      // })
      return [];
    } else if(userSelect === "*"){
      this.allowedFields.map(key => this.addColumn(key, true) );
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
        this.allowedFields.filter(f => !selectKeys.includes(f)).map(key => this.addColumn(key, true) )
          
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
              this.allowedFields.map(key => this.addColumn(key, true) )
            } else {
              this.addColumn(key, true);
            }
  
          /* Aggs and functions */
          } else if(typeof val === "string" || isPlainObject(val)) {
  
            /* Function 
                { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
            */  
            if(
              (typeof val === "string" && val !== "*") ||
              isPlainObject(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0]) // !isPlainObject(Object.values(val)[0])
            ){
              // if(!Array.isArray(Object.values(val)[0])){
              //   throw `Could not parse selected item: ${JSON.stringify(val)}\nFunction arguments must be in an array`;
              // }

              let funcName, args;
              if(typeof val === "string") {
                /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
                try {
                  this.checkField(key)
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
              
              this.addFunctionByName(funcName, args, key);
  
            /* Join */
            } else {

              if(!joinParse) throw "Joins dissalowed";
              await joinParse(key, val, throwErr);
              
            }
  
          } else throwErr();
  
        }));
      }
    } else throw "Unexpected select -> " + JSON.stringify(userSelect);
  
  }

}

export async function getNewQuery(
  _this: TableHandler,
  filter: Filter, 
  selectParams?: SelectParams & { alias?: string }, 
  param3_unused = null, 
  tableRules?: TableRule, 
  localParams?: LocalParams
): Promise<NewQuery> {

  if(get(localParams, "socket") && !get(tableRules, "select.fields")){
    throw `INTERNAL ERROR: publish.${_this.name}.select.fields rule missing`;
  }

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

  // let select: SelectItem[] = [],
  let  joinQueries: NewQuery[] = [];

    // const all_colnames = _this.column_names.slice(0).concat(COMPUTED_FIELDS.map(c => c.name));

  selectParams = selectParams || {};
  const { select: userSelect = "*" } = selectParams,
    // allCols = _this.column_names.slice(0),
    // allFieldsIncludingComputed = allCols.concat(COMPUTED_FIELDS.map(c => c.name)),
    allowedFields = _this.parseFieldFilter(get(tableRules, "select.fields")) || _this.column_names.slice(0),
    // allowedFieldsIncludingComputed = _this.parseFieldFilter(get(tableRules, "select.fields"), true, allFieldsIncludingComputed) || allFieldsIncludingComputed,
    sBuilder = new SelectItemBuilder({ allowedFields, computedFields: COMPUTED_FIELDS, isView: _this.is_view, functions: FUNCTIONS, allFields: _this.column_names.slice(0) });


  //   /* Array select */
  // if(Array.isArray(userSelect)){
  //   if(userSelect.find(key => typeof key !== "string")) throw "Invalid array select. Expecting an array of strings";

  //   userSelect.map(key => sBuilder.addColumn(key, true))

  // /* Empty select */
  // } else if(userSelect === ""){
  //   // select.push({
  //   //   type: "function",
  //   //   alias: "",
  //   //   getFields: () => [],
  //   //   getQuery: () => ""
  //   // })
  //   console.log("Finish empty select")
  // } else if(userSelect === "*"){
  //   allowedFields.map(key => sBuilder.addColumn(key, true) );
  // } else if(isPlainObject(userSelect) && !isEmpty(userSelect as object)){
  //   const selectKeys = Object.keys(userSelect),
  //     selectValues = Object.values(userSelect);

  //   /* Cannot include and exclude at the same time */
  //   if(
  //     selectValues.filter(v => [0, false].includes(v)).length 
  //   ){
  //     if(selectValues.filter(v => ![0, false].includes(v)).length ){
  //       throw "\nCannot include and exclude fields at the same time";
  //     }

  //     /* Exclude only */
  //     allowedFields.filter(f => !selectKeys.includes(f)).map(key => sBuilder.addColumn(key, true) )
        
  //   } else {
  //     await Promise.all(selectKeys.map(async key => {
  //       const val = userSelect[key],
  //         throwErr = (extraErr: string = "") => {
  //           console.trace(extraErr)
  //           throw "Unexpected select -> " + JSON.stringify({ [key]: val }) + "\n" + extraErr;
  //         };
      
  //       /* Included fields */
  //       if([1, true].includes(val)){
  //         if(key === "*"){
  //           allowedFields.map(key => sBuilder.addColumn(key, true) )
  //         } else {
  //           sBuilder.addColumn(key, true);
  //         }

  //       /* Aggs and functions */
  //       } else if(typeof val === "string" || isPlainObject(val)) {

  //         /* Function 
  //             { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
  //         */  
  //         if(
  //           (typeof val === "string" && val !== "*") ||
  //           isPlainObject(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0])
  //         ){
  //           let funcName, args;
  //           if(typeof val === "string") {
  //             /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
  //             try {
  //               sBuilder.checkField(key)
  //             } catch (err){
  //               throwErr(`Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. Use correct column name or full function notation, e.g.: -> { key: { $func_name: ["column_name"] } } `)
  //             }
  //             funcName = val;
  //             args = [key];
  //           } else {
  //             const callKeys = Object.keys(val);
  //             if(callKeys.length !== 1 || !Array.isArray(val[callKeys[0]])) throw "\nIssue with select. \nUnexpected function definition. \nExpecting { field_name: func_name } OR { result_key: { func_name: [arg1, arg2 ...] } } \nBut got -> " + JSON.stringify({ [key]: val });
  //             funcName = callKeys[0];
  //             args = val[callKeys[0]];
  //           }
            
  //           sBuilder.addFunctionByName(funcName, args, key);

  //         /* Join */
  //         } else {
  //           // console.log({ key, val })
  //           let j_filter: Filter = {},
  //               j_selectParams: SelectParams = {},
  //               j_path: string[],
  //               j_alias: string,
  //               j_tableRules: TableRule,
  //               j_table: string,
  //               j_isLeftJoin: boolean = true;

  //           if(val === "*"){
  //             j_selectParams.select = "*";
  //             j_alias = key;
  //             j_table = key;
  //           } else {

  //             /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
  //             const JOIN_KEYS = ["$innerJoin", "$leftJoin"];
  //             const JOIN_PARAMS = ["select", "filter", "$path", "offset", "limit", "orderBy"];
  //             const joinKeys = Object.keys(val).filter(k => JOIN_KEYS.includes(k));
  //             if(joinKeys.length > 1) {
  //               throwErr("\nCannot specify more than one join type ( $innerJoin OR $leftJoin )");
  //             } else if(joinKeys.length === 1) {
  //               const invalidParams = Object.keys(val).filter(k => ![ ...JOIN_PARAMS, ...JOIN_KEYS ].includes(k));
  //               if(invalidParams.length) throw "Invalid join params: " + invalidParams.join(", ");
  
  //               j_isLeftJoin = joinKeys[0] === "$leftJoin";
  //               j_table = val[joinKeys[0]];
  //               j_alias = key;
  //               if(typeof j_table !== "string") throw "\nIssue with select. \nJoin type must be a string table name but got -> " + JSON.stringify({ [key]: val });
                
  //               j_selectParams.select = val.select || "*";
  //               j_filter = val.filter || {};
  //               j_selectParams.limit = val.limit;
  //               j_selectParams.offset = val.offset;
  //               j_selectParams.orderBy = val.orderBy;
  //               j_path = val.$path;
  //             } else {
  //               j_selectParams.select = val;
  //               j_alias = key;
  //               j_table = key;
  //             }
  //           }

  //           const _thisJoinedTable: any = _this.dboBuilder.dbo[j_table];
  //           if(!_thisJoinedTable) throw `Joined table ${j_table} is disallowed or inexistent`;

  //           let isLocal = true;
  //           if(localParams && localParams.socket){
  //             isLocal = false;
  //             j_tableRules = await _this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: j_table, command: "find", socket: localParams.socket });
  //           }
            
  //           if(isLocal || j_tableRules){

  //             const joinQuery: NewQuery = await getNewQuery(
  //                 _thisJoinedTable,
  //                 j_filter, 
  //                 { ...j_selectParams, alias: j_alias }, 
  //                 param3_unused, 
  //                 j_tableRules, 
  //                 localParams
  //               );
  //             joinQuery.isLeftJoin = j_isLeftJoin;
  //             joinQuery.tableAlias = j_alias;
  //             joinQuery.$path = j_path;
  //             joinQueries.push(joinQuery);
  //             // console.log(joinQuery)
  //           }
  //         }

  //       } else throwErr();

  //     }));
  //   }
  // } else throw "Unexpected select -> " + JSON.stringify(userSelect);

  await sBuilder.parseUserSelect(userSelect, async (key, val, throwErr) => {

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
    if(!_thisJoinedTable) {
      throw `Joined table ${JSON.stringify(j_table)} is disallowed or inexistent \nOr you've forgot to put the function arguments into an array`;
    }

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
  })

  /* Add non selected columns */
  /* WHY???? */
  allowedFields.map(key => {
    if(!sBuilder.select.find(s => s.alias === key && s.type === "column")){
      sBuilder.addColumn(key, false);
    }
  });

  let select: SelectItem[] = sBuilder.select;
  // const validatedAggAliases = select
  //   .filter(s => s.type !== "joinedColumn")
  //   .map(s => s.alias);
    
  const where = await _this.prepareWhere({
    filter, 
    select, 
    forcedFilter: get(tableRules, "select.forcedFilter"), 
    filterFields: get(tableRules, "select.filterFields"), 
    tableAlias: selectParams.alias, 
    localParams,
    tableRule: tableRules
  });

  let resQuery: NewQuery = {
    allFields: allowedFields,
    select,
    table: _this.name,
    joins: joinQueries,
    where,
    // having: cond.having,
    limit: _this.prepareLimitQuery(selectParams.limit, get(tableRules, "select.maxLimit")),
    orderBy: [_this.prepareSort(selectParams.orderBy, allowedFields, selectParams.alias, null, select)],
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
      let 
        // select = q.select.filter(s => joinFields.includes(s.alias) || s.selected).map(s => {
        //   if(s.type === "aggregation"){
        //     /* Rename aggs to avoid collision with join cols */
        //     return s.getQuery(!depth? undefined : `agg_${s.alias}`) + " AS " + asName(s.alias);
        //   }
        //   return s.getQuery() + " AS " + asName(s.alias);
        // }),
        groupBy = "";
      // console.log(select, q);

      /* If aggs exist need to set groupBy add joinFields into select */
      if(aggs.length){
          // const missingFields = joinFields.filter(jf => !q.select.find(s => s.type === "column" && s.alias === jf));
          // if(depth && missingFields.length){
          //     // select = Array.from(new Set(missingFields.concat(select)));
          // }

          if(nonAggs.length){
            let groupByFields = nonAggs.filter(sf => !depth || joinFields.includes(sf.getQuery()));
            if(groupByFields.length){
              groupBy = `GROUP BY ${groupByFields.map(sf => sf.type === "function"? sf.getQuery() :  asName(sf.alias)).join(", ")}\n`;
            }
          }
      }
      // console.log(q.select, joinFields)
      let fres = indJ(depth, [
          `-- 0. or 5. [leaf query] `
          
          /* Group by selected fields + any join fields */
      ,   `SELECT ` + q.select.filter(s => joinFields.includes(s.getQuery()) || s.selected).map(s => {
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
      ,   q.having? `HAVING ${q.having}` : ""
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
  ,   q.having? `HAVING ${q.having} ` : ""
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

export class FilterBuilder {
  constructor(){
    
  }
}

type TSDataType = keyof typeof TS_PG_Types;
export type FilterSpec = {
  operands: string[];
  tsDataTypes: TSDataType[];
  tsDefinition: string;
  // data_types: string[];
  getQuery: (leftQuery: string, rightVal: any) => string;
}




/**
 * Example: col_name: { $gt: 2 }
 * @alias CompareFilter
 */
export type CompareFilter<T = Date | number | string | boolean> =
  /**
   * column value equals provided value
   */
  | T 
  | { "=": T } | { "$eq": T }
  | { "<>": T } | { "$ne": T }
  | { ">": T } | { "$gt": T }
  | { ">=": T } | { "$gte": T }
  | { "<=": T } | { "$lte": T }

  | { "$in": T[] }
  | { "$nin": T[] }
  | { "$between": [T, T] }
;
const CompareFilterKeys = ["=", "$eq","<>",">",">=","<=","$eq","$ne","$gt","$gte","$lte"];
const CompareInFilterKeys = ["$in", "$nin"]

export type FTSFilter = 
  | { "to_tsquery": string[] }
  | { "plainto_tsquery": string[] }
  | { "phraseto_tsquery": string[] }
  | { "websearch_to_tsquery": string[] }
;
const TextFilter_FTSFilterKeys = ["to_tsquery","plainto_tsquery","phraseto_tsquery","websearch_to_tsquery"];

export type TextFilter = 
  | CompareFilter<string>
  | { "$ilike": string }
  | { "$like": string }

  | { "@@": FTSFilter }
  | { "@>": FTSFilter } |  { "$contains": FTSFilter } 
  | { "<@": FTSFilter } |  { "$containedBy": FTSFilter } 
;
const TextFilterFTSKeys = ["@@", "@>", "<@", "$contains", "$containedBy"];

export type ArrayFilter<T = (number | boolean | string)[]> = 
  | CompareFilter<T>
  | { "@>": T } |  { "$contains": T } 
  | { "<@": T } |  { "$containedBy": T } 
  | { "&&": T } |  { "$overlaps": T }
;

/* POSTGIS */

/**
 * Makes bounding box from NW and SE points
 * float xmin, float ymin, float xmax, float ymax, integer srid=unknown
 * https://postgis.net/docs/ST_MakeEnvelope.html
 */
type GeoBBox = { ST_MakeEnvelope: number[] }


/**
 * Returns TRUE if A's 2D bounding box intersects B's 2D bounding box.
 * https://postgis.net/docs/reference.html#Operators
 */
export type GeomFilter = 
  /**
   * A's 2D bounding box intersects B's 2D bounding box.
   */
  | { "&&": GeoBBox }
  | { "&&&": GeoBBox }
  | { "&<": GeoBBox }
  | { "&<|": GeoBBox }
  | { "&>": GeoBBox }
  | { "<<": GeoBBox }
  | { "<<|": GeoBBox }
  | { "=": GeoBBox }
  | { ">>": GeoBBox }

  /**
   * A's bounding box is contained by B's
   */
  | { "@": GeoBBox }
  | { "|&>": GeoBBox }
  | { "|>>": GeoBBox }

  /**
   * A's bounding box contains B's.
   */
  | { "~": GeoBBox }
  | { "~=": GeoBBox }
;
const GeomFilterKeys = ["~","~=","@","|&>","|>>", ">>", "=", "<<|", "<<", "&>", "&<|", "&<", "&&&", "&&"]
const GeomFilter_Funcs = ["ST_MakeEnvelope", "ST_MakeEnvelope".toLowerCase()]

type AllowedTSTypes = string | number | boolean | Date | any[];
type AnyObject = { [key: string]: AllowedTSTypes };
type FilterDataType<T = any> = 
  T extends string ? TextFilter
: T extends number ? CompareFilter<T>
: T extends boolean ? CompareFilter<T>
: T extends Date ? CompareFilter<T>
: T extends any[] ? ArrayFilter<T>
: (CompareFilter<T> & ArrayFilter<T> & TextFilter & GeomFilter)
;

export type FilterForObject<T = AnyObject> = {
  [K in keyof Partial<T>]: FilterDataType<T[K]>
}

export type TableFilter<T = AnyObject> = 
  | FilterForObject<T> 
  | { $and: (FilterForObject<T>  | TableFilter)[] } 
  | { $or: (FilterForObject<T>  | TableFilter)[] } 
  | { $not: FilterForObject<T>  }
;


export const EXISTS_KEYS = ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"] as const;
export type EXISTS_KEY = typeof EXISTS_KEYS[number];
export type ExsFilter = Partial<{ [key in EXISTS_KEY]: number }>

export type ExistsFilter<Obj = AnyObject> = {
  $exists: TableFilter<Obj>
}

export type FinalFilter = TableFilter | ExistsFilter

// const f: FinalFilter<{ a: Date }> = {
//   // hehe: { "@>": ['', 2] }
//   a: { $eq: new Date() }
// }


// const cc: FilterForObject<{
//   hehe: string;
//   num: number;
// }> = {
//   // hehe: { $ilike: 'daw' }
//   num: { $gt: 2 }
// };




/**
 * Parse a single filter
 * Ensure only single key objects reach this point
 */
type ParseFilterArgs = {  filter: ExistsFilter | FilterForObject, select?: SelectItem[], tableAlias?: string, pgp: any };
export const pParseFilter = (args: ParseFilterArgs): string => {
  const { filter: _f, select, tableAlias, pgp } = args;

  if(!_f || isEmpty(_f)) return "";


  const mErr = (msg: string) => {
      throw `${msg}: ${JSON.stringify(_f, null, 2)}`
    }, 
    asValue = (v) => pgp.as.format("$1", [v]);

  const fKeys = Object.keys(_f)
  if(fKeys.length === 0){
    return "";
  } else if(fKeys.length > 1){
    return fKeys.map(fk => pParseFilter({
      filter: { [fk]: _f[fk] },
      select, 
      tableAlias,
      pgp
    }))
    .sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
    .join(" AND ")
  }

  const fKey = fKeys[0];

  /* Exists filter */
  if(EXISTS_KEYS.find(k => k in _f)){
    // parseExistsFilter()
  }

  let selItem;
  if(select) selItem = select.find(s => fKey === s.alias);
  let rightF: FilterDataType = _f[fKey];

  const getLeftQ = (selItm: SelectItem) => {
    if(selItm.type === "function") return selItem.getQuery();
    return asName(selItem.alias)
  }

  /**
   * Parsed left side of the query
   */
  let leftQ: string;// = asName(selItem.alias);

  /* Check if string notation. Build obj if necessary */
  if(!selItem){
    // let leftKey: string = fKey;
    if(select){
      selItem = select.find(s => fKey.startsWith(s.alias)  );
    }
    if(!selItem) mErr("Bad filter. Could not match to a column or alias: ");

    const remainingStr = fKey.slice(selItem.alias.length);

    /* Is json path spec */
    if(remainingStr.startsWith("->")){
      leftQ = getLeftQ(selItem);
      
      /**
       * get json path separators. Expecting -> to come first
       */
      type GetSepRes = { idx: number; sep: string } | undefined
      const getSep = (fromIdx = 0): GetSepRes => {
        const strPart = remainingStr.slice(fromIdx)
        let idx = strPart.indexOf("->");
        let idxx = strPart.indexOf("->>");
        if(idx > -1) {
          /* if -> matches then check if it's the last separator */
          if(idx === idxx) return { idx: idx + fromIdx, sep: "->>" }
          return { idx: idx + fromIdx, sep: "->" }
        }
        idx = strPart.indexOf("->>");
        if(idx > -1) {
          return { idx: idx + fromIdx, sep: "->>" }
        }

        return undefined;
      }


      let currSep = getSep();
      while(currSep){
        let nextSep = getSep(currSep.idx + currSep.sep.length);

        let nextIdx = nextSep? nextSep.idx : remainingStr.length;

        /* If ending in set then add set as well into key */
        if(nextSep && nextIdx + nextSep.sep.length === remainingStr.length) {
          nextIdx = remainingStr.length;
          nextSep =  undefined;
        }

        // console.log({ currSep, nextSep })
        leftQ += currSep.sep + asValue(remainingStr.slice(currSep.idx + currSep.sep.length, nextIdx));
        currSep = nextSep;
      }

    /* Is collapsed filter spec  e.g. { "col.$ilike": 'text' } */
    } else if(remainingStr.startsWith(".")){
      leftQ = getLeftQ(selItem);

      let getSep = (fromIdx = 0) => {
        const idx = remainingStr.slice(fromIdx).indexOf(".");
        if(idx > -1) return fromIdx + idx;
        return idx; 
      }
      let currIdx = getSep();
      let res: any = {};
      let curObj = res;
      while(currIdx > -1){
        let nextIdx = getSep(currIdx + 1);
        let nIdx = nextIdx > -1? nextIdx : remainingStr.length;

        /* If ending in dot then add dot as well into key */
        if(nextIdx + 1 === remainingStr.length) {
          nIdx = remainingStr.length;
          nextIdx = -1;
        }

        const key = remainingStr.slice(currIdx + 1, nIdx);
        curObj[key] = nextIdx > -1? {} : _f[fKey];
        curObj = curObj[key];

        currIdx = nextIdx;
      }
      
      rightF = res;
    } else {
      mErr("Bad filter. Could not find the valid col name or alias or col json path")
    }

  } else {
    leftQ = getLeftQ(selItem);
  }

  if(!leftQ) mErr("Internal error: leftQ missing?!");

  /* Matching sel item */
  if(isPlainObject(rightF)){
    const parseRightVal = (val, expect: "csv" | "array" | null = null) => {
      if(expect === "csv"){
        return pgp.as.format("($1:csv)", [val]);

      } else if(expect === "array" || selItem && selItem.columnDataType && selItem.columnDataType === "ARRAY"){
        if(!Array.isArray(val)) return mErr("This type of filter/column expects an Array of items");
        return pgp.as.format(" ARRAY[$1:csv]", [val]);

      }

      return asValue(val);
    }

    const filterKeys = Object.keys(rightF);
    if(filterKeys.length !== 1) mErr("Bad filter. Expecting one key only");

    const fOpType = filterKeys[0];
    const fVal = rightF[fOpType];
    let sOpType: string;
    let sVal: any;

    if(fVal && isPlainObject(fVal)){
      const keys = Object.keys(fVal);
      if(!keys.length || keys.length !== 1){
        return mErr("Bad filter. Expecting a nested object with one key only ");
      }
      sOpType = keys[0];
      sVal = fVal[sOpType];

    }
    // console.log({ fOpType, fVal, sOpType })

    if(GeomFilterKeys.includes(fOpType) && sOpType && GeomFilter_Funcs.includes(sOpType)){
      return leftQ + ` ${fOpType} ` + `${sOpType}${parseRightVal(sVal, "csv")}`;

    } else if(["=", "$eq"].includes(fOpType) && !sOpType){
      if(fVal === null) return leftQ + " IS NULL ";
      return leftQ + " > " + parseRightVal(fVal);

    } else if(["<>", "$ne"].includes(fOpType)){
      return leftQ + " <> " + parseRightVal(fVal);

    } else if([">", "$gt"].includes(fOpType)){
      return leftQ + " > " + parseRightVal(fVal);

    } else if(["<", "$lt"].includes(fOpType)){
      return leftQ + " < " + parseRightVal(fVal);

    } else if([">=", "$gte"].includes(fOpType)){
      return leftQ + " >=  " + parseRightVal(fVal);

    } else if(["<=", "$lte"].includes(fOpType)){
      return leftQ + " <= " + parseRightVal(fVal);

    } else if(["$in"].includes(fOpType)){
      return leftQ + " IN " + parseRightVal(fVal, "csv");

    } else if(["$nin"].includes(fOpType)){
      return leftQ + " NOT IN " + parseRightVal(fVal, "csv");
      
    } else if(["$between"].includes(fOpType)){
      if(!Array.isArray(fVal) || fVal.length !== 2){
        return mErr("Between filter expects an array of two values");
      }
      return leftQ + " BETWEEN " + asValue(fVal[0]) + " AND " + asValue(fVal[1]);

    } else if(["$ilike"].includes(fOpType)){
      return leftQ + " ILIKE " + asValue(fVal);

    } else if(["$like"].includes(fOpType)){
      return leftQ + " LIKE " + asValue(fVal);

    /* MAYBE TEXT OR MAYBE ARRAY */
    } else if(["@>", "<@", "$contains", "$containedBy", "&&", "@@"].includes(fOpType)){
      let operand = fOpType === "@@"? "@@": 
          ["@>", "$contains"].includes(fOpType)? "@>" : 
          ["&&"].includes(fOpType)? "&&" : 
          "<@";

      /* Array for sure */
      if(Array.isArray(fVal)){
        return leftQ + operand + parseRightVal(fVal, "array");
          
      /* FTSQuery */
      } else if(["@@"].includes(fOpType) && TextFilter_FTSFilterKeys.includes(sOpType)) {
        let lq = `to_tsvector(${leftQ}::text)`;
        if(selItem && selItem.columnDataType === "tsvector") lq = leftQ;

        let res = `${lq} ${operand} ` + `${sOpType}${parseRightVal(sVal, "csv")}`;

        return res;
      } else {
        return mErr("Unrecognised filter operand: " + fOpType + " ");
      }

    } else {
      return mErr("Unrecognised filter operand: " + fOpType + " ");
    }


  } else {

    /* Is an equal filter */
    if(rightF === null){
      return leftQ + " IS NULL ";
    } else {
      return leftQ + " = " + asValue(rightF);
    }
  }
}


// ensure pgp is not NULL!!!
// const asValue = v => v;// pgp.as.value;

// const filters: FilterSpec[] = [
//   ...(["ilike", "like"].map(op => ({ 
//     operands: ["$" + op],
//     tsDataTypes: ["any"] as TSDataType[],
//     tsDefinition: ` { $${op}: string } `,
//     // data_types: 
//     getQuery: (leftQuery: string, rightVal: any) => {
//       return `${leftQuery}::text ${op.toUpperCase()} ${asValue(rightVal)}::text` 
//     }
//   }))),
//   { 
//     operands: ["", "="],
//     tsDataTypes: ["any"],
//     tsDefinition: ` { "=": any } | any `,
//     // data_types: 
//     getQuery: (leftQuery: string, rightVal: any) => {
//       if(rightVal === null) return`${leftQuery} IS NULL `;
//       return `${leftQuery} = ${asValue(rightVal)}`;
//     }
//   }
// ];
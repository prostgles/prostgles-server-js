
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pgp, Filter, LocalParams, isPlainObject, TableHandler, ViewHandler } from "./DboBuilder";
import { TableRule, flat } from "./Prostgles";
import { SelectParamsBasic as SelectParams, isEmpty, FieldFilter, asName, TextFilter_FullTextSearchFilterKeys, TS_PG_Types, ColumnInfo } from "prostgles-types";
import { get } from "./utils";


export type SelectItem = {
  type: "column" | "function" | "aggregation" | "joinedColumn" | "computed";
  getFields: () => string[] | "*";
  getQuery: (tableAlias?: string) => string;
  columnPGDataType?: string;
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

  description?: string;

  /**
   * If true then the first argument is expected to be a column name
   */
  singleColArg: boolean;

  /**
   * If true then this func can be used within where clause
   */
  // returnsBoolean?: boolean;

  numArgs: number;
  type: "function" | "aggregation" | "computed";
  /**
   * getFields: string[] -> used to validate user supplied field names. It will be fired before querying to validate allowed columns
   *      if not field names are used from arguments then return an empty array
   */
  getFields: (allowedFields: string[]) => "*" | string[];
  /**
   * allowedFields passed for multicol functions (e.g.: $rowhash)
   */
  getQuery: (params: { allowedFields: string[], args: any[], tableAlias?: string, ctidField?: string }) => string;
};

const MAX_COL_NUM = 1600;
const asValue = (v: any, castAs: string = "") => pgp.as.format("$1" + castAs, [v])
/**
* Each function expects a column at the very least
*/
export const FUNCTIONS: FunctionSpec[] = [

  // Hashing
  {
    name: "$md5_multi",
    description: ` :[...column_names] -> md5 hash of the column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("md5(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )" ).join(" || ") + ")");
      return q
    }
  },
  {
    name: "$md5_multi_agg",
    description: ` :[...column_names] -> md5 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("md5(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )" ).join(" || ") + ", ','))");
      return q
    }
  },

  {
    name: "$sha256_multi",
    description: ` :[...column_names] -> sha256 hash of the of column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha256((" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha256_multi_agg",
    description: ` :[...column_names] -> sha256 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha256(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ',')::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha512_multi",
    description: ` :[...column_names] -> sha512 hash of the of column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha512((" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ")::text::bytea), 'hex')");
      return q
    }
  },
  {
    name: "$sha512_multi_agg",
    description: ` :[...column_names] -> sha512 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const q = pgp.as.format("encode(sha512(string_agg(" + args.map(fname => "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )" ).join(" || ") + ", ',')::text::bytea), 'hex')");
      return q
    }
  },


  /* Full text search 
    https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-SIMPLE-DICTIONARY
  */
  ...[
    "simple", //  • convert the input token to lower case • exclude stop words
    // "synonym", // replace word with a synonym
    "english",
    // "english_stem",
    // "english_hunspell", 
    ""
  ].map(type => ({
    name: "$ts_headline" + (type? ("_" + type) : ""),
    description: ` :[column_name <string>, search_term: <string | { to_tsquery: string } > ] -> sha512 hash of the of column content`,
    type: "function" as "function",
    singleColArg: true,
    numArgs: 2,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const col = asName(args[0]);
      let qVal = args[1], qType = "to_tsquery";
      let _type = type? (asValue(type) + ",") : "";

      const searchTypes = TextFilter_FullTextSearchFilterKeys;
      
      /* { to_tsquery: 'search term' } */
      if(isPlainObject(qVal)){
        const keys = Object.keys(qVal);
        if(!keys.length) throw "Bad arg";
        if(keys.length !==1 || !searchTypes.includes(keys[0])) throw "Expecting a an object with a single key named one of: " + searchTypes.join(", ");
        qType = keys[0];
        qVal = asValue(qVal[qType]);

      /* 'search term' */
      } else if(typeof qVal === "string") {
        qVal = pgp.as.format(qType + "($1)", [qVal])
      } else throw "Bad second arg. Exepcting search string or { to_tsquery: 'search string' }";

      const res =`ts_headline(${_type} ${col}::text, ${qVal}, 'ShortWord=1 ' )`
      // console.log(res)
      
      return res
    }
  })),

  ...[
      {
        fname: "ST_DWithin",
        description: `:[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean; distance: number; }] 
          -> Returns true if the geometries are within a given distance
          For geometry: The distance is specified in units defined by the spatial reference system of the geometries. For this function to make sense, the source geometries must be in the same coordinate system (have the same SRID).
          For geography: units are in meters and distance measurement defaults to use_spheroid=true. For faster evaluation use use_spheroid=false to measure on the sphere.
        `
      },
      {
        fname: "<->",
        description: `:[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }] 
          -> The <-> operator returns the 2D distance between two geometries. Used in the "ORDER BY" clause provides index-assisted nearest-neighbor result sets. For PostgreSQL below 9.5 only gives centroid distance of bounding boxes and for PostgreSQL 9.5+, does true KNN distance search giving true distance between geometries, and distance sphere for geographies.`
      },
      { 
        fname: "ST_Distance",
        description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }] 
          -> For geometry types returns the minimum 2D Cartesian (planar) distance between two geometries, in projected units (spatial ref units).
          -> For geography types defaults to return the minimum geodesic distance between two geographies in meters, compute on the spheroid determined by the SRID. If use_spheroid is false, a faster spherical calculation is used.
        `,
      },{ 
        fname: "ST_Distance_Sphere",
        description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number }] -> Returns linear distance in meters between two lon/lat points. Uses a spherical earth and radius of 6370986 meters. Faster than ST_Distance_Spheroid, but less accurate. Only implemented for points.`,
      }
    ].map(({ fname, description }) => ({
      name: "$" + fname,
      description,
      type: "function" as "function",
      singleColArg: true,
      numArgs: 1,
      getFields: (args: any[]) => [args[0]],
      getQuery: ({ allowedFields, args, tableAlias }) => {
        const arg2 = args[1],
          mErr = () => { throw `${fname}: Expecting a second argument like: { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }` };
        
        if(!isPlainObject(arg2)) mErr();
  
        const { lat, lng, srid = 4326, geojson, text, use_spheroid, distance } = arg2;
        let geomQ, useSphQ, distanceQ;
        if(fname === "ST_DWithin"){
          if(typeof distance !== "number") throw `ST_DWithin: distance param missing or not a number`;
          distanceQ = ", " + asValue(distance)
        }
        if(typeof use_spheroid === "boolean" && ["ST_DWithin", "ST_Distance"].includes(fname)){
          useSphQ = ", " + asValue(use_spheroid);
        }

        if(typeof text === "string"){
          geomQ = `ST_GeomFromText(${asValue(text)})`;
        } else if([lat, lng].every(v => Number.isFinite(v))){
          geomQ = `ST_Point(${asValue(lat)}, ${asValue(lng)})`;
        } else if(isPlainObject(geojson)){
          geomQ = `ST_GeomFromGeoJSON(${geojson})`;
        } else mErr();
  
        if(Number.isFinite(srid)){
          geomQ = `ST_SetSRID(${geomQ}, ${asValue(srid)})`;
        }

        if(fname === "<->"){
          return pgp.as.format(`${asNameAlias(args[0], tableAlias)} <-> ${geomQ}`);
        }
        return pgp.as.format(`${fname}(${asNameAlias(args[0], tableAlias)} , ${geomQ} ${distanceQ} ${useSphQ})`);
      }
    })),

    ...["ST_AsGeoJSON", "ST_AsText"]
    .map(fname => {
      const res: FunctionSpec = {
        name: "$" + fname,
        description: ` :[column_name] -> json GeoJSON output of a geometry column`,
        type: "function",
        singleColArg: true,
        numArgs: 1,
        getFields: (args: any[]) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
          return pgp.as.format(fname + "(" + asNameAlias(args[0], tableAlias) + ( fname === "ST_AsGeoJSON"? ")::json" : ""));
        }
      }
      return res;
    }),

  {
    name: "$left",
    description: ` :[column_name, number] -> substring`,
    type: "function",
    numArgs: 2,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("LEFT(" + asNameAlias(args[0], tableAlias) + ", $1)", [args[1]]);
    }
  },
  {
    name: "$right",
    description: ` :[column_name, number] -> substring`,
    type: "function",
    numArgs: 2,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("RIGHT(" + asNameAlias(args[0], tableAlias) + ", $1)", [args[1]]);
    }
  },

  {
    name: "$to_char",
    type: "function",
    description: ` :[column_name, format<string>] -> format dates and strings. Eg: [current_timestamp, 'HH12:MI:SS']`,
    singleColArg: false,
    numArgs: 2,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      if(args.length === 3){
        return pgp.as.format("to_char(" + asNameAlias(args[0], tableAlias) + ", $2, $3)", [args[0], args[1], args[2]]);
      }
      return pgp.as.format("to_char(" + asNameAlias(args[0], tableAlias) + ", $2)", [args[0], args[1]]);
    }
  },

  /**
   * Date trunc utils
   */
  ...[
    "microseconds",
    "milliseconds",
    "second",
    "minute",
    "hour",
    "day",
    "week",
    "month",
    "quarter",
    "year",
    "decade",
    "century",
    "millennium"
  ].map(k => ({ val: 0, unit: k  }))
  .concat([
    { val: 6, unit: 'month'  },
    { val: 4, unit: 'month'  },
    { val: 2, unit: 'month'  },
    { val: 8, unit: 'hour'  },
    { val: 4, unit: 'hour'  },
    { val: 2, unit: 'hour'  },
    { val: 30, unit: 'minute'  },
    { val: 15, unit: 'minute'  },
    { val: 6, unit: 'minute'  },
    { val: 5, unit: 'minute'  },
    { val: 4, unit: 'minute'  },
    { val: 3, unit: 'minute'  },
    { val: 2, unit: 'minute'  },
    { val: 30, unit: 'second'  },
    { val: 15, unit: 'second'  },
    { val: 10, unit: 'second'  },
    { val: 8, unit: 'second'  },
    { val: 6, unit: 'second'  },
    { val: 5, unit: 'second'  },
    { val: 4, unit: 'second'  },
    { val: 3, unit: 'second'  },
    { val: 2, unit: 'second'  },
  ]).map(({ val, unit }) => ({
    name: "$date_trunc_" + (val || "") + unit,
    type: "function",
    description: ` :[column_name] -> round down timestamp to closest ${val || ""} ${unit} `,
    singleColArg: true,
    numArgs: 1,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const col = asNameAlias(args[0], tableAlias);
      if(!val) return `date_trunc(${asValue(unit)}, ${col})`;
      const prevInt = {
        month: "year",
        hour: "day",
        minute: "hour",
        second: "minute" 
      };

      let res = `(date_trunc(${asValue(prevInt[unit] || "hour")}, ${col}) + date_part(${asValue(unit, "::text")}, ${col})::int / ${val} * interval ${asValue(val + " " + unit)})`;
      // console.log(res);
      return res;
    }
  } as FunctionSpec)),

  /* Date funcs date_part */
  ...["date_trunc", "date_part"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    numArgs: 2,
    description: ` :[unit<string>, column_name] -> ` + (funcName === "date_trunc"? ` round down timestamp to closest unit value. ` : ` extract date unit as float8. ` ) + ` E.g. ['hour', col] `,
    singleColArg: false,
    getFields: (args: any[]) => [args[1]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return `${funcName}(${asValue(args[0])}, ${asNameAlias(args[1], tableAlias)})`;
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
    description: ` :[column_name] -> get timestamp formated as ` + txt,
    singleColArg: true,
    numArgs: 1,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format("trim(to_char(" + asNameAlias(args[0], tableAlias) + ", $2))", [args[0], txt]);
    }
  } as FunctionSpec)),

  /* Basic 1 arg col funcs */
  ...["upper", "lower", "length", "reverse", "trim", "initcap", "round", "ceil", "floor", "sign", "age", "md5"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return funcName + "(" + asNameAlias(args[0], tableAlias) + ")";
    }
  } as FunctionSpec)),


  /* Text col and value funcs */
  ...["position", "position_lower"].map(funcName => ({
    name: "$" + funcName,
    type: "function",
    numArgs: 1,
    singleColArg: false,
    getFields: (args: any[]) => [args[1]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      let a1 = asValue(args[0]),
        a2 = asNameAlias(args[1], tableAlias);
      if(funcName === "position_lower"){
        a1 = `LOWER(${a1}::text)`;
        a2 = `LOWER(${a2}::text)`;
      }
      return `position( ${a1} IN ${a2} )`;
    }
  } as FunctionSpec)),

  /** Custom highlight -> myterm => ['some text and', ['myterm'], ' and some other text']
   * (fields: "*" | string[], term: string, { edgeTruncate: number = -1; noFields: boolean = false }) => string | (string | [string])[]  
   * edgeTruncate = maximum extra characters left and right of matches
   * noFields = exclude field names in search
   * */ 
  {
    name: "$term_highlight", /* */
    description: ` :[column_names<string[] | "*">, search_term<string>, opts?<{ edgeTruncate?: number; noFields?: boolean }>] -> get case-insensitive text match highlight`,
    type: "function",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => args[0],
    getQuery: ({ allowedFields, args, tableAlias }) => {

      const cols = ViewHandler._parseFieldFilter(args[0], false, allowedFields);
      let term = args[1];
      let { edgeTruncate = -1, noFields = false, returnIndex = false, matchCase = false } = args[2] || {};
      if(!isEmpty(args[2])){
        const keys = Object.keys(args[2]);
        const validKeys = ["edgeTruncate", "noFields", "returnIndex", "matchCase"];
        const bad_keys = keys.filter(k => !validKeys.includes(k));
        if(bad_keys.length) throw "Invalid options provided for $term_highlight. Expecting one of: " + validKeys.join(", ");
      }
      if(!cols.length) throw "Cols are empty/invalid";
      if(typeof term !== "string") throw "No string term provided";
      if(typeof edgeTruncate !== "number") throw "Invalid edgeTruncate. expecting number";
      if(typeof noFields !== "boolean") throw "Invalid noFields. expecting boolean";

      let colRaw = "( " + cols.map(c =>`${noFields? "" : (asValue(c + ": ") + " || ")} COALESCE(${asNameAlias(c, tableAlias)}::TEXT, '')`).join(" || ', ' || ") + " )";
      let col = colRaw;
      term = asValue(term);
      if(!matchCase) {
        col = "LOWER" + col;
        term = `LOWER(${term})`
      }

      let leftStr = `substr(${colRaw}, 1, position(${term} IN ${col}) - 1 )`,
        rightStr = `substr(${colRaw}, position(${term} IN ${col}) + length(${term}) )`;
      if(edgeTruncate > -1){
        leftStr = `RIGHT(${leftStr}, ${asValue(edgeTruncate)})`;
        rightStr = `LEFT(${rightStr}, ${asValue(edgeTruncate)})`
      }
      
      // console.log(col);
      let res = ""
      if(returnIndex){ 
        res = `CASE WHEN position(${term} IN ${col}) > 0 THEN position(${term} IN ${col}) - 1 ELSE -1 END`;

      } else {
        /* If no match or empty search THEN return full row as string within first array element  */
        res = `CASE WHEN position(${term} IN ${col}) > 0 AND ${term} <> '' THEN array_to_json(ARRAY[
          to_json( ${leftStr}::TEXT ), 
          array_to_json(
            ARRAY[substr(${colRaw}, position(${term} IN ${col}), length(${term}) )::TEXT ]
          ),
          to_json(${rightStr}::TEXT ) 
        ]) ELSE array_to_json(ARRAY[(${colRaw})::TEXT]) END`;

      }

      return res;
    } 
  },

  /* Aggs */
  ...["max", "min", "count", "avg", "json_agg", "jsonb_agg", "string_agg", "array_agg", "sum"].map(aggName => ({
    name: "$" + aggName,
    type: "aggregation",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return aggName + "(" + asNameAlias(args[0], tableAlias) + ")";
    }
  } as FunctionSpec)),

  /* More aggs */
  {
    name: "$countAll",
    type: "aggregation",
    description: `agg :[]  COUNT of all rows `,
    singleColArg: false,
    numArgs: 0,
    getFields: (args: any[]) => [],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return "COUNT(*)";
    }
  } as FunctionSpec,
  {
    name: "$diff_perc",
    type: "aggregation",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const col = asNameAlias(args[0], tableAlias);
      return `round( ( ( MAX(${col}) - MIN(${col}) )::float/MIN(${col}) ) * 100, 2)`
    }
  } as FunctionSpec
];

/* The difference between a function and computed field is that the computed field does not require any arguments */
export const COMPUTED_FIELDS: FieldSpec[] = [

  /**
   * Used instead of row id. Must be used as a last resort. Use all non pseudo or domain data type columns first!
   */
  {
    name: "$rowhash",
    type: "computed",
    // description: ` order hash of row content  `,
    getQuery: ({ allowedFields, tableAlias, ctidField }) => {
      return "md5(" +
        allowedFields

          /* CTID not available in AFTER trigger */
          // .concat(ctidField? [ctidField] : [])
          .sort()
          .map(f => asNameAlias(f, tableAlias))
          .map(f => `md5(coalesce(${f}::text, 'dd'))`)
          .join(" || ") + 
      `)`;
    }
  }
  // ,{
  //   name: "ctid",
  //   type: "computed",
  //   // description: ` order hash of row content  `,
  //   getQuery: ({ allowedFields, tableAlias, ctidField }) => {
  //     return asNameAlias("ctid", tableAlias);
  //   }
  // }
];

export class SelectItemBuilder {

  select: SelectItem[] = [];
  private allFields: string[];

  private allowedFields: string[];
  private computedFields: FieldSpec[];
  private functions: FunctionSpec[];
  private allowedFieldsIncludingComputed: string[];
  private isView: boolean;
  private columns: ColumnInfo[];

  constructor(params: { allowedFields: string[]; computedFields: FieldSpec[]; functions: FunctionSpec[]; allFields: string[]; isView: boolean; columns: ColumnInfo[]; }){
    this.allFields = params.allFields;
    this.allowedFields = params.allowedFields;
    this.computedFields = params.computedFields;
    this.isView = params.isView;
    this.functions = params.functions;
    this.columns = params.columns;
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
    if(!this.allowedFieldsIncludingComputed.includes(f)){ 
      console.log(f, f === "name", this.allowedFieldsIncludingComputed.includes("name"), this.allowedFieldsIncludingComputed)
      throw "Field " + f + " is invalid or dissallowed";
    }
    return f;
  }

  private addItem = (item: SelectItem) => {
    let fields = item.getFields();
    // console.trace(fields)
    if(fields === "*") fields = this.allowedFields.slice(0);//.concat(fields.filter(f => f !== "*"));
    fields.map(this.checkField);

    if(this.select.find(s => s.alias === item.alias)) throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
    this.select.push(item);
  }

  private addFunctionByName = (funcName: string, args: any[], alias: string) => {
    const funcDef = this.functions.find(f => f.name === funcName);
    if(!funcDef) {
      const sf = this.functions.filter(f => f.name.toLowerCase().slice(1).startsWith(funcName.toLowerCase())).sort((a, b) => (a.name.length - b.name.length));
      const hint = (sf.length? `. \n Maybe you meant: \n | ${sf.map(s => s.name + " " + (s.description || "")).join("    \n | ")}  ?` : "");
      throw "\n Function " + funcName + " does not exist or is not allowed " + hint;
    }
    this.addFunction(funcDef, args, alias);
  }

  private addFunction = (funcDef: FunctionSpec, args: any[], alias: string) => {
    if(funcDef.numArgs) {
      const fields = funcDef.getFields(args);//  && (! || !funcDef.getFields(args) !== "*" !funcDef.getFields(args).filter(f => f).length
      if(fields !== "*" && Array.isArray(fields) && !fields.length ){
        console.log(fields)
        throw `\n Function "${funcDef.name}" is missing a field name argument`;
      }
    }
    this.addItem({
      type: funcDef.type,
      alias,
      getFields: () => funcDef.getFields(args),
      getQuery: (tableAlias?: string) => funcDef.getQuery({ allowedFields: this.allowedFields, args, tableAlias, 
        ctidField: undefined,

        /* CTID not available in AFTER trigger */
        // ctidField: this.isView? undefined : "ctid" 
      }),
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
          numArgs: 0,
          singleColArg: false,
          getFields: (args: any[]) => [] 
        }
        this.addFunction(cf, [], compCol.name)
        return;
      }
    }

    const colDef = this.columns.find(c => c.name === fieldName);
    let alias = selected? fieldName : ("not_selected_" + fieldName);
    this.addItem({
      type: "column",
      columnPGDataType: colDef?.data_type,
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
  
            /* Function shorthand notation
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
                  throwErr(` Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. \n Use correct column name or full aliased function notation, e.g.: -> { alias: { $func_name: ["column_name"] } } `)
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
  selectParams: SelectParams & { alias?: string }, 
  param3_unused = null, 
  tableRules: TableRule, 
  localParams: LocalParams,
  columns: ColumnInfo[],
): Promise<NewQuery> {

  if((localParams?.socket || localParams?.httpReq) && !get(tableRules, "select.fields")){
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
    sBuilder = new SelectItemBuilder({ allowedFields, computedFields: COMPUTED_FIELDS, isView: _this.is_view, functions: FUNCTIONS, allFields: _this.column_names.slice(0), columns });

  
 
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
    if(localParams && (localParams.socket || localParams.httpReq)){
      isLocal = false;
      j_tableRules = await _this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: j_table, command: "find", localParams });
    }
    
    if(isLocal || j_tableRules){

      const joinQuery: NewQuery = await getNewQuery(
          _thisJoinedTable,
          j_filter, 
          { ...j_selectParams, alias: j_alias }, 
          param3_unused, 
          j_tableRules, 
          localParams,
          columns
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
  const p = _this.getValidatedRules(tableRules, localParams);

  let resQuery: NewQuery = {
    allFields: allowedFields,
    select,
    table: _this.name,
    joins: joinQueries,
    where,
    // having: cond.having,
    limit: _this.prepareLimitQuery(selectParams.limit, p),
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
  joinFields: string[] = [],
  selectParams: SelectParams,
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
    const joinInfo = _this.getJoins(q1.table, q2.table, q2.$path, true);
    const paths = joinInfo.paths;

    return flat(paths.map(({ table, on }, i) => {
      const getColName = (col: string, q: NewQuery) => {
        if(table === q.table){
          const colFromSelect = q.select.find(s => s.getQuery() === asName(col));
          if(!colFromSelect){
            console.error(`${col} column might be missing in user publish `);
            throw `Could not find join column (${col}) in allowe select. Some join tables and columns might be invalid/dissallowed`
          }
          return colFromSelect.alias;
        }

        return col;
      }
      const getPrevColName = (col: string) => {
        return getColName(col, q1);
      }
      const getThisColName = (col: string) => {
        return getColName(col, q2);
      }

      // console.log(JSON.stringify({i, table, on, q1, q2}, null, 2));

      const prevTable = i === 0? q1.table : (paths[i - 1].table);
      const thisAlias = makePrefANON(q2.tableAlias, table);
      // const prevAlias = i === 0? makePrefAN(q1) : thisAlias;
      const prevAlias =  i === 0? makePrefAN(q1) : makePrefANON(q2.tableAlias, prevTable)
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
              return asName(s.alias);
            }).concat(q2.joins.map(j => asName(j.table))).join(", ");

          const _iiQ = makeQuery(
            _this, 
            q2, 
            depth + 1, 
            on.map(([c1, c2]) => asName(c2)),
            selectParams,
          );
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
      if(aggs.length || selectParams?.groupBy){
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

  if(joins && joins.length && (aggs.length || selectParams.groupBy)) throw "Joins within Aggs dissallowed";

  // if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
  
  let rootGroupBy: string;
  if((selectParams.groupBy || aggs.length || q.joins && q.joins.length) && nonAggs.length){
    // console.log({ aggs, nonAggs, joins: q.joins })
    rootGroupBy = `GROUP BY ${
      (depth? 
        q.allFields.map(f => asName(f)) : 
        nonAggs.map(s => s.type === "function"? s.getQuery() : asName(s.alias))
      ).concat(
        (aggs && aggs.length)? 
          [] : 
          [`ctid`]
        ).filter(s => s).join(", ")} `
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
                  .map(field => `${makePrefAN(q)}.${asName(field)}  `)
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

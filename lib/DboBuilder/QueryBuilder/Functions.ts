import {
  asName,
  ColumnInfo,
  isEmpty,
  isObject,
  PG_COLUMN_UDT_DATA_TYPE,
  TextFilter_FullTextSearchFilterKeys,
} from "prostgles-types";
import { isPlainObject, pgp, postgresToTsType } from "../DboBuilder";
import { parseFieldFilter } from "../ViewHandler/parseFieldFilter";
import { asNameAlias } from "./QueryBuilder";

export const parseFunction = (funcData: {
  func: string | FunctionSpec;
  args: any[];
  functions: FunctionSpec[];
  allowedFields: string[];
}): FunctionSpec => {
  const { func, args, functions, allowedFields } = funcData;

  /* Function is computed column. No checks needed */
  if (typeof func !== "string") {
    const computedCol = COMPUTED_FIELDS.find((c) => c.name === func.name);
    if (!computedCol)
      throw `Unexpected function: computed column spec not found for ${JSON.stringify(func.name)}`;
    return func;
  }

  const funcName = func;
  const makeErr = (msg: string): string => {
    return `Issue with function ${JSON.stringify({ [funcName]: args })}: \n${msg}`;
  };

  /* Find function */
  const funcDef = functions.find((f) => f.name === funcName);

  if (!funcDef) {
    const sf = functions
      .filter((f) =>
        f.name.toLowerCase().slice(1).startsWith(funcName.toLowerCase()),
      )
      .sort((a, b) => a.name.length - b.name.length);
    const hint = sf.length
      ? `. \n Maybe you meant: \n | ${sf.map((s) => s.name + " " + (s.description || "")).join("    \n | ")}  ?`
      : "";
    throw (
      "\n Function " + funcName + " does not exist or is not allowed " + hint
    );
  }

  /* Validate fields */
  const fields = funcDef.getFields(args);
  if (fields !== "*") {
    fields.forEach((fieldKey) => {
      if (typeof fieldKey !== "string" || !allowedFields.includes(fieldKey)) {
        throw makeErr(
          `getFields() => field name ${JSON.stringify(fieldKey)} is invalid or disallowed`,
        );
      }
    });
    if ((funcDef.minCols ?? 0) > fields.length) {
      throw makeErr(
        `Less columns provided than necessary (minCols=${funcDef.minCols})`,
      );
    }
  }

  if (
    funcDef.numArgs &&
    funcDef.minCols !== 0 &&
    fields !== "*" &&
    Array.isArray(fields) &&
    !fields.length
  ) {
    throw `\n Function "${funcDef.name}" expects at least a field name but has not been provided with one`;
  }

  return funcDef;
};

type GetQueryArgs = {
  allColumns: ColumnInfo[];
  allowedFields: string[];
  args: any[];
  tableAlias?: string;
  ctidField?: string;
};

export type FieldSpec = {
  name: string;
  type: "column" | "computed";
  /**
   * allowedFields passed for multicol functions (e.g.: $rowhash)
   */
  getQuery: (params: Omit<GetQueryArgs, "args">) => string;
};

export type FunctionSpec = {
  name: string;

  description?: string;

  /**
   * If true then it can be used in filters and is expected to return boolean
   */
  canBeUsedForFilter?: boolean;

  /**
   * If true then the first argument is expected to be a column name
   */
  singleColArg: boolean;

  /**
   * If true then this func can be used within where clause
   */
  // returnsBoolean?: boolean;

  /**
   * Number of arguments expected
   */
  numArgs: number;

  /**
   * If provided then the number of column names provided to the function (from getFields()) must not be less than this
   * By default every function is checked against numArgs
   */
  minCols?: number;

  type: "function" | "aggregation" | "computed";
  /**
   * getFields: string[] -> used to validate user supplied field names. It will be fired before querying to validate against allowed columns
   *      if not field names are used from arguments then return an empty array
   */
  getFields: (args: any[]) => "*" | string[];
  /**
   * allowedFields passed for multicol functions (e.g.: $rowhash)
   */
  getQuery: (params: GetQueryArgs) => string;

  returnType?: PG_COLUMN_UDT_DATA_TYPE;
};

const MAX_COL_NUM = 1600;
const asValue = (v: any, castAs = "") => pgp.as.format("$1" + castAs, [v]);

const parseUnix = (
  colName: string,
  tableAlias: string | undefined,
  allColumns: ColumnInfo[],
  opts: { timeZone: boolean | string } | undefined,
) => {
  let tz = "";
  if (opts) {
    const { timeZone } = opts ?? {};
    if (
      timeZone &&
      typeof timeZone !== "string" &&
      typeof timeZone !== "boolean"
    ) {
      throw `Bad timeZone value. timeZone can be boolean or string`;
    }
    if (timeZone === true) {
      tz = "::TIMESTAMPTZ";
    } else if (typeof timeZone === "string") {
      tz = ` AT TIME ZONE ${asValue(timeZone)}`;
    }
  }
  const col = allColumns.find((c) => c.name === colName);
  if (!col) throw `Unexpected: column ${colName} not found`;
  const escapedName = asNameAlias(colName, tableAlias);
  if (col.udt_name === "int8") {
    return `to_timestamp(${escapedName}/1000.0)${tz}`;
  }

  return `${escapedName}${tz}`;
};

const JSON_Funcs: FunctionSpec[] = [
  {
    name: "$jsonb_set",
    description:
      "[columnName: string, path: (string | number)[], new_value?: any, create_missing?: boolean ]   	Returns target value (columnName) with the section designated by path replaced by new_value, or with new_value added if create_missing is true (default is true) and the item designated by path does not exist",
    singleColArg: false,
    numArgs: 4,
    type: "function",
    getFields: ([column]) => column,
    getQuery: ({
      args: [colName, path = [], new_value, create_missing = true],
      tableAlias,
      allowedFields,
    }) => {
      if (!allowedFields.includes(colName)) {
        throw `Unexpected: column ${colName} not found`;
      }
      if (
        !path ||
        !Array.isArray(path) ||
        !path.every((v) => ["number", "string"].includes(typeof v))
      ) {
        throw "Expecting: [columnName: string, path: (string | number)[], new_value?: any, create_missing?: boolean ]";
      }
      const escapedName = asNameAlias(colName, tableAlias);

      return `jsonb_set(${escapedName}, ${asValue(path)}, ${asValue(new_value)}, ${create_missing})`;
    },
  },

  {
    name: "$jsonb_path_query",
    description:
      "[columnName: string, jsonPath: string, vars?: object, silent?: boolean]\n  Returns all JSON items returned by the JSON path for the specified JSON value. The optional vars and silent arguments act the same as for jsonb_path_exists.",
    singleColArg: false,
    numArgs: 4,
    type: "function",
    getFields: ([column]) => column,
    getQuery: ({
      args: [colName, jsonPath, ...otherArgs],
      tableAlias,
      allowedFields,
    }) => {
      if (!allowedFields.includes(colName)) {
        throw `Unexpected: column ${colName} not found`;
      }
      if (!jsonPath || typeof jsonPath !== "string") {
        throw "Expecting: [columnName: string, jsonPath: string, vars?: object, silent?: boolean]";
      }
      const escapedName = asNameAlias(colName, tableAlias);

      return `jsonb_path_query(${escapedName}, ${[jsonPath, ...otherArgs].map((v) => asValue(v)).join(", ")})`;
    },
  },

  ...(
    [
      [
        "jsonb_array_length",
        "Returns the number of elements in the outermost JSON array",
      ],
      [
        "jsonb_each",
        "Expands the outermost JSON object into a set of key/value pairs",
      ],
      [
        "jsonb_each_text",
        "Expands the outermost JSON object into a set of key/value pairs. The returned values will be of type text",
      ],
      ["jsonb_object_keys", "Returns set of keys in the outermost JSON object"],
      [
        "jsonb_strip_nulls",
        "Returns from_json with all object fields that have null values omitted. Other null values are untouched",
      ],
      ["jsonb_pretty", "Returns from_json as indented JSON text "],
      ["jsonb_to_record", "Builds an arbitrary record from a JSON object"],
      ["jsonb_array_elements", "Expands a JSON array to a set of JSON values"],
      [
        "jsonb_array_elements_text",
        "Expands a JSON array to a set of text values ",
      ],
      [
        "jsonb_typeof",
        "Returns the type of the outermost JSON value as a text string. Possible types are object, array, string, number, boolean, and null ",
      ],
    ] as const
  ).map(
    ([name, description]) =>
      ({
        name: "$" + name,
        description,
        singleColArg: true,
        numArgs: 1,
        type: "function",
        getFields: ([col]) => col,
        getQuery: ({ args: [colName], tableAlias }) => {
          const escapedName = asNameAlias(colName, tableAlias);
          return `${name}(${escapedName})`;
        },
      }) as FunctionSpec,
  ),
];

const FTS_Funcs: FunctionSpec[] =
  /* Full text search 
    https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-SIMPLE-DICTIONARY
  */
  [
    "simple", //  • convert the input token to lower case • exclude stop words
    // "synonym", // replace word with a synonym
    "english",
    // "english_stem",
    // "english_hunspell",
    "",
  ].map((type) => ({
    name: "$ts_headline" + (type ? "_" + type : ""),
    description: ` :[column_name <string>, search_term: <string | { to_tsquery: string } > ] -> sha512 hash of the of column content`,
    type: "function" as const,
    singleColArg: true,
    numArgs: 2,
    getFields: ([column]) => [column],
    getQuery: ({ args }) => {
      const col = asName(args[0]);
      let qVal = args[1],
        qType = "to_tsquery";
      const _type = type ? asValue(type) + "," : "";

      const searchTypes = TextFilter_FullTextSearchFilterKeys;

      /* { to_tsquery: 'search term' } */
      if (isPlainObject(qVal)) {
        const keys = Object.keys(qVal);
        if (!keys.length) throw "Bad arg";
        if (keys.length !== 1 || !searchTypes.includes(keys[0] as any))
          throw (
            "Expecting a an object with a single key named one of: " +
            searchTypes.join(", ")
          );
        qType = keys[0]!;
        qVal = asValue(qVal[qType]);

        /* 'search term' */
      } else if (typeof qVal === "string") {
        qVal = pgp.as.format(qType + "($1)", [qVal]);
      } else
        throw "Bad second arg. Exepcting search string or { to_tsquery: 'search string' }";

      const res = `ts_headline(${_type} ${col}::text, ${qVal}, 'ShortWord=1 ' )`;
      // console.log(res)

      return res;
    },
  }));

let PostGIS_Funcs: FunctionSpec[] = (
  [
    {
      fname: "ST_DWithin",
      description: `:[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean; distance: number; }] 
        -> Returns true if the geometries are within a given distance
        For geometry: The distance is specified in units defined by the spatial reference system of the geometries. For this function to make sense, the source geometries must be in the same coordinate system (have the same SRID).
        For geography: units are in meters and distance measurement defaults to use_spheroid=true. For faster evaluation use use_spheroid=false to measure on the sphere.
      `,
    },
    {
      fname: "<->",
      description: `:[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }] 
        -> The <-> operator returns the 2D distance between two geometries. Used in the "ORDER BY" clause provides index-assisted nearest-neighbor result sets. For PostgreSQL below 9.5 only gives centroid distance of bounding boxes and for PostgreSQL 9.5+, does true KNN distance search giving true distance between geometries, and distance sphere for geographies.`,
    },
    {
      fname: "ST_Distance",
      description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }] 
        -> For geometry types returns the minimum 2D Cartesian (planar) distance between two geometries, in projected units (spatial ref units).
        -> For geography types defaults to return the minimum geodesic distance between two geographies in meters, compute on the spheroid determined by the SRID. If use_spheroid is false, a faster spherical calculation is used.
      `,
    },
    {
      fname: "ST_DistanceSpheroid",
      description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; spheroid?: string; }] -> Returns minimum distance in meters between two lon/lat geometries given a particular spheroid. See the explanation of spheroids given for ST_LengthSpheroid.

      `,
    },
    {
      fname: "ST_DistanceSphere",
      description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number }] -> Returns linear distance in meters between two lon/lat points. Uses a spherical earth and radius of 6370986 meters. Faster than ST_DistanceSpheroid, but less accurate. Only implemented for points.`,
    },
  ] as const
).map(({ fname, description }) => ({
  name: "$" + fname,
  description,
  type: "function" as const,
  singleColArg: true,
  numArgs: 1,
  canBeUsedForFilter: fname === "ST_DWithin",
  getFields: (args: any[]) => [args[0]],
  getQuery: ({ allColumns, args: [columnName, arg2], tableAlias }) => {
    const mErr = () => {
      throw `${fname}: Expecting a second argument like: { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }`;
    };

    if (!isObject(arg2)) {
      mErr();
    }
    const col = allColumns.find((c) => c.name === columnName);
    if (!col) {
      throw new Error("Col not found: " + columnName);
    }

    const {
      lat,
      lng,
      srid = 4326,
      geojson,
      text,
      use_spheroid,
      distance,
      spheroid = 'SPHEROID["WGS 84", 6378137, 298.257223563]',
      unit,
      debug,
    } = arg2;
    let geomQ = "",
      extraParams = "";

    if (typeof text === "string") {
      geomQ = `ST_GeomFromText(${asValue(text)})`;
    } else if ([lat, lng].every((v) => Number.isFinite(v))) {
      geomQ = `ST_Point(${asValue(lng)}, ${asValue(lat)})`;
    } else if (isPlainObject(geojson)) {
      geomQ = `ST_GeomFromGeoJSON(${geojson})`;
    } else mErr();

    if (Number.isFinite(srid)) {
      geomQ = `ST_SetSRID(${geomQ}, ${asValue(srid)})`;
    }

    let colCast = "";
    const colIsGeog = col.udt_name === "geography";
    let geomQCast = colIsGeog ? "::geography" : "::geometry";

    /**
     * float ST_Distance(geometry g1, geometry g2);
     * float ST_Distance(geography geog1, geography geog2, boolean use_spheroid=true);
     */
    if (fname === "ST_Distance") {
      if (typeof use_spheroid === "boolean") {
        extraParams = ", " + asValue(use_spheroid);
      }

      colCast = colIsGeog || use_spheroid ? "::geography" : "::geometry";
      geomQCast = colIsGeog || use_spheroid ? "::geography" : "::geometry";

      /**
       * boolean ST_DWithin(geometry g1, geometry g2, double precision distance_of_srid);
       * boolean ST_DWithin(geography gg1, geography gg2, double precision distance_meters, boolean use_spheroid = true);
       */
    } else if (fname === "ST_DWithin") {
      colCast = colIsGeog ? "::geography" : "::geometry";
      geomQCast = colIsGeog ? "::geography" : "::geometry";

      if (typeof distance !== "number") {
        throw `ST_DWithin: distance param missing or not a number`;
      }
      const allowedUnits = ["m", "km"];
      if (unit && !allowedUnits.includes(unit)) {
        throw `ST_DWithin: unit can only be one of: ${allowedUnits}`;
      }
      extraParams = ", " + asValue(distance * (unit === "km" ? 1000 : 1));

      /**
       * float ST_DistanceSpheroid(geometry geomlonlatA, geometry geomlonlatB, spheroid measurement_spheroid);
       */
    } else if (fname === "ST_DistanceSpheroid") {
      colCast = "::geometry";
      geomQCast = "::geometry";
      if (typeof spheroid !== "string")
        throw `ST_DistanceSpheroid: spheroid param must be string`;
      extraParams = `, ${asValue(spheroid)}`;

      /**
       * float ST_DistanceSphere(geometry geomlonlatA, geometry geomlonlatB);
       */
    } else if (fname === "ST_DistanceSphere") {
      colCast = "::geometry";
      geomQCast = "::geometry";
      extraParams = "";

      /**
       * double precision <->( geometry A , geometry B );
       * double precision <->( geography A , geography B );
       */
    } else if (fname === "<->") {
      colCast = colIsGeog ? "::geography" : "::geometry";
      geomQCast = colIsGeog ? "::geography" : "::geometry";
      const q = pgp.as.format(
        `${asNameAlias(columnName, tableAlias)}${colCast} <-> ${geomQ}${geomQCast}`,
      );
      if (debug) throw q;
      return q;
    }

    const query = pgp.as.format(
      `${fname}(${asNameAlias(columnName, tableAlias)}${colCast} , ${geomQ}${geomQCast} ${extraParams})`,
    );
    if (debug) {
      throw query;
    }
    return query;
  },
}));

PostGIS_Funcs = PostGIS_Funcs.concat(
  [
    "ST_AsText",
    "ST_AsEWKT",
    "ST_AsEWKB",
    "ST_AsBinary",
    "ST_AsMVT",
    "ST_AsMVTGeom",
    "ST_AsGeoJSON",
    "ST_Simplify",
    "ST_SnapToGrid",
    "ST_Centroid",
    "st_aslatlontext",
  ].map((fname) => {
    const res: FunctionSpec = {
      name: "$" + fname,
      description: ` :[column_name, precision?] -> json GeoJSON output of a geometry column`,
      type: "function",
      singleColArg: true,
      numArgs: 1,
      getFields: (args: any[]) => [args[0]],
      getQuery: ({ args: [colName, ...otherArgs], tableAlias }) => {
        let secondArg = "";
        if (otherArgs.length)
          secondArg = ", " + otherArgs.map((arg) => asValue(arg)).join(", ");
        const escTabelName = asNameAlias(colName, tableAlias) + "::geometry";
        const result = pgp.as.format(
          fname +
            "(" +
            escTabelName +
            secondArg +
            (fname === "ST_AsGeoJSON" ? ")::jsonb" : ")"),
        );
        if (["ST_Centroid", "ST_SnapToGrid", "ST_Simplify"].includes(fname)) {
          const r = `ST_AsGeoJSON(${result})::jsonb`;
          return r;
        }
        return result;
      },
    };
    return res;
  }),
);

PostGIS_Funcs = PostGIS_Funcs.concat(
  [
    "ST_Extent",
    "ST_3DExtent",
    "ST_XMin_Agg",
    "ST_XMax_Agg",
    "ST_YMin_Agg",
    "ST_YMax_Agg",
    "ST_ZMin_Agg",
    "ST_ZMax_Agg",
  ].map((fname) => {
    const res: FunctionSpec = {
      name: "$" + fname,
      description: ` :[column_name] -> ST_Extent returns a bounding box that encloses a set of geometries. 
          The ST_Extent function is an "aggregate" function in the terminology of SQL. 
          That means that it operates on lists of data, in the same way the SUM() and AVG() functions do.`,
      type: "aggregation",
      singleColArg: true,
      numArgs: 1,
      getFields: (args: any[]) => [args[0]],
      getQuery: ({ args, tableAlias }) => {
        const escTabelName = asNameAlias(args[0], tableAlias) + "::geometry";
        if (fname.includes("Extent")) {
          return `${fname}(${escTabelName})`;
        }
        return `${fname.endsWith("_Agg") ? fname.slice(0, -4) : fname}(ST_Collect(${escTabelName}))`;
      },
    };
    return res;
  }),
);

PostGIS_Funcs = PostGIS_Funcs.concat(
  ["ST_Length", "ST_X", "ST_Y", "ST_Z"].map((fname) => ({
    name: "$" + fname,
    type: "function",
    singleColArg: true,
    numArgs: 1,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allColumns, args, tableAlias }) => {
      const colName = args[0];
      const escapedColName = asNameAlias(colName, tableAlias);
      const col = allColumns.find((c) => c.name === colName);
      if (!col) throw new Error("Col not found: " + colName);

      return `${fname}(${escapedColName})`;
    },
  })),
);

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
    getQuery: ({ args, tableAlias }) => {
      const q = pgp.as.format(
        "md5(" +
          args
            .map(
              (fname) =>
                "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )",
            )
            .join(" || ") +
          ")",
      );
      return q;
    },
  },
  {
    name: "$md5_multi_agg",
    description: ` :[...column_names] -> md5 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAlias }) => {
      const q = pgp.as.format(
        "md5(string_agg(" +
          args
            .map(
              (fname) =>
                "COALESCE( " + asNameAlias(fname, tableAlias) + "::text, '' )",
            )
            .join(" || ") +
          ", ','))",
      );
      return q;
    },
  },

  {
    name: "$sha256_multi",
    description: ` :[...column_names] -> sha256 hash of the of column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha256((" +
          args
            .map(
              (fname) =>
                "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )",
            )
            .join(" || ") +
          ")::text::bytea), 'hex')",
      );
      return q;
    },
  },
  {
    name: "$sha256_multi_agg",
    description: ` :[...column_names] -> sha256 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha256(string_agg(" +
          args
            .map(
              (fname) =>
                "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )",
            )
            .join(" || ") +
          ", ',')::text::bytea), 'hex')",
      );
      return q;
    },
  },
  {
    name: "$sha512_multi",
    description: ` :[...column_names] -> sha512 hash of the of column content`,
    type: "function",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha512((" +
          args
            .map(
              (fname) =>
                "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )",
            )
            .join(" || ") +
          ")::text::bytea), 'hex')",
      );
      return q;
    },
  },
  {
    name: "$sha512_multi_agg",
    description: ` :[...column_names] -> sha512 hash of the string aggregation of column content`,
    type: "aggregation",
    singleColArg: false,
    numArgs: MAX_COL_NUM,
    getFields: (args: any[]) => args,
    getQuery: ({ args, tableAlias }) => {
      const q = pgp.as.format(
        "encode(sha512(string_agg(" +
          args
            .map(
              (fname) =>
                "COALESCE( " + asNameAlias(fname, tableAlias) + ", '' )",
            )
            .join(" || ") +
          ", ',')::text::bytea), 'hex')",
      );
      return q;
    },
  },

  ...FTS_Funcs,

  ...JSON_Funcs,

  ...PostGIS_Funcs,

  {
    name: "$left",
    description: ` :[column_name, number] -> substring`,
    type: "function",
    numArgs: 2,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(
        "LEFT(" + asNameAlias(args[0], tableAlias) + ", $1)",
        [args[1]],
      );
    },
  },
  {
    name: "$unnest_words",
    description: ` :[column_name] -> Splits string at spaces`,
    type: "function",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(
        "unnest(string_to_array(" +
          asNameAlias(args[0], tableAlias) +
          "::TEXT , ' '))",
      ); //, [args[1]]
    },
  },
  {
    name: "$right",
    description: ` :[column_name, number] -> substring`,
    type: "function",
    numArgs: 2,
    singleColArg: false,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return pgp.as.format(
        "RIGHT(" + asNameAlias(args[0], tableAlias) + ", $1)",
        [args[1]],
      );
    },
  },

  {
    name: "$to_char",
    type: "function",
    description: ` :[column_name, format<string>] -> format dates and strings. Eg: [current_timestamp, 'HH12:MI:SS']`,
    singleColArg: false,
    numArgs: 2,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      if (args.length === 3) {
        return pgp.as.format(
          "to_char(" + asNameAlias(args[0], tableAlias) + ", $2, $3)",
          [args[0], args[1], args[2]],
        );
      }
      return pgp.as.format(
        "to_char(" + asNameAlias(args[0], tableAlias) + ", $2)",
        [args[0], args[1]],
      );
    },
  },

  /**
   * Date trunc utils
   */
  ...[
    "microsecond",
    "millisecond",
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
    "millennium",
  ]
    .map((k) => ({ val: 0, unit: k }))
    .concat([
      { val: 6, unit: "month" },
      { val: 4, unit: "month" },
      { val: 2, unit: "month" },
      { val: 8, unit: "hour" },
      { val: 4, unit: "hour" },
      { val: 2, unit: "hour" },
      { val: 30, unit: "minute" },
      { val: 15, unit: "minute" },
      { val: 6, unit: "minute" },
      { val: 5, unit: "minute" },
      { val: 4, unit: "minute" },
      { val: 3, unit: "minute" },
      { val: 2, unit: "minute" },
      { val: 30, unit: "second" },
      { val: 15, unit: "second" },
      { val: 10, unit: "second" },
      { val: 8, unit: "second" },
      { val: 6, unit: "second" },
      { val: 5, unit: "second" },
      { val: 4, unit: "second" },
      { val: 3, unit: "second" },
      { val: 2, unit: "second" },

      { val: 500, unit: "millisecond" },
      { val: 250, unit: "millisecond" },
      { val: 100, unit: "millisecond" },
      { val: 50, unit: "millisecond" },
      { val: 25, unit: "millisecond" },
      { val: 10, unit: "millisecond" },
      { val: 5, unit: "millisecond" },
      { val: 2, unit: "millisecond" },
    ])
    .map(
      ({ val, unit }) =>
        ({
          name: "$date_trunc_" + (val || "") + unit,
          type: "function",
          description: ` :[column_name, opts?: { timeZone: true | 'TZ Name' }] -> round down timestamp to closest ${val || ""} ${unit} `,
          singleColArg: true,
          numArgs: 2,
          getFields: (args: any[]) => [args[0]],
          getQuery: ({ allColumns, args, tableAlias }) => {
            /** Timestamp added to ensure filters work correctly (psql will loose the string value timezone when comparing to a non tz column) */
            const col = parseUnix(args[0], tableAlias, allColumns, args[1]);
            if (!val) return `date_trunc(${asValue(unit)}, ${col})`;
            const PreviousUnit = {
              year: "decade",
              month: "year",
              hour: "day",
              minute: "hour",
              second: "minute",
              millisecond: "second",
              microsecond: "millisecond",
            };

            const prevUnit = PreviousUnit[unit as "month"];
            if (!prevUnit) {
              throw "Not supported. prevUnit not found";
            }

            let extractedUnit = `date_part(${asValue(unit, "::text")}, ${col})::int`;
            if (unit === "microsecond" || unit === "millisecond") {
              extractedUnit = `(${extractedUnit} - 1000 * floor(${extractedUnit}/1000)::int)`;
            }
            const res = `(date_trunc(${asValue(prevUnit)}, ${col}) + floor(${extractedUnit} / ${val}) * interval ${asValue(val + " " + unit)})`;
            // console.log(res);
            return res;
          },
        }) as FunctionSpec,
    ),

  /* Date funcs date_part */
  ...["date_trunc", "date_part"].map(
    (funcName) =>
      ({
        name: "$" + funcName,
        type: "function",
        numArgs: 3,
        description:
          ` :[unit<string>, column_name, opts?: { timeZone: true | string }] -> ` +
          (funcName === "date_trunc"
            ? ` round down timestamp to closest unit value. `
            : ` extract date unit as float8. `) +
          ` E.g. ['hour', col] `,
        singleColArg: false,
        getFields: (args: any[]) => [args[1]],
        getQuery: ({ allColumns, args, tableAlias }) => {
          return `${funcName}(${asValue(args[0])}, ${parseUnix(args[1], tableAlias, allColumns, args[2])})`;
        },
      }) as FunctionSpec,
  ),

  /* Handy date funcs */
  ...[
    ["date", "YYYY-MM-DD"],
    ["datetime", "YYYY-MM-DD HH24:MI"],
    ["datetime_", "YYYY_MM_DD__HH24_MI"],
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
  ].map(
    ([funcName, txt]) =>
      ({
        name: "$" + funcName,
        type: "function",
        description:
          ` :[column_name, opts?: { timeZone: true | string }] -> get timestamp formated as ` +
          txt,
        singleColArg: true,
        numArgs: 1,
        getFields: (args: any[]) => [args[0]],
        getQuery: ({ allColumns, args, tableAlias }) => {
          return pgp.as.format(
            "trim(to_char(" +
              parseUnix(args[0], tableAlias, allColumns, args[1]) +
              ", $2))",
            [args[0], txt],
          );
        },
      }) as FunctionSpec,
  ),

  /* Basic 1 arg col funcs */
  ...[
    ...["TEXT"].flatMap((cast) =>
      ["upper", "lower", "length", "reverse", "trim", "initcap"].map(
        (funcName) => ({ cast, funcName }),
      ),
    ),
    ...[""].flatMap((cast) =>
      ["round", "ceil", "floor", "sign", "md5"].map((funcName) => ({
        cast,
        funcName,
      })),
    ),
  ].map(
    ({ funcName, cast }) =>
      ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: true,
        getFields: (args: any[]) => [args[0]],
        getQuery: ({ args, tableAlias }) => {
          return `${funcName}(${asNameAlias(args[0], tableAlias)}${cast ? `::${cast}` : ""})`;
        },
      }) as FunctionSpec,
  ),

  /**
   * Interval funcs
   * (col1, col2?, trunc )
   * */
  ...["age", "ageNow", "difference"].map(
    (funcName) =>
      ({
        name: "$" + funcName,
        type: "function",
        numArgs: 2,
        singleColArg: true,
        getFields: (args: any[]) =>
          args.slice(0, 2).filter((a) => typeof a === "string"), // Filtered because the second arg is optional
        getQuery: ({ allowedFields, args, tableAlias, allColumns }) => {
          const validColCount = args
            .slice(0, 2)
            .filter((a) => typeof a === "string").length;
          const trunc = args[2];
          const allowedTruncs = [
            "second",
            "minute",
            "hour",
            "day",
            "month",
            "year",
          ];
          if (trunc && !allowedTruncs.includes(trunc))
            throw new Error(
              "Incorrect trunc provided. Allowed values: " + allowedTruncs,
            );
          if (funcName === "difference" && validColCount !== 2)
            throw new Error("Must have two column names");
          if (![1, 2].includes(validColCount))
            throw new Error("Must have one or two column names");
          const [leftField, rightField] = args as [string, string];
          const tzOpts = args[2];
          const leftQ = parseUnix(leftField, tableAlias, allColumns, tzOpts);
          let rightQ = rightField
            ? parseUnix(rightField, tableAlias, allColumns, tzOpts)
            : "";
          let query = "";
          if (funcName === "ageNow" && validColCount === 1) {
            query = `age(now(), ${leftQ})`;
          } else if (funcName === "age" || funcName === "ageNow") {
            if (rightQ) rightQ = ", " + rightQ;
            query = `age(${leftQ} ${rightQ})`;
          } else {
            query = `${leftQ} - ${rightQ}`;
          }
          return trunc ? `date_trunc(${asValue(trunc)}, ${query})` : query;
        },
      }) as FunctionSpec,
  ),

  /* pgcrypto funcs */
  ...["crypt"].map(
    (funcName) =>
      ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: false,
        getFields: (args: any[]) => [args[1]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
          const value = asValue(args[0]) + "",
            seedColumnName = asNameAlias(args[1], tableAlias);

          return `crypt(${value}, ${seedColumnName}::text)`;
        },
      }) as FunctionSpec,
  ),

  /* Text col and value funcs */
  ...["position", "position_lower"].map(
    (funcName) =>
      ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: false,
        getFields: (args: any[]) => [args[1]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
          let a1 = asValue(args[0]),
            a2 = asNameAlias(args[1], tableAlias);
          if (funcName === "position_lower") {
            a1 = `LOWER(${a1}::text)`;
            a2 = `LOWER(${a2}::text)`;
          }
          return `position( ${a1} IN ${a2} )`;
        },
      }) as FunctionSpec,
  ),
  ...["template_string"].map(
    (funcName) =>
      ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        minCols: 0,
        singleColArg: false,
        getFields: (args: any[]) => [] as string[], // Fields not validated because we'll use the allowed ones anyway
        getQuery: ({ allowedFields, args, tableAlias }) => {
          if (typeof args[0] !== "string")
            throw "First argument must be a string. E.g.: '{col1} ..text {col2} ...' ";

          const rawValue = args[0];
          let finalValue = rawValue;
          const usedColumns = allowedFields.filter((fName) =>
            rawValue.includes(`{${fName}}`),
          );
          usedColumns.forEach((colName, idx) => {
            finalValue = finalValue.split(`{${colName}}`).join(`%${idx + 1}$s`);
          });
          finalValue = asValue(finalValue);

          if (usedColumns.length) {
            return `format(${finalValue}, ${usedColumns.map((c) => `${asNameAlias(c, tableAlias)}::TEXT`).join(", ")})`;
          }

          return `format(${finalValue})`;
        },
      }) as FunctionSpec,
  ),

  /** Custom highlight -> myterm => ['some text and', ['myterm'], ' and some other text']
   * (fields: "*" | string[], term: string, { edgeTruncate: number = -1; noFields: boolean = false }) => string | (string | [string])[]
   * edgeTruncate = maximum extra characters left and right of matches
   * noFields = exclude field names in search
   * */
  {
    name: "$term_highlight" /* */,
    description: ` :[column_names<string[] | "*">, search_term<string>, opts?<{ returnIndex?: number; edgeTruncate?: number; noFields?: boolean }>] -> get case-insensitive text match highlight`,
    type: "function",
    numArgs: 1,
    singleColArg: true,
    canBeUsedForFilter: true,
    getFields: (args: any[]) => args[0],
    getQuery: ({ allowedFields, args, tableAlias, allColumns }) => {
      const cols = parseFieldFilter(args[0], false, allowedFields);
      let term = args[1];
      const rawTerm = args[1];
      const {
        edgeTruncate,
        noFields = false,
        returnType,
        matchCase = false,
      } = args[2] || {};
      if (!isEmpty(args[2])) {
        const keys = Object.keys(args[2]);
        const validKeys = [
          "edgeTruncate",
          "noFields",
          "returnType",
          "matchCase",
        ];
        const bad_keys = keys.filter((k) => !validKeys.includes(k));
        if (bad_keys.length)
          throw (
            "Invalid options provided for $term_highlight. Expecting one of: " +
            validKeys.join(", ")
          );
      }
      if (!cols.length) throw "Cols are empty/invalid";
      if (typeof term !== "string") throw "Non string term provided: " + term;
      if (
        edgeTruncate !== undefined &&
        (!Number.isInteger(edgeTruncate) || edgeTruncate < -1)
      )
        throw "Invalid edgeTruncate. expecting a positive integer";
      if (typeof noFields !== "boolean")
        throw "Invalid noFields. expecting boolean";
      const RETURN_TYPES = ["index", "boolean", "object"];
      if (returnType && !RETURN_TYPES.includes(returnType)) {
        throw `returnType can only be one of: ${RETURN_TYPES}`;
      }

      const makeTextMatcherArray = (rawText: string, _term: string) => {
        let matchText = rawText,
          term = _term;
        if (!matchCase) {
          matchText = `LOWER(${rawText})`;
          term = `LOWER(${term})`;
        }
        let leftStr = `substr(${rawText}, 1, position(${term} IN ${matchText}) - 1 )`,
          rightStr = `substr(${rawText}, position(${term} IN ${matchText}) + length(${term}) )`;
        if (edgeTruncate) {
          leftStr = `RIGHT(${leftStr}, ${asValue(edgeTruncate)})`;
          rightStr = `LEFT(${rightStr}, ${asValue(edgeTruncate)})`;
        }
        return `
          CASE WHEN position(${term} IN ${matchText}) > 0 AND ${term} <> '' 
            THEN array_to_json(ARRAY[
                to_json( ${leftStr}::TEXT ), 
                array_to_json(
                  ARRAY[substr(${rawText}, position(${term} IN ${matchText}), length(${term}) )::TEXT ]
                ),
                to_json(${rightStr}::TEXT ) 
              ]) 
            ELSE 
              array_to_json(ARRAY[(${rawText})::TEXT]) 
          END
        `;
      };

      const colRaw =
        "( " +
        cols
          .map(
            (c) =>
              `${noFields ? "" : asValue(c + ": ") + " || "} COALESCE(${asNameAlias(c, tableAlias)}::TEXT, '')`,
          )
          .join(" || ', ' || ") +
        " )";
      let col = colRaw;
      term = asValue(term);
      if (!matchCase) {
        col = "LOWER" + col;
        term = `LOWER(${term})`;
      }

      let leftStr = `substr(${colRaw}, 1, position(${term} IN ${col}) - 1 )`,
        rightStr = `substr(${colRaw}, position(${term} IN ${col}) + length(${term}) )`;
      if (edgeTruncate) {
        leftStr = `RIGHT(${leftStr}, ${asValue(edgeTruncate)})`;
        rightStr = `LEFT(${rightStr}, ${asValue(edgeTruncate)})`;
      }

      // console.log(col);
      let res = "";
      if (returnType === "index") {
        res = `CASE WHEN position(${term} IN ${col}) > 0 THEN position(${term} IN ${col}) - 1 ELSE -1 END`;

        // } else if(returnType === "boolean"){
        //   res = `CASE WHEN position(${term} IN ${col}) > 0 THEN TRUE ELSE FALSE END`;
      } else if (returnType === "object" || returnType === "boolean") {
        const hasChars = Boolean(rawTerm && /[a-z]/i.test(rawTerm));
        const validCols = cols
          .map((c) => {
            const colInfo = allColumns.find((ac) => ac.name === c);
            return {
              key: c,
              colInfo,
            };
          })
          .filter((c) => c.colInfo && c.colInfo.udt_name !== "bytea");

        const _cols = validCols.filter(
          (c) =>
            /** Exclude numeric columns when the search tern contains a character */
            !hasChars || postgresToTsType(c.colInfo!.udt_name) !== "number",
        );

        /** This will break GROUP BY (non-integer constant in GROUP BY) */
        if (!_cols.length) {
          if (validCols.length && hasChars)
            throw `You're searching the impossible: characters in numeric fields. Use this to prevent making such a request in future: /[a-z]/i.test(your_term) `;
          return returnType === "boolean" ? "FALSE" : "NULL";
        }
        res = `CASE 
          ${_cols
            .map((c) => {
              const colNameEscaped = asNameAlias(c.key, tableAlias);
              let colSelect = `${colNameEscaped}::TEXT`;
              const isTstamp = c.colInfo?.udt_name.startsWith("timestamp");
              if (isTstamp || c.colInfo?.udt_name === "date") {
                colSelect = `( CASE WHEN ${colNameEscaped} IS NULL THEN '' 
              ELSE concat_ws(' ', 
                trim(to_char(${colNameEscaped}, 'YYYY-MM-DD HH24:MI:SS')), 
                trim(to_char(${colNameEscaped}, 'Day Month')), 
                'Q' || trim(to_char(${colNameEscaped}, 'Q')),
                'WK' || trim(to_char(${colNameEscaped}, 'WW'))
              ) END)`;
              }
              const colTxt = `COALESCE(${colSelect}, '')`; //  position(${term} IN ${colTxt}) > 0
              if (returnType === "boolean") {
                return ` 
                WHEN  ${colTxt} ${matchCase ? "LIKE" : "ILIKE"} ${asValue("%" + rawTerm + "%")}
                  THEN TRUE
                `;
              }
              return ` 
              WHEN  ${colTxt} ${matchCase ? "LIKE" : "ILIKE"} ${asValue("%" + rawTerm + "%")}
                THEN json_build_object(
                  ${asValue(c.key)}, 
                  ${makeTextMatcherArray(colTxt, term)}
                )::jsonb
              `;
            })
            .join(" ")}
          ELSE ${returnType === "boolean" ? "FALSE" : "NULL"}

        END`;

        // console.log(res)
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
    },
  },

  /* Aggs */
  ...[
    "max",
    "min",
    "count",
    "avg",
    "json_agg",
    "jsonb_agg",
    "string_agg",
    "array_agg",
    "sum",
  ].map(
    (aggName) =>
      ({
        name: "$" + aggName,
        type: "aggregation",
        numArgs: 1,
        singleColArg: true,
        getFields: (args: any[]) => [args[0]],
        getQuery: ({ args, tableAlias }) => {
          let extraArgs = "";
          if (args.length > 1) {
            extraArgs = pgp.as.format(", $1:csv", args.slice(1));
          }
          return (
            aggName + "(" + asNameAlias(args[0], tableAlias) + `${extraArgs})`
          );
        },
      }) satisfies FunctionSpec,
  ),

  {
    name: "$jsonb_build_object",
    type: "function",
    numArgs: 22,
    minCols: 1,
    singleColArg: false,
    getFields: (args) => args,
    getQuery: ({ args, tableAlias }) => {
      return `jsonb_build_object(${args.flatMap((arg) => [asValue(arg), asNameAlias(arg, tableAlias)]).join(", ")})`;
    },
  },

  /* More aggs */
  {
    name: "$countAll",
    type: "aggregation",
    description: `agg :[]  COUNT of all rows `,
    singleColArg: true,
    numArgs: 0,
    getFields: (args: any[]) => [],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      return "COUNT(*)";
    },
  } as FunctionSpec,
  {
    name: "$diff_perc",
    type: "aggregation",
    numArgs: 1,
    singleColArg: true,
    getFields: (args: any[]) => [args[0]],
    getQuery: ({ allowedFields, args, tableAlias }) => {
      const col = asNameAlias(args[0], tableAlias);
      return `round( ( ( MAX(${col}) - MIN(${col}) )::float/MIN(${col}) ) * 100, 2)`;
    },
  } as FunctionSpec,
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
      return (
        "md5(" +
        allowedFields

          /* CTID not available in AFTER trigger */
          // .concat(ctidField? [ctidField] : [])
          .sort()
          .map((f) => asNameAlias(f, tableAlias))
          .map((f) => `md5(coalesce(${f}::text, 'dd'))`)
          .join(" || ") +
        `)`
      );
    },
  },
  // ,{
  //   name: "ctid",
  //   type: "computed",
  //   // description: ` order hash of row content  `,
  //   getQuery: ({ allowedFields, tableAlias, ctidField }) => {
  //     return asNameAlias("ctid", tableAlias);
  //   }
  // }
];

/*
 

get key val pairs:
obj.key.path    value


WITH RECURSIVE extract_all AS (
  select 
    key as path, 
    jsonb_typeof(value) as type,
    CASE WHEN trim(jsonb_typeof(value)) = 'array' THEN jsonb_typeof(value->0) END as elem_type,
    value
  from (SELECT * FROM mytable LIMIT 1) zzzzz
  cross join lateral jsonb_each(jdata)
  union all
  select
    path || '.' || coalesce(obj_key, (arr_key- 1)::text),
    jsonb_typeof(coalesce(obj_value, arr_value)) as type,
    CASE WHEN jsonb_typeof(coalesce(obj_value, arr_value)) = 'array' THEN jsonb_typeof(coalesce(obj_value, arr_value)->0) END as  elem_type,
    coalesce(obj_value, arr_value)
  from extract_all
  left join lateral 
    jsonb_each(case jsonb_typeof(value) when 'object' then value end) 
    as o(obj_key, obj_value) 
    on jsonb_typeof(value) = 'object'
  left join lateral 
    jsonb_array_elements(case jsonb_typeof(value) when 'array' then value end) 
    with ordinality as a(arr_value, arr_key)
    on jsonb_typeof(value) = 'array'
  where obj_key is not null or arr_key is not null
)
SELECT *, array_length(string_to_array(path, '.'), 1) - 1 as depth
FROM extract_all t1
WHERE NOT EXISTS ( --Keep only leaf values
  SELECT 1 
  FROM extract_all t2
  WHERE length(t1.path) < length(t2.path)
  AND starts_with(t2.path, t1.path)
);

*/

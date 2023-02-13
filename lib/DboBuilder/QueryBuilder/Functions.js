"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPUTED_FIELDS = exports.FUNCTIONS = exports.parseFunction = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../../DboBuilder");
const ViewHandler_1 = require("../ViewHandler");
const QueryBuilder_1 = require("./QueryBuilder");
const parseFunction = (funcData) => {
    const { func, args, functions, allowedFields } = funcData;
    /* Function is computed column. No checks needed */
    if (typeof func !== "string") {
        const computedCol = exports.COMPUTED_FIELDS.find(c => c.name === func.name);
        if (!computedCol)
            throw `Unexpected function: computed column spec not found for ${JSON.stringify(func.name)}`;
        return func;
    }
    const funcName = func;
    const makeErr = (msg) => {
        return `Issue with function ${JSON.stringify({ [funcName]: args })}: \n${msg}`;
    };
    /* Find function */
    const funcDef = functions.find(f => f.name === funcName);
    if (!funcDef) {
        const sf = functions.filter(f => f.name.toLowerCase().slice(1).startsWith(funcName.toLowerCase())).sort((a, b) => (a.name.length - b.name.length));
        const hint = (sf.length ? `. \n Maybe you meant: \n | ${sf.map(s => s.name + " " + (s.description || "")).join("    \n | ")}  ?` : "");
        throw "\n Function " + funcName + " does not exist or is not allowed " + hint;
    }
    /* Validate fields */
    const fields = funcDef.getFields(args);
    if (fields !== "*") {
        fields.forEach(fieldKey => {
            if (typeof fieldKey !== "string" || !allowedFields.includes(fieldKey)) {
                throw makeErr(`getFields() => field name ${JSON.stringify(fieldKey)} is invalid or disallowed`);
            }
        });
        if ((funcDef.minCols ?? 0) > fields.length) {
            throw makeErr(`Less columns provided than necessary (minCols=${funcDef.minCols})`);
        }
    }
    if (funcDef.numArgs && funcDef.minCols !== 0 && fields !== "*" && Array.isArray(fields) && !fields.length) {
        throw `\n Function "${funcDef.name}" expects at least a field name but has not been provided with one`;
    }
    return funcDef;
};
exports.parseFunction = parseFunction;
const MAX_COL_NUM = 1600;
const asValue = (v, castAs = "") => DboBuilder_1.pgp.as.format("$1" + castAs, [v]);
const parseUnix = (colName, tableAlias, allColumns) => {
    const col = allColumns.find(c => c.name === colName);
    if (!col)
        throw `Unexpected: column ${colName} not found`;
    const escapedName = (0, QueryBuilder_1.asNameAlias)(colName, tableAlias);
    if (col.udt_name === "int8") {
        return `to_timestamp(${escapedName}/1000.0)`;
    }
    return escapedName;
};
const JSON_Funcs = [
    {
        name: "$jsonb_set",
        description: "[columnName: string, path: (string | number)[], new_value?: any, create_missing?: boolean ]   	Returns target value (columnName) with the section designated by path replaced by new_value, or with new_value added if create_missing is true (default is true) and the item designated by path does not exist",
        singleColArg: false,
        numArgs: 4,
        type: "function",
        getFields: ([column]) => column,
        getQuery: ({ args: [colName, path = [], new_value, create_missing = true], tableAlias, allowedFields }) => {
            if (!allowedFields.includes(colName)) {
                throw `Unexpected: column ${colName} not found`;
            }
            if (!path || !Array.isArray(path) || !path.every(v => ["number", "string"].includes(typeof v))) {
                throw "Expecting: [columnName: string, path: (string | number)[], new_value?: any, create_missing?: boolean ]";
            }
            const escapedName = (0, QueryBuilder_1.asNameAlias)(colName, tableAlias);
            return `jsonb_set(${escapedName}, ${asValue(path)}, ${asValue(new_value)}, ${create_missing})`;
        }
    },
    ...[
        ["jsonb_array_length", "Returns the number of elements in the outermost JSON array"],
        ["jsonb_each", "Expands the outermost JSON object into a set of key/value pairs"],
        ["jsonb_each_text", "Expands the outermost JSON object into a set of key/value pairs. The returned values will be of type text"],
        ["jsonb_object_keys", "Returns set of keys in the outermost JSON object"],
        ["jsonb_strip_nulls", "Returns from_json with all object fields that have null values omitted. Other null values are untouched"],
        ["jsonb_pretty", "Returns from_json as indented JSON text "],
        ["jsonb_to_record", "Builds an arbitrary record from a JSON object"],
        ["jsonb_array_elements", "Expands a JSON array to a set of JSON values"],
        ["jsonb_array_elements_text", "Expands a JSON array to a set of text values "],
        ["jsonb_typeof", "Returns the type of the outermost JSON value as a text string. Possible types are object, array, string, number, boolean, and null "],
    ].map(([name, description]) => ({
        name: "$" + name,
        description,
        singleColArg: true,
        numArgs: 1,
        type: "function",
        getFields: ([col]) => col,
        getQuery: ({ args: [colName], tableAlias }) => {
            const escapedName = (0, QueryBuilder_1.asNameAlias)(colName, tableAlias);
            return `${name}(${escapedName})`;
        }
    }))
];
const FTS_Funcs = 
/* Full text search
  https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-SIMPLE-DICTIONARY
*/
[
    "simple",
    // "synonym", // replace word with a synonym
    "english",
    // "english_stem",
    // "english_hunspell", 
    ""
].map(type => ({
    name: "$ts_headline" + (type ? ("_" + type) : ""),
    description: ` :[column_name <string>, search_term: <string | { to_tsquery: string } > ] -> sha512 hash of the of column content`,
    type: "function",
    singleColArg: true,
    numArgs: 2,
    getFields: ([column]) => [column],
    getQuery: ({ allColumns, args, tableAlias }) => {
        const col = (0, prostgles_types_1.asName)(args[0]);
        let qVal = args[1], qType = "to_tsquery";
        let _type = type ? (asValue(type) + ",") : "";
        const searchTypes = prostgles_types_1.TextFilter_FullTextSearchFilterKeys;
        /* { to_tsquery: 'search term' } */
        if ((0, DboBuilder_1.isPlainObject)(qVal)) {
            const keys = Object.keys(qVal);
            if (!keys.length)
                throw "Bad arg";
            if (keys.length !== 1 || !searchTypes.includes(keys[0]))
                throw "Expecting a an object with a single key named one of: " + searchTypes.join(", ");
            qType = keys[0];
            qVal = asValue(qVal[qType]);
            /* 'search term' */
        }
        else if (typeof qVal === "string") {
            qVal = DboBuilder_1.pgp.as.format(qType + "($1)", [qVal]);
        }
        else
            throw "Bad second arg. Exepcting search string or { to_tsquery: 'search string' }";
        const res = `ts_headline(${_type} ${col}::text, ${qVal}, 'ShortWord=1 ' )`;
        // console.log(res)
        return res;
    }
}));
let PostGIS_Funcs = [
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
    }, {
        fname: "ST_DistanceSpheroid",
        description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number; spheroid?: string; }] -> Returns minimum distance in meters between two lon/lat geometries given a particular spheroid. See the explanation of spheroids given for ST_LengthSpheroid.

      `,
    }, {
        fname: "ST_DistanceSphere",
        description: ` :[column_name, { lat?: number; lng?: number; geojson?: object; srid?: number }] -> Returns linear distance in meters between two lon/lat points. Uses a spherical earth and radius of 6370986 meters. Faster than ST_DistanceSpheroid, but less accurate. Only implemented for points.`,
    }
].map(({ fname, description }) => ({
    name: "$" + fname,
    description,
    type: "function",
    singleColArg: true,
    numArgs: 1,
    getFields: (args) => [args[0]],
    getQuery: ({ allColumns, args, tableAlias }) => {
        const arg2 = args[1], mErr = () => { throw `${fname}: Expecting a second argument like: { lat?: number; lng?: number; geojson?: object; srid?: number; use_spheroid?: boolean }`; };
        if (!(0, DboBuilder_1.isPlainObject)(arg2))
            mErr();
        const col = allColumns.find(c => c.name === args[0]);
        if (!col)
            throw new Error("Col not found: " + args[0]);
        const { lat, lng, srid = 4326, geojson, text, use_spheroid, distance, spheroid = 'SPHEROID["WGS 84",6378137,298.257223563]', debug } = arg2;
        let geomQ = "", extraParams = "";
        if (typeof text === "string") {
            geomQ = `ST_GeomFromText(${asValue(text)})`;
        }
        else if ([lat, lng].every(v => Number.isFinite(v))) {
            geomQ = `ST_Point(${asValue(lng)}, ${asValue(lat)})`;
        }
        else if ((0, DboBuilder_1.isPlainObject)(geojson)) {
            geomQ = `ST_GeomFromGeoJSON(${geojson})`;
        }
        else
            mErr();
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
            colCast = (colIsGeog || use_spheroid) ? "::geography" : "::geometry";
            geomQCast = (colIsGeog || use_spheroid) ? "::geography" : "::geometry";
            /**
             * boolean ST_DWithin(geometry g1, geometry g2, double precision distance_of_srid);
             * boolean ST_DWithin(geography gg1, geography gg2, double precision distance_meters, boolean use_spheroid = true);
             */
        }
        else if (fname === "ST_DWithin") {
            colCast = colIsGeog ? "::geography" : "::geometry";
            geomQCast = colIsGeog ? "::geography" : "::geometry";
            if (typeof distance !== "number")
                throw `ST_DWithin: distance param missing or not a number`;
            extraParams = ", " + asValue(distance);
            /**
             * float ST_DistanceSpheroid(geometry geomlonlatA, geometry geomlonlatB, spheroid measurement_spheroid);
             */
        }
        else if (fname === "ST_DistanceSpheroid") {
            colCast = "::geometry";
            geomQCast = "::geometry";
            if (typeof spheroid !== "string")
                throw `ST_DistanceSpheroid: spheroid param must be string`;
            extraParams = `, ${asValue(spheroid)}`;
            /**
             * float ST_DistanceSphere(geometry geomlonlatA, geometry geomlonlatB);
             */
        }
        else if (fname === "ST_DistanceSphere") {
            colCast = "::geometry";
            geomQCast = "::geometry";
            extraParams = "";
            /**
             * double precision <->( geometry A , geometry B );
             * double precision <->( geography A , geography B );
             */
        }
        else if (fname === "<->") {
            colCast = colIsGeog ? "::geography" : "::geometry";
            geomQCast = colIsGeog ? "::geography" : "::geometry";
            const q = DboBuilder_1.pgp.as.format(`${(0, QueryBuilder_1.asNameAlias)(args[0], tableAlias)}${colCast} <-> ${geomQ}${geomQCast}`);
            if (debug)
                throw q;
            return q;
        }
        const q = DboBuilder_1.pgp.as.format(`${fname}(${(0, QueryBuilder_1.asNameAlias)(args[0], tableAlias)}${colCast} , ${geomQ}${geomQCast} ${extraParams})`);
        if (debug)
            throw q;
        return q;
    }
}));
PostGIS_Funcs = PostGIS_Funcs.concat([
    "ST_AsText", "ST_AsEWKT", "ST_AsEWKB", "ST_AsBinary", "ST_AsMVT", "ST_AsMVTGeom",
    "ST_AsGeoJSON", "ST_Simplify",
    "ST_SnapToGrid",
]
    .map(fname => {
    const res = {
        name: "$" + fname,
        description: ` :[column_name, precision?] -> json GeoJSON output of a geometry column`,
        type: "function",
        singleColArg: true,
        numArgs: 1,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            let secondArg = "";
            const otherArgs = args.slice(1);
            if (otherArgs.length)
                secondArg = ", " + otherArgs.map(arg => asValue(arg)).join(", ");
            const escTabelName = (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + "::geometry";
            let result = DboBuilder_1.pgp.as.format(fname + "(" + escTabelName + secondArg + (fname === "ST_AsGeoJSON" ? ")::jsonb" : ")"));
            if (fname.startsWith("ST_SnapToGrid") || fname.startsWith("ST_Simplify")) {
                let r = `ST_AsGeoJSON(${result})::jsonb`;
                return r;
            }
            return result;
        }
    };
    return res;
}));
PostGIS_Funcs = PostGIS_Funcs.concat(["ST_Extent", "ST_3DExtent", "ST_XMin_Agg", "ST_XMax_Agg", "ST_YMin_Agg", "ST_YMax_Agg", "ST_ZMin_Agg", "ST_ZMax_Agg"]
    .map(fname => {
    const res = {
        name: "$" + fname,
        description: ` :[column_name] -> ST_Extent returns a bounding box that encloses a set of geometries. 
          The ST_Extent function is an "aggregate" function in the terminology of SQL. 
          That means that it operates on lists of data, in the same way the SUM() and AVG() functions do.`,
        type: "aggregation",
        singleColArg: true,
        numArgs: 1,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const escTabelName = (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + "::geometry";
            if (fname.includes("Extent")) {
                return `${fname}(${escTabelName})`;
            }
            return `${fname.endsWith("_Agg") ? fname.slice(0, -4) : fname}(ST_Collect(${escTabelName}))`;
        }
    };
    return res;
}));
PostGIS_Funcs = PostGIS_Funcs.concat(["ST_Length", "ST_X", "ST_Y", "ST_Z"].map(fname => ({
    name: "$" + fname,
    type: "function",
    singleColArg: true,
    numArgs: 1,
    getFields: (args) => [args[0]],
    getQuery: ({ allColumns, args, tableAlias }) => {
        const colName = args[0];
        const escapedColName = (0, QueryBuilder_1.asNameAlias)(colName, tableAlias);
        const col = allColumns.find(c => c.name === colName);
        if (!col)
            throw new Error("Col not found: " + colName);
        return `${fname}(${escapedColName})`;
    }
})));
/**
* Each function expects a column at the very least
*/
exports.FUNCTIONS = [
    // Hashing
    {
        name: "$md5_multi",
        description: ` :[...column_names] -> md5 hash of the column content`,
        type: "function",
        singleColArg: false,
        numArgs: MAX_COL_NUM,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("md5(" + args.map(fname => "COALESCE( " + (0, QueryBuilder_1.asNameAlias)(fname, tableAlias) + "::text, '' )").join(" || ") + ")");
            return q;
        }
    },
    {
        name: "$md5_multi_agg",
        description: ` :[...column_names] -> md5 hash of the string aggregation of column content`,
        type: "aggregation",
        singleColArg: false,
        numArgs: MAX_COL_NUM,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("md5(string_agg(" + args.map(fname => "COALESCE( " + (0, QueryBuilder_1.asNameAlias)(fname, tableAlias) + "::text, '' )").join(" || ") + ", ','))");
            return q;
        }
    },
    {
        name: "$sha256_multi",
        description: ` :[...column_names] -> sha256 hash of the of column content`,
        type: "function",
        singleColArg: false,
        numArgs: MAX_COL_NUM,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha256((" + args.map(fname => "COALESCE( " + (0, QueryBuilder_1.asNameAlias)(fname, tableAlias) + ", '' )").join(" || ") + ")::text::bytea), 'hex')");
            return q;
        }
    },
    {
        name: "$sha256_multi_agg",
        description: ` :[...column_names] -> sha256 hash of the string aggregation of column content`,
        type: "aggregation",
        singleColArg: false,
        numArgs: MAX_COL_NUM,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha256(string_agg(" + args.map(fname => "COALESCE( " + (0, QueryBuilder_1.asNameAlias)(fname, tableAlias) + ", '' )").join(" || ") + ", ',')::text::bytea), 'hex')");
            return q;
        }
    },
    {
        name: "$sha512_multi",
        description: ` :[...column_names] -> sha512 hash of the of column content`,
        type: "function",
        singleColArg: false,
        numArgs: MAX_COL_NUM,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha512((" + args.map(fname => "COALESCE( " + (0, QueryBuilder_1.asNameAlias)(fname, tableAlias) + ", '' )").join(" || ") + ")::text::bytea), 'hex')");
            return q;
        }
    },
    {
        name: "$sha512_multi_agg",
        description: ` :[...column_names] -> sha512 hash of the string aggregation of column content`,
        type: "aggregation",
        singleColArg: false,
        numArgs: MAX_COL_NUM,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha512(string_agg(" + args.map(fname => "COALESCE( " + (0, QueryBuilder_1.asNameAlias)(fname, tableAlias) + ", '' )").join(" || ") + ", ',')::text::bytea), 'hex')");
            return q;
        }
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
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("LEFT(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + ", $1)", [args[1]]);
        }
    },
    {
        name: "$unnest_words",
        description: ` :[column_name] -> Splits string at spaces`,
        type: "function",
        numArgs: 1,
        singleColArg: true,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("unnest(string_to_array(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + "::TEXT , ' '))"); //, [args[1]]
        }
    },
    {
        name: "$right",
        description: ` :[column_name, number] -> substring`,
        type: "function",
        numArgs: 2,
        singleColArg: false,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("RIGHT(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + ", $1)", [args[1]]);
        }
    },
    {
        name: "$to_char",
        type: "function",
        description: ` :[column_name, format<string>] -> format dates and strings. Eg: [current_timestamp, 'HH12:MI:SS']`,
        singleColArg: false,
        numArgs: 2,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            if (args.length === 3) {
                return DboBuilder_1.pgp.as.format("to_char(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + ", $2, $3)", [args[0], args[1], args[2]]);
            }
            return DboBuilder_1.pgp.as.format("to_char(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + ", $2)", [args[0], args[1]]);
        }
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
        "millennium"
    ].map(k => ({ val: 0, unit: k }))
        .concat([
        { val: 6, unit: 'month' },
        { val: 4, unit: 'month' },
        { val: 2, unit: 'month' },
        { val: 8, unit: 'hour' },
        { val: 4, unit: 'hour' },
        { val: 2, unit: 'hour' },
        { val: 30, unit: 'minute' },
        { val: 15, unit: 'minute' },
        { val: 6, unit: 'minute' },
        { val: 5, unit: 'minute' },
        { val: 4, unit: 'minute' },
        { val: 3, unit: 'minute' },
        { val: 2, unit: 'minute' },
        { val: 30, unit: 'second' },
        { val: 15, unit: 'second' },
        { val: 10, unit: 'second' },
        { val: 8, unit: 'second' },
        { val: 6, unit: 'second' },
        { val: 5, unit: 'second' },
        { val: 4, unit: 'second' },
        { val: 3, unit: 'second' },
        { val: 2, unit: 'second' },
        { val: 500, unit: 'millisecond' },
        { val: 250, unit: 'millisecond' },
        { val: 100, unit: 'millisecond' },
        { val: 50, unit: 'millisecond' },
        { val: 25, unit: 'millisecond' },
        { val: 10, unit: 'millisecond' },
        { val: 5, unit: 'millisecond' },
        { val: 2, unit: 'millisecond' },
    ]).map(({ val, unit }) => ({
        name: "$date_trunc_" + (val || "") + unit,
        type: "function",
        description: ` :[column_name] -> round down timestamp to closest ${val || ""} ${unit} `,
        singleColArg: true,
        numArgs: 1,
        getFields: (args) => [args[0]],
        getQuery: ({ allColumns, args, tableAlias }) => {
            const col = parseUnix(args[0], tableAlias, allColumns);
            if (!val)
                return `date_trunc(${asValue(unit)}, ${col})`;
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
    })),
    /* Date funcs date_part */
    ...["date_trunc", "date_part"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        numArgs: 2,
        description: ` :[unit<string>, column_name] -> ` + (funcName === "date_trunc" ? ` round down timestamp to closest unit value. ` : ` extract date unit as float8. `) + ` E.g. ['hour', col] `,
        singleColArg: false,
        getFields: (args) => [args[1]],
        getQuery: ({ allColumns, args, tableAlias }) => {
            return `${funcName}(${asValue(args[0])}, ${parseUnix(args[1], tableAlias, allColumns)})`;
        }
    })),
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
    ].map(([funcName, txt]) => ({
        name: "$" + funcName,
        type: "function",
        description: ` :[column_name] -> get timestamp formated as ` + txt,
        singleColArg: true,
        numArgs: 1,
        getFields: (args) => [args[0]],
        getQuery: ({ allColumns, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("trim(to_char(" + parseUnix(args[0], tableAlias, allColumns) + ", $2))", [args[0], txt]);
        }
    })),
    /* Basic 1 arg col funcs */
    ...["upper", "lower", "length", "reverse", "trim", "initcap", "round", "ceil", "floor", "sign", "md5"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: true,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return funcName + "(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + ")";
        }
    })),
    /**
     * Interval funcs
     * (col1, col2?, trunc )
     * */
    ...["age", "ageNow", "difference"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: true,
        getFields: (args) => args.slice(0, 2).filter(a => typeof a === "string"),
        getQuery: ({ allowedFields, args, tableAlias, allColumns }) => {
            const validColCount = args.slice(0, 2).filter(a => typeof a === "string").length;
            const trunc = args[2];
            const allowedTruncs = ["second", "minute", "hour", "day", "month", "year"];
            if (trunc && !allowedTruncs.includes(trunc))
                throw new Error("Incorrect trunc provided. Allowed values: " + allowedTruncs);
            if (funcName === "difference" && validColCount !== 2)
                throw new Error("Must have two column names");
            if (![1, 2].includes(validColCount))
                throw new Error("Must have one or two column names");
            const [leftField, rightField] = args;
            const leftQ = parseUnix(leftField, tableAlias, allColumns);
            let rightQ = rightField ? parseUnix(rightField, tableAlias, allColumns) : "";
            let query = "";
            if (funcName === "ageNow" && validColCount === 1) {
                query = `age(now(), ${leftQ})`;
            }
            else if (funcName === "age" || funcName === "ageNow") {
                if (rightQ)
                    rightQ = ", " + rightQ;
                query = `age(${leftQ} ${rightQ})`;
            }
            else {
                query = `${leftQ} - ${rightQ}`;
            }
            return trunc ? `date_trunc(${asValue(trunc)}, ${query})` : query;
        }
    })),
    /* pgcrypto funcs */
    ...["crypt"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: false,
        getFields: (args) => [args[1]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const value = asValue(args[0]) + "", seedColumnName = (0, QueryBuilder_1.asNameAlias)(args[1], tableAlias);
            return `crypt(${value}, ${seedColumnName}::text)`;
        }
    })),
    /* Text col and value funcs */
    ...["position", "position_lower"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        singleColArg: false,
        getFields: (args) => [args[1]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            let a1 = asValue(args[0]), a2 = (0, QueryBuilder_1.asNameAlias)(args[1], tableAlias);
            if (funcName === "position_lower") {
                a1 = `LOWER(${a1}::text)`;
                a2 = `LOWER(${a2}::text)`;
            }
            return `position( ${a1} IN ${a2} )`;
        }
    })),
    ...["template_string"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        numArgs: 1,
        minCols: 0,
        singleColArg: false,
        getFields: (args) => [],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            if (typeof args[0] !== "string")
                throw "First argument must be a string. E.g.: '{col1} ..text {col2} ...' ";
            const rawValue = args[0];
            let finalValue = rawValue;
            const usedColumns = allowedFields.filter(fName => rawValue.includes(`{${fName}}`));
            usedColumns.forEach((colName, idx) => {
                finalValue = finalValue.split(`{${colName}}`).join(`%${idx + 1}$s`);
            });
            finalValue = asValue(finalValue);
            if (usedColumns.length) {
                return `format(${finalValue}, ${usedColumns.map(c => `${(0, QueryBuilder_1.asNameAlias)(c, tableAlias)}::TEXT`).join(", ")})`;
            }
            return `format(${finalValue})`;
        }
    })),
    /** Custom highlight -> myterm => ['some text and', ['myterm'], ' and some other text']
     * (fields: "*" | string[], term: string, { edgeTruncate: number = -1; noFields: boolean = false }) => string | (string | [string])[]
     * edgeTruncate = maximum extra characters left and right of matches
     * noFields = exclude field names in search
     * */
    {
        name: "$term_highlight",
        description: ` :[column_names<string[] | "*">, search_term<string>, opts?<{ returnIndex?: number; edgeTruncate?: number; noFields?: boolean }>] -> get case-insensitive text match highlight`,
        type: "function",
        numArgs: 1,
        singleColArg: true,
        canBeUsedForFilter: true,
        getFields: (args) => args[0],
        getQuery: ({ allowedFields, args, tableAlias, allColumns }) => {
            const cols = ViewHandler_1.ViewHandler._parseFieldFilter(args[0], false, allowedFields);
            let term = args[1];
            const rawTerm = args[1];
            let { edgeTruncate, noFields = false, returnType, matchCase = false } = args[2] || {};
            if (!(0, prostgles_types_1.isEmpty)(args[2])) {
                const keys = Object.keys(args[2]);
                const validKeys = ["edgeTruncate", "noFields", "returnType", "matchCase"];
                const bad_keys = keys.filter(k => !validKeys.includes(k));
                if (bad_keys.length)
                    throw "Invalid options provided for $term_highlight. Expecting one of: " + validKeys.join(", ");
            }
            if (!cols.length)
                throw "Cols are empty/invalid";
            if (typeof term !== "string")
                throw "Non string term provided: " + term;
            if (edgeTruncate !== undefined && (!Number.isInteger(edgeTruncate) || edgeTruncate < -1))
                throw "Invalid edgeTruncate. expecting a positive integer";
            if (typeof noFields !== "boolean")
                throw "Invalid noFields. expecting boolean";
            const RETURN_TYPES = ["index", "boolean", "object"];
            if (returnType && !RETURN_TYPES.includes(returnType)) {
                throw `returnType can only be one of: ${RETURN_TYPES}`;
            }
            const makeTextMatcherArray = (rawText, _term) => {
                let matchText = rawText, term = _term;
                if (!matchCase) {
                    matchText = `LOWER(${rawText})`;
                    term = `LOWER(${term})`;
                }
                let leftStr = `substr(${rawText}, 1, position(${term} IN ${matchText}) - 1 )`, rightStr = `substr(${rawText}, position(${term} IN ${matchText}) + length(${term}) )`;
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
            let colRaw = "( " + cols.map(c => `${noFields ? "" : (asValue(c + ": ") + " || ")} COALESCE(${(0, QueryBuilder_1.asNameAlias)(c, tableAlias)}::TEXT, '')`).join(" || ', ' || ") + " )";
            let col = colRaw;
            term = asValue(term);
            if (!matchCase) {
                col = "LOWER" + col;
                term = `LOWER(${term})`;
            }
            let leftStr = `substr(${colRaw}, 1, position(${term} IN ${col}) - 1 )`, rightStr = `substr(${colRaw}, position(${term} IN ${col}) + length(${term}) )`;
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
            }
            else if (returnType === "object" || returnType === "boolean") {
                const hasChars = Boolean(rawTerm && /[a-z]/i.test(rawTerm));
                let validCols = cols.map(c => {
                    const colInfo = allColumns.find(ac => ac.name === c);
                    return {
                        key: c,
                        colInfo
                    };
                })
                    .filter(c => c.colInfo && c.colInfo.udt_name !== "bytea");
                let _cols = validCols.filter(c => 
                /** Exclude numeric columns when the search tern contains a character */
                !hasChars ||
                    (0, DboBuilder_1.postgresToTsType)(c.colInfo.udt_name) !== "number");
                /** This will break GROUP BY (non-integer constant in GROUP BY) */
                if (!_cols.length) {
                    if (validCols.length && hasChars)
                        throw `You're searching the impossible: characters in numeric fields. Use this to prevent making such a request in future: /[a-z]/i.test(your_term) `;
                    return (returnType === "boolean") ? "FALSE" : "NULL";
                }
                res = `CASE 
          ${_cols
                    .map(c => {
                    const colNameEscaped = (0, QueryBuilder_1.asNameAlias)(c.key, tableAlias);
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
                    let colTxt = `COALESCE(${colSelect}, '')`; //  position(${term} IN ${colTxt}) > 0
                    if (returnType === "boolean") {
                        return ` 
                WHEN  ${colTxt} ${matchCase ? "LIKE" : "ILIKE"} ${asValue('%' + rawTerm + '%')}
                  THEN TRUE
                `;
                    }
                    return ` 
              WHEN  ${colTxt} ${matchCase ? "LIKE" : "ILIKE"} ${asValue('%' + rawTerm + '%')}
                THEN json_build_object(
                  ${asValue(c.key)}, 
                  ${makeTextMatcherArray(colTxt, term)}
                )::jsonb
              `;
                }).join(" ")}
          ELSE ${(returnType === "boolean") ? "FALSE" : "NULL"}

        END`;
                // console.log(res)
            }
            else {
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
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            let extraArgs = "";
            if (args.length > 1) {
                extraArgs = DboBuilder_1.pgp.as.format(", $1:csv", args.slice(1));
            }
            return aggName + "(" + (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias) + `${extraArgs})`;
        }
    })),
    /* More aggs */
    {
        name: "$countAll",
        type: "aggregation",
        description: `agg :[]  COUNT of all rows `,
        singleColArg: true,
        numArgs: 0,
        getFields: (args) => [],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return "COUNT(*)";
        }
    },
    {
        name: "$diff_perc",
        type: "aggregation",
        numArgs: 1,
        singleColArg: true,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const col = (0, QueryBuilder_1.asNameAlias)(args[0], tableAlias);
            return `round( ( ( MAX(${col}) - MIN(${col}) )::float/MIN(${col}) ) * 100, 2)`;
        }
    }
];
/* The difference between a function and computed field is that the computed field does not require any arguments */
exports.COMPUTED_FIELDS = [
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
                    .map(f => (0, QueryBuilder_1.asNameAlias)(f, tableAlias))
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
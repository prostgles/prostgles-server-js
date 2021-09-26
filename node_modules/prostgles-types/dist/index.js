"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNELS = exports.TS_PG_Types = exports._PG_postgis = exports._PG_date = exports._PG_bool = exports._PG_json = exports._PG_numbers = exports._PG_strings = void 0;
exports._PG_strings = ['bpchar', 'char', 'varchar', 'text', 'citext', 'uuid', 'bytea', 'inet', 'time', 'timetz', 'interval', 'name'];
exports._PG_numbers = ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'oid'];
exports._PG_json = ['json', 'jsonb'];
exports._PG_bool = ['bool'];
exports._PG_date = ['date', 'timestamp', 'timestamptz'];
exports._PG_postgis = ['geometry'];
exports.TS_PG_Types = {
    "string": exports._PG_strings,
    "number": exports._PG_numbers,
    "boolean": exports._PG_bool,
    "Object": exports._PG_json,
    "Date": exports._PG_date,
    "Array<number>": exports._PG_numbers.map(s => `_${s}`),
    "Array<boolean>": exports._PG_bool.map(s => `_${s}`),
    "Array<string>": exports._PG_strings.map(s => `_${s}`),
    "Array<Object>": exports._PG_json.map(s => `_${s}`),
    "Array<Date>": exports._PG_date.map(s => `_${s}`),
    "any": [],
};
function sql(query, args, options, otherOptions) {
    return "";
}
const preffix = "_psqlWS_.";
exports.CHANNELS = {
    SCHEMA_CHANGED: preffix + "schema-changed",
    SCHEMA: preffix + "schema",
    DEFAULT: preffix,
    SQL: `${preffix}sql`,
    METHOD: `${preffix}method`,
    NOTICE_EV: `${preffix}notice`,
    LISTEN_EV: `${preffix}listen`,
    REGISTER: `${preffix}register`,
    LOGIN: `${preffix}login`,
    LOGOUT: `${preffix}logout`,
    _preffix: preffix,
};
__exportStar(require("./util"), exports);
__exportStar(require("./filters"), exports);
//# sourceMappingURL=index.js.map
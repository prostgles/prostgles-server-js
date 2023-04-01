"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDBSchema = void 0;
const prostgles_types_1 = require("prostgles-types");
const _1 = __importDefault(require("."));
const DboBuilder_1 = require("./DboBuilder");
const validation_1 = require("./JSONBValidation/validation");
const getDBSchema = (dboBuilder) => {
    const tables = [];
    const getColTypeForDBSchema = (udt_name) => {
        if (udt_name === "interval") {
            const units = ["years", "months", "days", "hours", "minutes", "seconds", "milliseconds"];
            return `{ ${units.map(u => `${u}?: number;`).join(" ")} }`;
        }
        return (0, DboBuilder_1.postgresToTsType)(udt_name);
    };
    /** Tables and columns are sorted to avoid infinite loops due to changing order */
    dboBuilder.tablesOrViews?.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(tov => {
        const cols = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
        const getColType = (c) => {
            let type = (c.is_nullable ? "null | " : "") + getColTypeForDBSchema(c.udt_name) + ";";
            const colConf = dboBuilder.prostgles.tableConfigurator?.getColumnConfig(tov.name, c.name);
            if (colConf) {
                if ((0, prostgles_types_1.isObject)(colConf) && (colConf.jsonbSchema || colConf.jsonbSchemaType)) {
                    const schema = colConf.jsonbSchema || { ...colConf, type: colConf.jsonbSchemaType };
                    type = (0, validation_1.getJSONBSchemaTSTypes)(schema, { nullable: colConf.nullable }, "      ", dboBuilder.tablesOrViews ?? []);
                }
                else if ((0, prostgles_types_1.isObject)(colConf) && "enum" in colConf) {
                    if (!colConf.enum)
                        throw "colConf.enum missing";
                    const types = colConf.enum.map(t => typeof t === "number" ? t : JSON.stringify(t));
                    if (colConf.nullable) {
                        types.unshift("null");
                    }
                    type = types.join(" | ");
                }
            }
            return `${(0, DboBuilder_1.escapeTSNames)(c.name)}${c.is_nullable || c.has_default ? "?" : ""}: ${type}`;
        };
        tables.push(`${(0, DboBuilder_1.escapeTSNames)(tov.name)}: {
    is_view: ${tov.is_view};
    select: ${tov.privileges.select};
    insert: ${tov.privileges.insert};
    update: ${tov.privileges.update};
    delete: ${tov.privileges.delete};
    columns: {${cols.map(c => `
      ${getColType(c)}`).join("")}
    };
  };\n  `);
    });
    return `
export type DBSchemaGenerated = {
  ${tables.join("")}
}
`;
};
exports.getDBSchema = getDBSchema;
/** Type checks */
(() => {
    const ddb = 1;
    ddb.dwad?.insert;
    ddb.dwad?.delete;
    const d = 1;
    d.dwad?.insert;
    d.dwad?.delete;
    const p = 1;
    p.dbo.dwad?.insert;
    ddb.dwad?.delete;
    (0, _1.default)({
        dbConnection: 1,
        publish: async (params) => {
            const row = await params.dbo.dwadwa?.find?.({});
            return "*";
        },
        onReady: (dbo) => {
            dbo.tdwa?.find();
        }
    });
    const auth = {
        sidKeyName: "sid_token",
        getUser: async (sid, db, _db) => {
            db.dwadaw?.find;
            return 1;
        }
    };
    /** Test the created schema */
    const c = 1;
    const _test = c;
    const dbt = 1;
    dbt.tx(t => {
        t.tbl1.delete();
    });
    const db = 1;
    db.tx(t => {
        t.wadwa?.find();
    });
    const _publish = () => {
        const r = {
            tbl1: {
                select: {
                    fields: "*",
                    forcedFilter: { col1: 32, col2: "" }
                },
                getColumns: true,
                getInfo: true,
                delete: {
                    filterFields: { col1: 1 }
                }
            },
            tbl2: {
                delete: {
                    filterFields: "*",
                    forcedFilter: { col1: 2 }
                }
            }
        };
        const res = {
            tbl1: {
                select: {
                    fields: "*",
                    forcedFilter: { col1: 32, col2: "" }
                },
                getColumns: true,
                getInfo: true,
                delete: {
                    filterFields: { col1: 1 }
                }
            },
            tbl2: {
                delete: {
                    filterFields: "*",
                    forcedFilter: { col1: 2 }
                }
            }
        };
        const _res1 = r;
        const p = 1;
        p.dbo.dwadaw?.find?.();
        return res;
    };
});

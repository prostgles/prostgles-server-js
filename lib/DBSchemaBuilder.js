"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDBSchema = void 0;
const _1 = __importDefault(require("."));
const DboBuilder_1 = require("./DboBuilder");
const validation_1 = require("./validation");
const getDBSchema = (dboBuilder) => {
    let tables = [];
    /** Tables and columns are sorted to avoid infinite loops due to changing order */
    dboBuilder.tablesOrViews?.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(tov => {
        const cols = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
        const getColType = (c) => {
            let type = (c.is_nullable ? "null | " : "") + (0, DboBuilder_1.postgresToTsType)(c.udt_name) + ";";
            const colConf = dboBuilder.prostgles.tableConfigurator?.getColumnConfig(tov.name, c.name);
            if (colConf && "jsonbSchema" in colConf) {
                type = (0, validation_1.getJSONBSchemaTSTypes)(colConf.jsonbSchema, { nullable: colConf.nullable }, "      ");
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
    ddb.dwad.insert;
    ddb.dwad.delete;
    const d = 1;
    d.dwad.insert;
    d.dwad.delete;
    const p = 1;
    p.dbo.dwad.insert;
    ddb.dwad.delete;
    (0, _1.default)({
        dbConnection: 1,
        publish: async (params) => {
            const row = await params.dbo.dwadwa.find?.({});
            return "*";
        },
        onReady: (dbo) => {
            dbo.tdwa.find();
        }
    });
    const auth = {
        sidKeyName: "sid_token",
        getUser: async (sid, db, _db) => {
            db.dwadaw.find;
            return 1;
        }
    };
    /** Test the created schema */
    const c = 1;
    const test = c;
    const dbt = 1;
    dbt.tx(t => {
        t.tbl1.delete();
    });
    const db = 1;
    db.tx(t => {
        t.wadwa.find();
    });
    const publish = () => {
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
        const res1 = r;
        const p = 1;
        p.dbo.dwadaw.find();
        return res;
    };
});

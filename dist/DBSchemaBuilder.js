"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDBSchema = void 0;
const DboBuilder_1 = require("./DboBuilder");
const getDBSchema = (dboBuilder) => {
    let tables = [];
    /** Tables and columns are sorted to avoid infinite loops due to changing order */
    dboBuilder.tablesOrViews?.slice(0).sort((a, b) => a.name.localeCompare(b.name)).forEach(tov => {
        const cols = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
        tables.push(`${(0, DboBuilder_1.escapeTSNames)(tov.name)}: {
    is_view: ${tov.is_view};
    select: ${tov.privileges.select}
    insert: ${tov.privileges.insert}
    update: ${tov.privileges.update}
    delete: ${tov.privileges.delete}
    dataTypes: { ${cols.map(c => `${(0, DboBuilder_1.escapeTSNames)(c.name)}: ${(0, DboBuilder_1.postgresToTsType)(c.udt_name)}${c.is_nullable ? " | null" : ""}`).join("; ")} };
    columns: {${cols.map(c => `
      ${(0, DboBuilder_1.escapeTSNames)(c.name)}: { type: ${(0, DboBuilder_1.postgresToTsType)(c.udt_name)}; is_nullable: ${c.is_nullable}; is_nullable_or_has_default: ${c.is_nullable || c.has_default}; }`).join(";\n")}
    }
  };\n  `);
    });
    return `
type DBSchema = {
  ${tables.join("")}
}
`;
};
exports.getDBSchema = getDBSchema;
const ccc = {
    col1: "",
    col2: 22
};
/** Type checks */
(() => {
    const ddb = 1;
    ddb.dwad.insert;
    ddb.dwad.delete;
    const p = 1;
    p.dbo.dwad.insert;
    ddb.dwad.delete;
});
/** Test the created schema */
const c = 1;
const test = c;
const db = 1;
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
            delete: { forcedFilter: { col1: 2 } }
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
            delete: { forcedFilter: { col1: 2 } }
        }
    };
    const res1 = r;
    // const res2: PublishFullyTyped = res;
    return res;
};
//# sourceMappingURL=DBSchemaBuilder.js.map
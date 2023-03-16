"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFutureTableSchema = void 0;
const prostgles_types_1 = require("prostgles-types");
const getColumnDefinitionQuery_1 = require("./getColumnDefinitionQuery");
const getConstraintDefinitionQueries_1 = require("./getConstraintDefinitionQueries");
const getFutureTableSchema = async ({ columnDefs, tableName, constraintDefs = [], db }) => {
    let constraints = [];
    let cols = [];
    const ROLLBACK = "Rollback";
    try {
        await db.tx(async (t) => {
            // const { v } = await t.one("SELECT md5(random()::text) as v");
            // /** TODO: create all tables in a random new schema */
            // const randomTableName = `prostgles_constr_${v}`;
            // /* References are removed to avoid potential issues with ftables missing */
            // const columnDefsWithoutReferences = columnDefs.map(cdef => {
            //   const refIdx = cdef.toLowerCase().indexOf(" references ");
            //   if(refIdx < 0) return cdef;
            //   return cdef.slice(0, refIdx);
            // });
            // const query = `CREATE TABLE ${randomTableName} ( 
            //     ${columnDefsWithoutReferences.join(",\n")}
            //   );
            //   ${alterQueries}
            // `;
            const tableEsc = (0, prostgles_types_1.asName)(tableName);
            const consQueries = constraintDefs.map(c => `ALTER TABLE ${tableEsc} ADD ${c.name ? ` CONSTRAINT ${(0, prostgles_types_1.asName)(c.name)}` : ""} ${c.content};`).join("\n");
            const query = `
        DROP TABLE IF EXISTS ${tableEsc} CASCADE;
        CREATE TABLE ${tableEsc} (
          ${columnDefs.join(",\n")}
        );
        ${consQueries}
      `;
            await t.any(query);
            constraints = await (0, getConstraintDefinitionQueries_1.getColConstraints)({ db: t, table: tableName });
            cols = await (0, getColumnDefinitionQuery_1.getTableColumns)({ db: t, table: tableName });
            /** Rollback */
            return Promise.reject(ROLLBACK);
        });
    }
    catch (e) {
        if (e !== ROLLBACK) {
            throw e;
        }
    }
    return { cols, constraints };
};
exports.getFutureTableSchema = getFutureTableSchema;

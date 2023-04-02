"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFutureTableSchema = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const { TransactionMode, isolationLevel } = DboBuilder_1.pgp.txMode;
const getColumnDefinitionQuery_1 = require("./getColumnDefinitionQuery");
const getConstraintDefinitionQueries_1 = require("./getConstraintDefinitionQueries");
const getFutureTableSchema = async ({ columnDefs, tableName, constraintDefs = [], db }) => {
    let constraints = [];
    let cols = [];
    const ROLLBACK = "Rollback";
    try {
        const txMode = new TransactionMode({
            tiLevel: isolationLevel.serializable,
            // deferrable: true
        });
        await db.tx({ mode: txMode }, async (t) => {
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
//# sourceMappingURL=getFutureTableSchema.js.map
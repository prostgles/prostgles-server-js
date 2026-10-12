import { asName } from "prostgles-types";
import { randomUUID } from "crypto";
import { pgp } from "../DboBuilder/DboBuilder";
import type { DB } from "../Prostgles";
import type { ColumnMinimalInfo } from "./getColumnSQLDefinitionQuery";
import { getTableColumns } from "./getColumnSQLDefinitionQuery";
import type { ConstraintDef } from "./getConstraintDefinitionQueries";
import { type PGConstraint, fetchTableConstraints } from "./fetchTableConstraints";
import type pgPromise from "pg-promise";

type Args = {
  db: DB;
  columnDefs: string[];
  tableName: string;
  constraintDefs?: ConstraintDef[];
};

/**
 * Given a table name, column definitions and constraint definitions,
 * returns resulting column definitions and constraints of the table
 */
export const getFutureTableSchema = async ({
  columnDefs,
  tableName,
  constraintDefs = [],
  db,
}: Args): Promise<{
  constraints: PGConstraint[];
  cols: ColumnMinimalInfo[];
}> => {
  const { constraints, cols } = await executeSqlWithRollback(db, async (t) => {
    // Keep table and constraint names without dropping the live table.
    const schemaName = `prostgles_inspect_${randomUUID().replaceAll("-", "")}`;
    await t.none(`CREATE SCHEMA ${asName(schemaName)}`);
    await t.one(
      "SELECT set_config('search_path', quote_ident($1) || ', ' || current_setting('search_path'), true)",
      [schemaName],
    );
    const tableEsc = asName(tableName);

    const consQueries = constraintDefs
      .map(
        (c) =>
          `ALTER TABLE ${tableEsc} ADD ${c.name ? ` CONSTRAINT ${asName(c.name)}` : ""} ${c.content};`,
      )
      .join("\n");

    const query = `
        CREATE TABLE ${tableEsc} (
          ${columnDefs.join(",\n")}
        );
        ${consQueries}
      `;

    await t.any(query);

    const constraints = await fetchTableConstraints({ db: t, table: tableName });
    const cols = await getTableColumns({ db: t, table: tableName });

    return { constraints, cols };
  }).catch((e) => {
    console.error("Error in getFutureTableSchema for " + tableName, e);
    throw e;
  });

  return { cols, constraints };
};

export const executeSqlWithRollback = async <R>(
  db: DB,
  txHandler: (t: pgPromise.ITask<{}>) => Promise<R>,
): Promise<R> => {
  const { TransactionMode, isolationLevel } = pgp.txMode;

  const txMode = new TransactionMode({
    tiLevel: isolationLevel.serializable,
  });
  const res = await db.tx({ mode: txMode }, async (t) => {
    const result = await txHandler(t);
    await t.any("ROLLBACK");
    return result;
  });
  return res;
};

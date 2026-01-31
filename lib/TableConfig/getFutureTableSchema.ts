import { asName } from "prostgles-types";
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
    /** To prevent deadlocks we use a random table name -> Not feasible because named constraints cannot be recreated without dropping the existing ones from actual table */
    // const tableEsc = asName(tableName.slice(0, 12) + (await t.oneOrNone(`SELECT md5(now()::text) as md5`)).md5);

    const tableEsc = asName(tableName);

    const consQueries = constraintDefs
      .map(
        (c) =>
          `ALTER TABLE ${tableEsc} ADD ${c.name ? ` CONSTRAINT ${asName(c.name)}` : ""} ${c.content};`,
      )
      .join("\n");

    const query = `
        DROP TABLE IF EXISTS ${tableEsc} CASCADE;
        CREATE TABLE ${tableEsc} (
          ${columnDefs.join(",\n")}
        );
        ${consQueries}
      `;

    await t.any(query);

    const constraints = await fetchTableConstraints({ db: t, table: tableName });
    const cols = await getTableColumns({ db: t, table: tableName });

    return { constraints, cols };
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

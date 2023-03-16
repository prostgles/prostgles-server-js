import { asName } from "prostgles-types";
import { DB } from "../Prostgles";
import { log } from "../PubSubManager/PubSubManager";
import { ColumnMinimalInfo, getTableColumns } from "./getColumnDefinitionQuery";
import { ColConstraint, ConstraintDef, getColConstraints } from "./getConstraintDefinitionQueries";

type Args = {
  db: DB, 
  columnDefs: string[]; 
  tableName: string;
  constraintDefs?: ConstraintDef[];
};

export const getFutureTableSchema = async ({ columnDefs, tableName, constraintDefs = [], db }: Args): Promise<{
  constraints: ColConstraint[];
  cols: ColumnMinimalInfo[];
}> => {

  let constraints: ColConstraint[] = [];
  let cols: ColumnMinimalInfo[] = [];
  const ROLLBACK = "Rollback";
  try {
    await db.tx(async t => {
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

      const tableEsc = asName(tableName); 

      const consQueries = constraintDefs.map(c => 
        `ALTER TABLE ${tableEsc} ADD ${c.name? ` CONSTRAINT ${asName(c.name)}` : ""} ${c.content};`
      ).join("\n");

      const query = `
        DROP TABLE IF EXISTS ${tableEsc} CASCADE;
        CREATE TABLE ${tableEsc} (
          ${columnDefs.join(",\n")}
        );
        ${consQueries}
      `

      await t.any(query);
      constraints = await getColConstraints({ db: t, table: tableName });
      cols = await getTableColumns({ db: t, table: tableName });
 
      /** Rollback */
      return Promise.reject(ROLLBACK);
    });

  } catch(e){
    if(e !== ROLLBACK) {
      throw e;
    }
  }

  return { cols, constraints };
}
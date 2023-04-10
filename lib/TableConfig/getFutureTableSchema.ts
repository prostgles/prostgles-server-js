import { asName } from "prostgles-types";
import { pgp } from "../DboBuilder";
import { DB } from "../Prostgles";
const {TransactionMode, isolationLevel} = pgp.txMode;
import { ColumnMinimalInfo, getTableColumns } from "./getColumnDefinitionQuery";
import { ColConstraint, ConstraintDef, getColConstraints } from "./getConstraintDefinitionQueries";

type Args = {
  db: DB, 
  columnDefs: string[]; 
  tableName: string;
  constraintDefs?: ConstraintDef[];
};

let lastTable = "";
export const getFutureTableSchema = async ({ columnDefs, tableName, constraintDefs = [], db }: Args): Promise<{
  constraints: ColConstraint[];
  cols: ColumnMinimalInfo[];
}> => {
  if(lastTable){
    console.trace(tableName)
  }
  console.time(`getFutureTableSchema ${tableName }`);
  lastTable = tableName;
  let constraints: ColConstraint[] = [];
  let cols: ColumnMinimalInfo[] = [];
  const ROLLBACK = "Rollback";
  try {
    const txMode = new TransactionMode({
      tiLevel: isolationLevel.serializable
    });
    await db.tx({ mode: txMode }, async t => {

      /** To prevent deadlocks we use a random table name -> Not feasible because named constraints cannot be recreated without dropping the existing ones from actual table */
      // const tableEsc = asName(tableName.slice(0, 12) + (await t.oneOrNone(`SELECT md5(now()::text) as md5`)).md5); 
      
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
      `;

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
  
  console.timeEnd(`getFutureTableSchema ${tableName }`);
  lastTable = "";
  return { cols, constraints };
}
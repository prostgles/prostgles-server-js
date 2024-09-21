import { tryCatch } from "prostgles-types";
import { getPubSubManagerInitQuery } from "./getPubSubManagerInitQuery";
import { getCanExecute } from "../DboBuilder/dboBuilderUtils";
import { DboBuilder } from "../DboBuilder/DboBuilder";

export const getCreatePubSubManagerError = async (dboBuilder: DboBuilder): Promise<string | undefined> => {
  const db = dboBuilder.db;
  const canExecute = await getCanExecute(db)
  if (!canExecute) return "Cannot run EXECUTE statements on this connection";

  /** Check if prostgles schema exists */
  const prglSchema = await db.any(`
    SELECT *
    FROM pg_catalog.pg_namespace
    WHERE nspname = 'prostgles'
  `);

  const checkIfCanCreateProstglesSchema = () => tryCatch(async () => {
    const allGood = await db.tx(async t => {
      await t.none(`
        CREATE SCHEMA IF NOT EXISTS prostgles;
        ROLLBACK;
      `);

      return true;
    });

    return allGood;
  });

  if (!prglSchema.length) {
    const canCreate = await checkIfCanCreateProstglesSchema();
    if (!canCreate) {
      const dbName = await db.one(`SELECT current_database()`);
      const user = await db.one(`SELECT current_user`);
      return `Not allowed to create prostgles schema. GRANT CREATE ON DATABASE ${dbName} TO ${user}`;
    }
    return undefined;
  }

  const initQuery = await tryCatch(async () => ({ query: await getPubSubManagerInitQuery.bind(dboBuilder)() }));
  if(initQuery.hasError){
    console.error(initQuery.error);
    return "Could not get initQuery. Check logs";
  }

  if(!initQuery.query){
    return undefined;
  }

  return undefined;
}
import { tryCatch, tryCatchV2 } from "prostgles-types";
import { getPubSubManagerInitQuery } from "./init/getPubSubManagerInitQuery";
import { getCanExecute } from "../DboBuilder/dboBuilderUtils";
import { DboBuilder } from "../DboBuilder/DboBuilder";

export const getCreatePubSubManagerError = async (
  dboBuilder: DboBuilder
): Promise<string | undefined> => {
  const db = dboBuilder.db;

  const canExecute = await getCanExecute(db);
  if (!canExecute) return "Cannot run EXECUTE statements on this connection";

  /** Check if prostgles schema exists */
  const prglSchema = await db.any(`
    SELECT *
    FROM pg_catalog.pg_namespace
    WHERE nspname = 'prostgles'
  `);

  const checkIfCanCreateProstglesSchema = () =>
    tryCatchV2(async () => {
      const allGood = await db.task(async (t) => {
        try {
          await t.none(`
          BEGIN;
          DROP SCHEMA IF EXISTS prostgles CASCADE;
          CREATE SCHEMA IF NOT EXISTS prostgles;
          ROLLBACK;
        `);
        } catch (e) {
          await t.none(`ROLLBACK`);
          return false;
        }

        return true;
      });

      return allGood;
    });

  if (!prglSchema.length) {
    const { data: canCreate } = await checkIfCanCreateProstglesSchema();
    if (!canCreate) {
      const dbName = await db.one(`SELECT current_database()`);
      const user = await db.one(`SELECT current_user`);
      return `Not allowed to create prostgles schema. GRANT CREATE ON DATABASE ${dbName} TO ${user}`;
    }
    return undefined;
  } else {
    const canCheckVersion = await tryCatchV2(async () => {
      await db.any(`
        SELECT * FROM prostgles.versions
      `);
      return { ok: true };
    });

    if (!canCheckVersion.data?.ok) {
      console.error(
        "prostgles schema exists but cannot check version. Check logs",
        canCheckVersion.error
      );
      return "prostgles schema exists but cannot check version. Check logs";
    }
  }

  const initQuery = await tryCatchV2(async () => ({
    query: await getPubSubManagerInitQuery.bind(dboBuilder)(),
  }));
  if (initQuery.hasError) {
    console.error(initQuery.error);
    return "Could not get initQuery. Check logs";
  }

  if (!initQuery.data.query) {
    return undefined;
  }

  return undefined;
};

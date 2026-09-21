import type pgPromise from "pg-promise";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";
import { fetchTableConstraints } from "./fetchTableConstraints";
import { getTableConfigVersion } from "./getTableConfigVersion";

export async function runMigrations(
  t: pgPromise.ITask<{}>,
  {
    tableConfigMigrations,
    tableConfig,
  }: Pick<ProstglesInitOptions, "tableConfigMigrations" | "tableConfig">,
  { asName }: { asName: (name: string) => string },
) {
  if (!tableConfigMigrations) return;

  const { onMigrate, version, versionTableName = "schema_version" } = tableConfigMigrations;
  await t.any(`
    /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
    CREATE TABLE IF NOT EXISTS ${asName(versionTableName)}(
      id NUMERIC PRIMARY KEY, 
      table_config JSONB NOT NULL
    )
  `);
  const migrations = { version, table: versionTableName };
  const latestVersion = getTableConfigVersion(
    (
      await t.oneOrNone<{ v: string | null }>(
        `SELECT MAX(id) as v FROM ${asName(versionTableName)}`,
      )
    )?.v,
  );

  if (latestVersion === version) {
    const isLatest = (
      await t.oneOrNone<{ v: string | null }>(
        `
        SELECT table_config = \${tableConfig} as v 
        FROM ${asName(versionTableName)} 
        WHERE id = \${version}`,
        { version, tableConfig },
      )
    )?.v;
    if (isLatest) {
      /**
       * If the table config is the same as the latest version then we can skip all schema checks and changes
       */
      return;
    }
  }
  if (latestVersion !== undefined && latestVersion < version) {
    await onMigrate({
      db: t,
      oldVersion: latestVersion,
      getConstraints: (table, col, types) =>
        fetchTableConstraints({ db: t, table, column: col, types }),
    });
  }

  return migrations;
}

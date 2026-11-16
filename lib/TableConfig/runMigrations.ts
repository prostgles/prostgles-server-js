import type pgPromise from "pg-promise";
import { asName } from "prostgles-types";
import type { ProstglesInitOptions } from "../ProstglesTypes";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";
import { fetchTableConstraints } from "./fetchTableConstraints";
import { getTableConfigVersion } from "./getTableConfigVersion";
import { runNumberedMigrations } from "./runNumberedMigrations";

/** Called inside the transaction that also reconciles the schema and triggers. */
export const runMigrations = async (
  transaction: pgPromise.ITask<{}>,
  {
    tableConfigMigrations,
    tableConfig,
  }: Pick<ProstglesInitOptions, "tableConfigMigrations" | "tableConfig">,
) => {
  if (!tableConfigMigrations) return;

  const { versionTableName = "schema_version" } = tableConfigMigrations;
  if (tableConfig?.[versionTableName]) {
    throw new Error(`Table ${versionTableName} is reserved for migration history`);
  }
  if (!versionTableName || Buffer.byteLength(versionTableName) > 63) {
    throw new Error("Migration versionTableName must contain 1-63 bytes");
  }
  const versionTable = asName(versionTableName);
  await transaction.none(`
    /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
    CREATE TABLE IF NOT EXISTS ${versionTable} (
      id NUMERIC PRIMARY KEY,
      table_config JSONB NOT NULL
    )
  `);
  const { version: storedVersion } = await transaction.one<{
    version: string | null;
  }>(`SELECT MAX(id) AS version FROM ${versionTable}`);
  const latestVersion = getTableConfigVersion(storedVersion);
  if (storedVersion !== null && latestVersion === undefined) {
    throw new Error(`Invalid stored migration version: ${storedVersion}`);
  }
  if (tableConfigMigrations.migrations) {
    return runNumberedMigrations(transaction, {
      ...tableConfigMigrations,
      versionTable,
      tableConfig: tableConfig ?? {},
      latestVersion,
    });
  }
  const { version, onMigrate } = tableConfigMigrations;
  if (!Number.isFinite(version) || version < 0) {
    throw new Error("Migration version must be a finite non-negative number");
  }
  if (latestVersion !== undefined && latestVersion > version) {
    throw new Error(
      `Database migration version ${latestVersion} is newer than requested version ${version}`,
    );
  }
  if (latestVersion !== undefined && latestVersion < version) {
    await onMigrate({
      db: transaction,
      oldVersion: latestVersion,
      getConstraints: (table, column, types) =>
        fetchTableConstraints({ db: transaction, table, column, types }),
    });
  }
  return async () => {
    await transaction.none(
      `INSERT INTO ${versionTable} (id, table_config) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [version, tableConfig ?? {}],
    );
  };
};

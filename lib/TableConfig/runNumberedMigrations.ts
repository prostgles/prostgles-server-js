import type pgPromise from "pg-promise";
import type { NumberedTableConfigMigrations } from "../ProstglesTypes";
import type { TableConfig } from "./TableConfigTypes";
import { fetchTableConstraints } from "./fetchTableConstraints";
import { getNumberedMigrations } from "./getNumberedMigrations";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "../PubSubManager/PubSubManagerUtils";

export const runNumberedMigrations = async (
  transaction: pgPromise.ITask<{}>,
  {
    migrations,
    baseline,
    versionTable,
    tableConfig,
    latestVersion,
  }: NumberedTableConfigMigrations & {
    versionTable: string;
    tableConfig: TableConfig;
    latestVersion: number | undefined;
  },
) => {
  const numberedMigrations = getNumberedMigrations(migrations);
  const lastMigration = numberedMigrations.at(-1);
  if (!lastMigration) throw new Error("At least one numbered migration is required");
  if (latestVersion !== undefined && latestVersion > lastMigration.version) {
    throw new Error(
      `Database migration version ${latestVersion} is newer than requested version ${lastMigration.version}`,
    );
  }
  if (
    baseline !== undefined &&
    (!Number.isSafeInteger(baseline) ||
      baseline < 0 ||
      (baseline !== 0 && !numberedMigrations.some(({ version }) => version === baseline)))
  ) {
    throw new Error("Migration baseline must be 0 or an existing migration version");
  }
  await transaction.none(`
    /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
    ALTER TABLE ${versionTable}
      ADD COLUMN IF NOT EXISTS name TEXT,
      ADD COLUMN IF NOT EXISTS checksum TEXT,
      ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS baselined BOOLEAN NOT NULL DEFAULT false
  `);
  const history = await transaction.any<{
    id: string;
    name: string | null;
    checksum: string | null;
  }>(`SELECT id, name, checksum FROM ${versionTable} ORDER BY id`);
  const appliedMigrations = history.filter((row) => row.name !== null);
  const hasLegacyHistory = history.some((row) => row.name === null);
  let baselineVersion: number | undefined;
  if (!appliedMigrations.length) {
    const { exists: hasExistingTables } = await transaction.one<{
      exists: boolean;
    }>(
      `
      SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p') AND left(n.nspname, 3) <> 'pg_'
          AND n.nspname NOT IN ('information_schema', 'prostgles')
          AND c.oid <> to_regclass($1)
      ) AS exists
    `,
      [versionTable],
    );
    if ((hasExistingTables || hasLegacyHistory) && baseline === undefined) {
      throw new Error(
        "Existing database has no numbered migration history; specify an explicit baseline",
      );
    }
    baselineVersion = baseline ?? lastMigration.version;
    if (latestVersion !== undefined && baselineVersion < latestVersion) {
      throw new Error(
        `Migration baseline ${baselineVersion} is older than database version ${latestVersion}`,
      );
    }
  } else {
    if (hasLegacyHistory) throw new Error("Migration history mixes numbered and legacy entries");
    if (baseline !== undefined && latestVersion !== undefined && baseline > latestVersion) {
      throw new Error(
        "Cannot baseline pending migrations after numbered history has been established",
      );
    }
    for (const applied of appliedMigrations) {
      const file = numberedMigrations.find(({ version }) => version === Number(applied.id));
      if (
        !file ||
        file.migration.name !== applied.name ||
        file.migration.checksum !== applied.checksum
      ) {
        throw new Error(`Applied migration ${applied.name} is missing or modified`);
      }
    }
    for (const { version, migration } of numberedMigrations) {
      if (
        latestVersion !== undefined &&
        version <= latestVersion &&
        !appliedMigrations.some((applied) => Number(applied.id) === version)
      ) {
        throw new Error(`Migration ${migration.name} was inserted below the applied version`);
      }
    }
  }
  const pendingMigrations = numberedMigrations.filter(
    ({ version }) => !appliedMigrations.some((applied) => Number(applied.id) === version),
  );
  let oldVersion = baselineVersion ?? latestVersion;
  for (const { version, migration } of pendingMigrations) {
    if (baselineVersion !== undefined && version <= baselineVersion) continue;
    await migration.run({
      db: transaction,
      oldVersion,
      getConstraints: (table, column, types) =>
        fetchTableConstraints({ db: transaction, table, column, types }),
    });
    oldVersion = version;
  }
  return async () => {
    if (hasLegacyHistory) await transaction.none(`DELETE FROM ${versionTable} WHERE name IS NULL`);
    for (const { version, migration } of pendingMigrations) {
      await transaction.none(
        `INSERT INTO ${versionTable} (id, table_config, name, checksum, baselined) VALUES ($1, $2, $3, $4, $5)`,
        [
          version,
          tableConfig,
          migration.name,
          migration.checksum,
          baselineVersion !== undefined && version <= baselineVersion,
        ],
      );
    }
  };
};

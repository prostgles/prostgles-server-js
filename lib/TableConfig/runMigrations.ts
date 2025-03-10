import { PubSubManager } from "../PubSubManager/PubSubManager";
import { getColConstraints } from "./getConstraintDefinitionQueries";
import TableConfigurator from "./TableConfig";

export async function runMigrations(
  this: TableConfigurator,
  { asName }: { asName: (name: string) => string }
) {
  const { tableConfigMigrations } = this.prostgles.opts;
  if (!tableConfigMigrations) return;

  const { onMigrate, version, versionTableName = "schema_version" } = tableConfigMigrations;
  await this.db.any(`
      /* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
      CREATE TABLE IF NOT EXISTS ${asName(versionTableName)}(id NUMERIC PRIMARY KEY, table_config JSONB NOT NULL)
    `);
  const migrations = { version, table: versionTableName };
  const maxVersion = +(
    await this.db.oneOrNone(`SELECT MAX(id) as v FROM ${asName(versionTableName)}`)
  ).v;
  const latestVersion = Number.isFinite(maxVersion) ? maxVersion : undefined;

  if (latestVersion === version) {
    const isLatest = (
      await this.db.oneOrNone(
        `SELECT table_config = \${table_config} as v FROM ${asName(versionTableName)} WHERE id = \${version}`,
        { version, table_config: this.config }
      )
    ).v;
    if (isLatest) {
      /**
       * If the table config is the same as the latest version then we can skip all schema checks and changes
       */
      return;
    }
  }
  if (latestVersion !== undefined && latestVersion < version) {
    await onMigrate({
      db: this.db,
      oldVersion: latestVersion,
      getConstraints: (table, col, types) =>
        getColConstraints({ db: this.db, table, column: col, types }),
    });
  }

  return migrations;
}

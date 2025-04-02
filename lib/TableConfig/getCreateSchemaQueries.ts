import type pgPromise from "pg-promise";
import { asName } from "prostgles-types";
import type { DB } from "../initProstgles";
import type { ProstglesInitOptions, TableConfigMigrations } from "../ProstglesTypes";
import { getColConstraints } from "./getConstraintDefinitionQueries";
import type { TableConfig } from "./TableConfig";
export type RequiredUndefined<T> = {
  [K in keyof Required<T>]: T[K];
};
export type SchemaRelatedOptions = Pick<
  RequiredUndefined<ProstglesInitOptions>,
  "tableConfigMigrations" | "tableConfig" | "fileTable" | "sqlFilePath" | "onLog"
>;

export const tableConfigWithMigrations = async (
  db: DB,
  { tableConfig, tableConfigMigrations }: SchemaRelatedOptions,
  file_table_schema: string
) => {
  if (!tableConfigMigrations) return { config: tableConfig };
  const { versionTableName = "schema_version" } = tableConfigMigrations;

  if (tableConfig?.[versionTableName]) {
    throw new Error(
      `Table "${versionTableName}" is reserved for version tracking. Please use a different name in tableConfig.`
    );
  }

  const newConfig = {
    ...tableConfig,
    [versionTableName]: {
      columns: {
        id: `id NUMERIC PRIMARY KEY`,
        table_config: `JSONB NOT NULL`,
        file_table_queries: `TEXT`,
        migrated_at: `TIMESTAMP DEFAULT NOW()`,
      },
    },
  };

  return {
    newConfig,
    migrate: await getMigration(
      db,
      versionTableName,
      newConfig,
      tableConfigMigrations,
      file_table_schema
    ),
  };
};

/**
 * If migrations are setup
 * AND the latest version is less than the current version
 * THEN will return the migration function
 */
const getMigration = async (
  db: DB,
  versionTableName: string,
  tableConfig: TableConfig,
  { version, onMigrate }: Pick<TableConfigMigrations, "version" | "onMigrate">,
  file_table_queries: string
) => {
  const maxVersion = Number(
    (await db.oneOrNone<{ v: string }>(`SELECT MAX(id) as v FROM ${asName(versionTableName)}`))?.v
  );
  const latestVersion = Number.isFinite(maxVersion) ? maxVersion : undefined;

  if (latestVersion === version) {
    const isLatest = (
      await db.oneOrNone<{ v: string | null }>(
        `
          SELECT 1 as v 
          FROM ${asName(versionTableName)} 
          WHERE id = \${version}
          AND table_config = \${table_config}
          AND file_table_queries = \${file_table_queries}
        `,
        { version, table_config: tableConfig, file_table_queries }
      )
    )?.v;

    if (isLatest) {
      /**
       * If the table config is the same as the latest version then we can skip all schema checks and changes
       */
      return {
        schemaIsUpToDate: true,
      };
    }
  }

  const finishMigration = async (t: pgPromise.ITask<{}>) => {
    await t.none(
      `INSERT INTO ${asName(versionTableName)} (id, table_config, file_table_queries) VALUES (\${version}, \${table_config}, \${file_table_queries})`,
      { version, table_config: tableConfig, file_table_queries }
    );
  };

  if (latestVersion === undefined) {
    return {
      runMigration: (t: pgPromise.ITask<{}>) => {
        return {
          finishMigration: () => finishMigration(t),
        };
      },
    };
  }

  if (latestVersion < version) {
    return {
      runMigration: async (t: pgPromise.ITask<{}>) => {
        await onMigrate({
          db: t,
          oldVersion: latestVersion,
          getConstraints: (table, col, types) =>
            getColConstraints({ db: t, table, column: col, types }),
        });

        return {
          finishMigration: () => finishMigration(t),
        };
      },
    };
  }
};

import type { ColumnInfo } from "prostgles-types";
import { isObject } from "prostgles-types";
import type { DB, DBHandlerServerInternal, Prostgles } from "../Prostgles";
import {
  DEFAULT_SYNC_BATCH_SIZE,
  DEFAULT_SYNC_THROTTLE,
} from "../PubSubManager/PubSubManagerUtils";
import { initTableConfig } from "./initTableConfig";
import { runSQLFile } from "./runSQLFile";
import { syncTableTriggers } from "./syncTableTriggers";
import { runMigrations } from "./runMigrations";
import { getTablesForSchemaPostgresSQL } from "../DboBuilder/schema/getTablesForSchemaPostgresSQL";
import type { ColExtraInfo, ColumnConfig, LangToTranslation } from "./TableConfigTypes";

/**
 * Runs after initSQL  
 */
export class TableConfigurator {
  instanceId = Date.now() + Math.random();

  get config() {
    return this.prostgles.mergedTableConfig.tableConfig ?? {};
  }
  get dbo(): DBHandlerServerInternal {
    if (!this.prostgles.dbo) throw "this.prostgles.dbo missing";
    return this.prostgles.dbo;
  }
  get db(): DB {
    if (!this.prostgles.dbForSchema) throw "Schema database connection missing";
    return this.prostgles.dbForSchema;
  }
  prostgles: Prostgles;
  managedTriggerPrefixes: string[];

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    this.managedTriggerPrefixes = prostgles.tableConfigurator?.managedTriggerPrefixes ?? [];
  }

  destroy = async () => {
    for (const { onUnmount } of Object.values(this.tableOnMounts)) {
      try {
        await onUnmount();
      } catch (error) {
        console.error(error);
      }
    }
  };

  tableOnMounts: Record<string, { onUnmount: () => void | Promise<void> }> = {};
  setTableOnMounts = async () => {
    this.tableOnMounts = {};
    for (const [tableName, tableConfig] of Object.entries(this.config)) {
      if ("onMount" in tableConfig && tableConfig.onMount) {
        const cleanup = await tableConfig.onMount({
          dbo: this.dbo,
          _db: this.db,
        });
        if (cleanup) {
          this.tableOnMounts[tableName] = cleanup;
        }
      }
    }
  };

  getColumnConfig = (tableName: string, colName: string): ColumnConfig | undefined => {
    const tableConfig = this.config[tableName];
    if (tableConfig && "columns" in tableConfig) {
      return tableConfig.columns?.[colName];
    }
    return undefined;
  };

  getTableSyncConfig = (tableName: string) => {
    const syncConfig = this.config[tableName]?.syncConfig;
    return (
      syncConfig && {
        ...syncConfig,
        batch_size: syncConfig.batch_size ?? DEFAULT_SYNC_BATCH_SIZE,
        throttle: syncConfig.throttle ?? DEFAULT_SYNC_THROTTLE,
      }
    );
  };

  getTableLabel = (params: { tableName: string; lang?: string }) => {
    const tableConfig = this.config[params.tableName];

    return parseI18N({
      config: tableConfig?.info?.label,
      lang: params.lang,
      defaultLang: "en",
      defaultValue: params.tableName,
    });
  };

  getColInfo = (params: {
    col: string;
    table: string;
    lang?: string;
  }): (ColExtraInfo & { label?: string } & Pick<ColumnInfo, "jsonbSchema">) | undefined => {
    const columnConfig = this.getColumnConfig(params.table, params.col);
    let result: Partial<ReturnType<typeof this.getColInfo>> = undefined;
    if (isObject(columnConfig)) {
      const { lang = "en" } = params;
      const { jsonbSchema, jsonbSchemaType, info, label } = columnConfig;
      const labelFromConfig = isObject(label) ? (label[lang as "en"] ?? label.en) : label;
      result = {
        ...info,
        ...((jsonbSchema || jsonbSchemaType) && {
          jsonbSchema: {
            nullable: columnConfig.nullable,
            ...(jsonbSchema || { type: jsonbSchemaType }),
          },
        }),
        ...(!labelFromConfig ? undefined : (
          {
            label: labelFromConfig,
          }
        )),
      };
    }

    return result;
  };

  checkColVal = (params: { col: string; table: string; value?: number | string }): void => {
    const conf = this.getColInfo(params);
    if (conf) {
      const { value } = params;
      const { min, max } = conf;
      if (min !== undefined && value !== undefined && value < min)
        throw `${params.col} must be greater than ${min}`;
      if (max !== undefined && value !== undefined && value > max)
        throw `${params.col} must be less than ${max}`;
    }
  };

  prevInitQueryHistory?: string[];
  initialising = false;
  init = () =>
    this.prostgles.runSchemaQueries(async () => {
      if (this.prostgles.opts.audit) {
        const minimumAuditMajor = 14;
        const { major } = await this.db.one<{ major: number }>(
          "SELECT current_setting('server_version_num')::int / 10000 AS major",
        );
        if (major < minimumAuditMajor) {
          throw new Error(
            `Audit requires PostgreSQL ${minimumAuditMajor} or later. Connected to PostgreSQL ${major}.`,
          );
        }
      }
      await runSQLFile(this.prostgles);
      this.prostgles.preparingTableConfig = true;
      try {
        if (this.prostgles.opts.tableConfigMigrations) {
          const queryHistory = await this.db.tx(async (transaction) => {
            await transaction.any(
              "SELECT pg_advisory_xact_lock(hashtextextended('prostgles.tableConfig.migrations', 0))",
            );
            const finishMigration = await runMigrations(transaction, {
              ...this.prostgles.opts,
              tableConfig: this.config,
            });
            const queries = await initTableConfig.call(this, transaction);
            const { result: tables } = await getTablesForSchemaPostgresSQL(
              { db: transaction },
              { schemaFilter: this.prostgles.opts.schemaFilter },
            );
            await syncTableTriggers(this, transaction, tables);
            await finishMigration?.();
            return queries;
          });
          if (queryHistory.length) this.prevInitQueryHistory = queryHistory;
        } else {
          await this.prostgles.rebuildDBO();
          await initTableConfig.call(this);
        }
      } finally {
        this.prostgles.preparingTableConfig = false;
        this.initialising = false;
      }
      if (this.prostgles.opts.tableConfigMigrations) {
        await this.prostgles.rebuildDBO();
      } else {
        await this.syncTriggers();
      }
    });

  refresh = () =>
    this.prostgles.runSchemaQueries(async () => {
      await this.prostgles.rebuildDBO();
      await this.syncTriggers();
    });

  sync = () =>
    this.prostgles.runSchemaQueries(async () => {
      await syncTableTriggers(this);
      const hooks = this.prostgles.mergedTableConfig.tableHooks;
      for (const table of this.prostgles.dboBuilder.dboMap.values()) {
        table.hooks = hooks?.[table.name];
      }
    });

  private syncTriggers = async () => {
    await syncTableTriggers(this);
    if (this.prostgles.opts.audit) await this.prostgles.rebuildDBO();
  };
}

export const parseI18N = <Config extends LangToTranslation>(params: {
  config?: Config | string;
  lang?: string;
  defaultLang: string;
  defaultValue: string | undefined;
}): undefined | string => {
  const { config, lang, defaultLang, defaultValue } = params;
  if (config) {
    if (isObject(config)) {
      return config[lang ?? defaultLang] ?? config[defaultLang];
    } else if (typeof config === "string") {
      return config;
    }
  }

  return defaultValue;
};

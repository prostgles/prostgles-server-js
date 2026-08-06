import type { ColumnInfo } from "prostgles-types";
import { isObject } from "prostgles-types";
import type { JoinInfo } from "../DboBuilder/DboBuilder";
import type { DB, DBHandlerServer, Prostgles } from "../Prostgles";
import {
  DEFAULT_SYNC_BATCH_SIZE,
  DEFAULT_SYNC_THROTTLE,
} from "../PubSubManager/PubSubManagerUtils";
import { initTableConfig } from "./initTableConfig";
import type { ColExtraInfo, ColumnConfig, LangToTranslation } from "./TableConfigTypes";

/**
 * Runs after initSQL  
 */
export class TableConfigurator {
  instanceId = Date.now() + Math.random();

  get config() {
    return this.prostgles.mergedTableConfig ?? {};
  }
  get dbo(): DBHandlerServer {
    if (!this.prostgles.dbo) throw "this.prostgles.dbo missing";
    return this.prostgles.dbo;
  }
  get db(): DB {
    if (!this.prostgles.db) throw "this.prostgles.db missing";
    return this.prostgles.db;
  }
  prostgles: Prostgles;

  constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
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

  getJoinInfo = (sourceTable: string, targetTable: string): JoinInfo | undefined => {
    const sourceTableConfig = this.config[sourceTable];
    if (sourceTableConfig && "columns" in sourceTableConfig) {
      const targetColConfig = sourceTableConfig.columns?.[targetTable];
      if (targetColConfig) {
        if (isObject(targetColConfig) && "joinDef" in targetColConfig) {
          if (!targetColConfig.joinDef) throw "targetColConfig.joinDef missing";
          const { joinDef } = targetColConfig;
          const res: JoinInfo = {
            expectOne: false,
            paths: joinDef.map(({ sourceTable, targetTable: table, on }) => ({
              source: sourceTable,
              target: targetTable,
              table,
              on,
            })),
          };

          return res;
        }
      }
    }
    return undefined;
  };

  prevInitQueryHistory?: string[];
  initialising = false;
  init = initTableConfig.bind(this);
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

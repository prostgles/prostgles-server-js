import { md5 } from "prostgles-types/dist/md5";
import type { Prostgles } from "../Prostgles";
import type {
  TableConfig,
  TableDefinition,
} from "../TableConfig/TableConfigTypes";

import { AUDIT_TABLE_COLUMN_DEFINITIONS } from "./AuditTable";
import {
  AUDIT_HISTORY_PROTECTION_PREFIX,
  AUDIT_TRUNCATE_PROTECTION_PREFIX,
  AUDIT_WRITER_PREFIX,
} from "../TableConfig/managedTriggerNames";

export type ParsedAuditConfig = {
  /** Includes previously configured history tables, whose protection is retained. */
  auditTableNames: string[];
  tableConfigs: TableConfig;
};

export function getAuditProtection(
  tableName: string,
  actions: NonNullable<TableDefinition["triggers"]>[string]["actions"],
): NonNullable<TableDefinition["triggers"]> {
  return {
    [(actions.includes("update")
      ? AUDIT_HISTORY_PROTECTION_PREFIX
      : AUDIT_TRUNCATE_PROTECTION_PREFIX) + md5(tableName)]: {
      type: "before",
      actions,
      forEach: "statement",
      query:
        "BEGIN RAISE EXCEPTION 'Audit protection: % is not allowed on %.%', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME; END;",
    },
  };
}

/** Adds audit definitions to the same config used for file tables and application tables. */
export function getAuditTableConfig(
  prgl: Prostgles,
  tableConfig: TableConfig | undefined,
): TableConfig | undefined {
  const { audit } = prgl.opts;
  let result = { ...tableConfig };
  if (audit) {
    const { tableName } = audit;
    if (typeof tableName !== "string" || !tableName)
      throw new Error("audit.tableName is required");
    if (tableConfig?.[tableName]) {
      throw new Error("The audit table cannot also be defined in tableConfig");
    }
    result = {
      [tableName]: {
        columns: AUDIT_TABLE_COLUMN_DEFINITIONS,
        triggers: getAuditProtection(tableName, ["update", "delete", "truncate"]),
      },
      ...result,
    };
  }
  for (const [name, config] of Object.entries(
    prgl.parsedAuditConfig?.tableConfigs ?? {},
  )) {
    result[name] = {
      ...result[name],
      triggers: { ...result[name]?.triggers, ...config.triggers },
    };
  }
  return Object.keys(result).length ? result : undefined;
}

export function isAuditTable(prgl: Prostgles, tableName: string): boolean {
  return prgl.parsedAuditConfig?.auditTableNames.includes(tableName) ?? false;
}

export const getAuditWriterName = (auditTable: string, sourceTable: string) =>
  AUDIT_WRITER_PREFIX + md5(JSON.stringify([auditTable, sourceTable]));

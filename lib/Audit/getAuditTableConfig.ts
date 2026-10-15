import { md5 } from "prostgles-types/dist/md5";
import type { Prostgles } from "../Prostgles";
import type { TableConfig, TableDefinition } from "../TableConfig/TableConfigTypes";

import { AUDIT_TABLE_COLUMN_DEFINITIONS } from "./AuditTable";
import { getAuditJoins } from "./getAuditJoins";
import {
  AUDIT_HISTORY_PROTECTION_PREFIX,
  AUDIT_TRUNCATE_PROTECTION_PREFIX,
  AUDIT_WRITER_PREFIX,
} from "../TableConfig/managedTriggerNames";

/** Adds audit definitions to the same config used for file tables and application tables. */
export const getAuditTableConfig = (
  prgl: Prostgles,
  tableConfig: TableConfig | undefined,
): TableConfig | undefined => {
  const { audit } = prgl.opts;
  if (!audit) return tableConfig;

  const { tableName } = audit;
  if (!tableName) throw new Error("audit.tableName is required");
  if (tableConfig?.[tableName]) {
    throw new Error("The audit table cannot also be defined in tableConfig");
  }
  return {
    [tableName]: {
      getJoins: (tables) => getAuditJoins(prgl, tables),
      allowMultiHopJoins: false,
      publish: { insert: false, update: false, delete: false },
      columns: AUDIT_TABLE_COLUMN_DEFINITIONS,
      indexes: {
        [`prostgles_audit_source_${md5(tableName)}`]: { columns: "schema_name, table_name, id" },
        [`prostgles_audit_old_id_${md5(tableName)}`]: {
          columns: "schema_name, table_name, old_id",
        },
        [`prostgles_audit_new_id_${md5(tableName)}`]: {
          columns: "schema_name, table_name, new_id",
        },
      },
      triggers: getAuditProtection(tableName, ["update", "delete", "truncate"]),
    },
    ...tableConfig,
  };
};

export function getAuditProtection(
  tableName: string,
  actions: NonNullable<TableDefinition["triggers"]>[string]["actions"],
): NonNullable<TableDefinition["triggers"]> {
  return {
    [(actions.includes("update") ?
      AUDIT_HISTORY_PROTECTION_PREFIX
    : AUDIT_TRUNCATE_PROTECTION_PREFIX) + md5(tableName)]: {
      type: "before",
      actions,
      forEach: "statement",
      query:
        "BEGIN RAISE EXCEPTION 'Audit protection: % is not allowed on %.%', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME; END;",
    },
  };
}

export function isAuditTable(prgl: Prostgles, tableName: string): boolean {
  return prgl.opts.audit?.tableName === tableName;
}

export const getAuditWriterName = (auditTable: string, sourceTable: string) =>
  AUDIT_WRITER_PREFIX + md5(JSON.stringify([auditTable, sourceTable]));

import type { TableRowFromColumnDefinitions } from "../TableConfig/TableRowFromColumnDefinitions";

export const AUDIT_TABLE_COLUMN_DEFINITIONS = {
  id: "BIGSERIAL PRIMARY KEY",
  created_at: "TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()",
  schema_name: "TEXT NOT NULL",
  table_name: "TEXT NOT NULL",
  operation: { enum: ["INSERT", "UPDATE", "DELETE"] },
  old_id: "JSONB",
  new_id: "JSONB",
  old_row: "JSONB",
  new_row: "JSONB",
  actor: "JSONB",
  db_context: {
    jsonbSchema: {
      type: {
        transaction_id: "string",
        transaction_started_at: "string",
        statement_started_at: "string",
        current_role: "string",
        session_user: "string",
        application_name: "string",
      },
    },
  },
} as const;

export type AuditTableRow = TableRowFromColumnDefinitions<typeof AUDIT_TABLE_COLUMN_DEFINITIONS>;
export const AUDIT_TABLE_COLUMNS = Object.keys(
  AUDIT_TABLE_COLUMN_DEFINITIONS,
) as (keyof AuditTableRow)[];

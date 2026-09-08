import { as } from "pg-promise";
import { asName } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import type { ResolvedAuditConfig } from "./AuditTypes";
import { getAuditProtection, getAuditWriterName } from "./getAuditTableConfig";

export const getAuditTriggerConfig = (audit: ResolvedAuditConfig): TableConfig => {
  const result: TableConfig = {};
  for (const [name, options] of Object.entries(audit.tables)) {
    const { idColumns: ids, excludeColumns: excluded } = options;
    const functionName = getAuditWriterName(audit.tableName, name);
    result[name] = {
      triggers: {
        ...getAuditProtection(audit.tableName, ["truncate"]),
        [functionName]: {
          type: "after",
          actions: ["insert", "update", "delete"],
          forEach: "row",
          query: `DECLARE
            before_row jsonb; after_row jsonb; before_id jsonb; after_id jsonb;
            ids text[] := ARRAY[${ids.map((c) => as.text(c)).join(", ")}]::text[];
            excluded text[] := ARRAY[${excluded.map((c) => as.text(c)).join(", ")}]::text[];
          BEGIN
            IF TG_OP <> 'INSERT' THEN
              before_row := to_jsonb(OLD);
              SELECT jsonb_object_agg(k, before_row -> k) INTO before_id FROM unnest(ids) k;
              before_row := before_row - excluded;
            END IF;
            IF TG_OP <> 'DELETE' THEN
              after_row := to_jsonb(NEW);
              SELECT jsonb_object_agg(k, after_row -> k) INTO after_id FROM unnest(ids) k;
              after_row := after_row - excluded;
            END IF;
            IF TG_OP = 'UPDATE' AND before_row IS NOT DISTINCT FROM after_row THEN RETURN NULL; END IF;
            INSERT INTO ${asName(audit.tableName)} (schema_name, table_name, operation, old_id, new_id, old_row, new_row, actor, db_context)
              VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, before_id, after_id, before_row, after_row,
                nullif(current_setting('prostgles.user', true), '')::jsonb,
                jsonb_build_object(
                  'transaction_id', pg_current_xact_id()::text,
                  'transaction_started_at', transaction_timestamp(),
                  'statement_started_at', statement_timestamp(),
                  'current_role', current_role,
                  'session_user', session_user,
                  'application_name', current_setting('application_name')
                ));
            RETURN NULL;
          END;`,
        },
      },
    };
  }
  return result;
};

import { as } from "pg-promise";
import { asName, getEntries } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { isArray } from "../utils/utils";
import { getAuditProtection, getAuditWriterName } from "./getAuditTableConfig";

/**
 * Resolve column defaults against the completed schema; generate tableConfig entries only.
 * */
export const parseAuditConfig = (prgl: Prostgles): TableConfig | undefined => {
  const { audit } = prgl.opts;
  if (!audit) return undefined;

  const tables = prgl.dboBuilder.tables;
  if (!tables.some((t) => t.name === audit.tableName)) {
    throw new Error(`Audit table name must exactly match a schema table name: ${audit.tableName}`);
  }
  const result: TableConfig = {};

  const entries = getEntries(audit.tables ?? {}).filter(([, value]) => value !== undefined);
  const exclusion = entries.some(([, value]) => value === 0);
  if (exclusion && entries.some(([, value]) => value !== 0)) {
    throw new Error("audit.tables cannot mix enabled and disabled entries");
  }
  for (const [name, value] of entries) {
    if (!tables.some((t) => t.name === name)) throw new Error(`Unknown audit table: ${name}`);
    if (value !== 0 && value !== 1 && (!value || typeof value !== "object" || Array.isArray(value)))
      throw new Error(`Invalid audit options for ${name}`);
  }

  for (const table of tables) {
    const entry = entries.find(([name]) => name === table.name);
    if (entries.length && (exclusion ? entry?.[1] === 0 : !entry)) continue;

    const isHistory = table.name === audit.tableName;
    const eligible = !isHistory && !table.is_view && !table.isHyperTable;
    if (!eligible) {
      if (entry && entry[1] !== 0) {
        throw new Error(
          `Unsupported audit target: ${table.name}`,
        );
      }
      continue;
    }
    const options = typeof entry?.[1] === "object" ? entry[1] : {};
    const ids = options.idColumns ?? table.columns.filter((c) => c.is_pkey).map((c) => c.name);
    const excluded = options.excludeColumns ?? [];
    if (!isArray(ids) || !ids.length) {
      throw new Error(`audit.idColumns is required for ${table.name} without a primary key`);
    }

    for (const list of [ids, excluded]) {
      if (
        new Set(list).size !== list.length ||
        list.some((c) => !table.columns.some((col) => col.name === c))
      ) {
        throw new Error(`Invalid audit columns for ${table.name}`);
      }
    }
    if (ids.some((c) => excluded.includes(c))) {
      throw new Error(`Audit identity columns cannot be excluded: ${table.name}`);
    }
    if (options.entityType !== undefined && !options.entityType) {
      throw new Error(`Invalid audit entityType for ${table.name}`);
    }
    const functionName = getAuditWriterName(audit.tableName, table.name);
    result[table.name] = {
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
            INSERT INTO ${asName(audit.tableName)} (schema_name, table_name, entity_type, operation, old_id, new_id, old_row, new_row, actor)
              VALUES (TG_TABLE_SCHEMA, TG_TABLE_NAME, ${as.text(options.entityType ?? table.name)}, TG_OP, before_id, after_id, before_row, after_row,
                nullif(current_setting('prostgles.user', true), '')::jsonb);
            RETURN NULL;
          END;`,
        },
      },
    };
  }
  return result;
};

import { as } from "pg-promise";
import { asName } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { SchemaConfigAuditTableOptions } from "./AuditTypes";
import {
  getAuditProtection,
  getAuditWriterName,
  type ParsedAuditConfig,
} from "./getAuditTableConfig";

/** Resolve column defaults against the completed schema; generate tableConfig entries only. */
export async function parseAuditConfig(
  prgl: Prostgles,
): Promise<ParsedAuditConfig> {
  const { audit } = prgl.opts;
  const tables = prgl.dboBuilder.tables;
  const auditTableNames = [
    ...new Set([
      ...(prgl.parsedAuditConfig?.auditTableNames ?? []),
      ...(audit ? [audit.tableName] : []),
    ]),
  ];
  const result: ParsedAuditConfig = {
    auditTableNames,
    tableConfigs: {},
  };
  for (const name of auditTableNames) {
    if (!tables.some((t) => t.name === name)) {
      throw new Error(
        `Audit table name must exactly match a schema table name: ${name}`,
      );
    }
    result.tableConfigs[name] = {
      triggers: getAuditProtection(name, ["update", "delete", "truncate"]),
    };
  }
  if (!audit) return result;
  const tableOptions: unknown = audit.tables;
  if (
    tableOptions !== undefined &&
    (!tableOptions ||
      typeof tableOptions !== "object" ||
      Array.isArray(tableOptions))
  ) {
    throw new Error("audit.tables must be a table map");
  }
  const entries = Object.entries(audit.tables ?? {}).filter(
    ([, value]) => value !== undefined,
  );
  const exclusion = entries.some(([, value]) => value === 0);
  if (exclusion && entries.some(([, value]) => value !== 0))
    throw new Error("audit.tables cannot mix enabled and disabled entries");
  for (const [name, value] of entries) {
    if (!tables.some((t) => t.name === name))
      throw new Error(`Unknown audit table: ${name}`);
    if (
      value !== 0 &&
      value !== 1 &&
      (!value || typeof value !== "object" || Array.isArray(value))
    )
      throw new Error(`Invalid audit options for ${name}`);
  }
  const relations = await prgl.dbForSchema!.any<{
    oid: number;
    relkind: string;
    relispartition: boolean;
  }>(
    "SELECT oid, relkind, relispartition FROM pg_class WHERE oid = ANY($1::oid[])",
    [tables.map((t) => t.oid)],
  );
  for (const table of tables) {
    const entry = entries.find(([name]) => name === table.name);
    if (entries.length && (exclusion ? entry?.[1] === 0 : !entry)) continue;
    const relation = relations.find((r) => r.oid === table.oid);
    const isHistory = auditTableNames.includes(table.name);
    const eligible =
      !isHistory &&
      table.schema !== "prostgles" &&
      !table.is_view &&
      !table.isHyperTable &&
      relation &&
      relation.relkind === "r" &&
      !relation.relispartition;
    if (!eligible) {
      if (entry && entry[1] !== 0)
        throw new Error(
          `Unsupported audit target: ${table.name}. Select ordinary, non-partitioned tables.`,
        );
      continue;
    }
    const options: SchemaConfigAuditTableOptions<void, string> =
      typeof entry?.[1] === "object" ? entry[1] : {};
    if (
      Object.keys(options).some(
        (k) => !["entityType", "idColumns", "excludeColumns"].includes(k),
      )
    )
      throw new Error(`Unknown audit option for ${table.name}`);
    const ids =
      options.idColumns ??
      table.columns.filter((c) => c.is_pkey).map((c) => c.name);
    const excluded = options.excludeColumns ?? [];
    if (!Array.isArray(ids) || !ids.length)
      throw new Error(
        `audit.idColumns is required for ${table.name} without a primary key`,
      );
    for (const list of [ids, excluded]) {
      if (
        !Array.isArray(list) ||
        new Set(list).size !== list.length ||
        list.some((c) => !table.columns.some((col) => col.name === c))
      )
        throw new Error(`Invalid audit columns for ${table.name}`);
    }
    if (ids.some((c) => excluded.includes(c)))
      throw new Error(
        `Audit identity columns cannot be excluded: ${table.name}`,
      );
    if (
      options.entityType !== undefined &&
      (typeof options.entityType !== "string" || !options.entityType)
    )
      throw new Error(`Invalid audit entityType for ${table.name}`);
    const functionName = getAuditWriterName(audit.tableName, table.name);
    result.tableConfigs[table.name] = {
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
}

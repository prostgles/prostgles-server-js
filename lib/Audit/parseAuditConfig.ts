import { getEntries, isObject } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { ResolvedAuditConfig } from "./AuditTypes";
import { isArray } from "../utils/utils";

/** Resolve audit targets and column defaults against the completed schema. */
export const parseAuditConfig = (prgl: Prostgles): ResolvedAuditConfig | undefined => {
  const { audit } = prgl.opts;
  if (!audit) return undefined;

  const tables = prgl.dboBuilder.tables;
  if (!tables.some((t) => t.name === audit.tableName)) {
    throw new Error(`Audit table name must exactly match a schema table name: ${audit.tableName}`);
  }
  const result: ResolvedAuditConfig["tables"] = {};

  const entries = getEntries(audit.tables ?? {}).filter(([, value]) => value !== undefined);
  const exclusion = entries.some(([, value]) => value === 0);
  if (exclusion && entries.some(([, value]) => value !== 0)) {
    throw new Error("audit.tables cannot mix enabled and disabled entries");
  }
  for (const [name, value] of entries) {
    if (!tables.some((t) => t.name === name)) {
      throw new Error(`Unknown audit table: ${name}`);
    }
    if (value !== 0 && value !== 1 && !isObject(value)) {
      throw new Error(`Invalid audit options for ${name}`);
    }
  }

  for (const table of tables) {
    const entry = entries.find(([name]) => name === table.name);
    if (entries.length && (exclusion ? entry?.[1] === 0 : !entry)) continue;

    const isHistory = table.name === audit.tableName;
    const eligible = !isHistory && !table.is_view && !table.isHyperTable;
    if (!eligible) {
      if (entry && entry[1] !== 0) {
        throw new Error(`Unsupported audit target: ${table.name}`);
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
    result[table.name] = {
      idColumns: [...ids],
      excludeColumns: [...excluded],
    };
  }
  return { tableName: audit.tableName, tables: result };
};

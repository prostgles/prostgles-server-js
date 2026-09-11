import { DB_GENERATED_SCHEMA_NAME } from "./constants";
import type { DBSchemaTable, TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfigTypes";

/** Permissions compiled from publish profiles at startup. */
export type ClientSchemaProfiles = Record<string, { tableSchema: DBSchemaTable[] }>;

export const getClientDBGeneratedSchemas = (
  profiles: ClientSchemaProfiles,
  tables: TableSchema[],
  config: TableConfig | undefined,
): string => {
  const entries = Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return "";
  for (const [name, schema] of entries) {
    validateClientSchemaName(name);
    for (const table of schema.tableSchema) {
      const base = tables.find((t) => t.name === table.name);
      if (!base || table.columns.some((c) => !base.columns.some((b) => b.name === c.name))) {
        throw new Error(`Cannot generate ${name}: unknown table or column in ${table.name}.`);
      }
    }
  }

  const generate = (name: string, schemas: ClientSchemaProfiles[string][]) => {
    const definitions = tables
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((table) => {
        const published = schemas.map((s) => s.tableSchema.find((t) => t.name === table.name));
        if (!published.some(Boolean)) return [];
        const inserting = published.filter((t) => t?.publishInfo.insert);
        const tableType = `${DB_GENERATED_SCHEMA_NAME}[${JSON.stringify(table.name)}]`;
        const required: string[] = [];
        const optional: string[] = [];
        const excluded: string[] = [];
        for (const column of table.columns.slice().sort((a, b) => a.name.localeCompare(b.name))) {
          const writable = inserting.map(
            (t) => !!t?.columns.find((c) => c.name === column.name)?.insert,
          );
          if (!writable.some(Boolean)) {
            excluded.push(`${JSON.stringify(column.name)}?: never`);
          } else if (
            !writable.every(Boolean) ||
            config?.[table.name]?.syncConfig?.synced_field === column.name
          ) {
            optional.push(column.name);
          } else {
            required.push(column.name);
          }
        }
        const input =
          !inserting.length ? "never" : (
            [
              required.length ? `Pick<${tableType}["columns"], ${keys(required)}>` : "",
              optional.length ? `Partial<Pick<${tableType}["columns"], ${keys(optional)}>>` : "",
              excluded.length ? `{ ${excluded.join("; ")} }` : "",
            ]
              .filter(Boolean)
              .join(" & ") || "Record<string, never>"
          );
        return [`  ${JSON.stringify(table.name)}: ${tableType} & { insertColumns: ${input} };`];
      });
    return `export type ${name} = {\n${definitions.join("\n")}\n};`;
  };

  return [
    "/** Insert access profiles. Row types retain the database schema; runtime permissions still apply. */",
    ...entries.map(([name, schema]) => generate(name, [schema])),
    "/** Permissive insert inputs across all supplied profiles; narrow to a named profile for exact inputs. */",
    generate(
      "ClientDBSchema",
      entries.map(([, schema]) => schema),
    ),
  ].join("\n\n");
};

const keys = (names: string[]) => names.map((name) => JSON.stringify(name)).join(" | ");
const reservedNames = new Set([
  DB_GENERATED_SCHEMA_NAME,
  "DBSchema",
  "DBSchemaForInsert",
  "ClientDBSchema",
]);

export const validateClientSchemaName = (name: string) => {
  // Requiring a Schema suffix also avoids TypeScript keywords and primitive type names.
  if (!/^[A-Za-z_$][\w$]*Schema$/.test(name) || reservedNames.has(name)) {
    throw new Error(`Invalid client schema name: ${name}. Use a unique name ending in Schema.`);
  }
};

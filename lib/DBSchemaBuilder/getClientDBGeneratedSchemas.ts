import type { DBSchemaTable, TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { DB_GENERATED_NAMES } from "./constants";
import { FILE_SCHEMA_KEYS } from "../DboBuilder/TableHandler/uploadFile";

/** Permissions compiled from publish profiles at startup. */
export type ClientSchemaProfiles = Record<
  string,
  { tableSchema: DBSchemaTable[]; userTypes: readonly string[] | string[] }
>;

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
        const tableType = `${DB_GENERATED_NAMES.SCHEMA}[${JSON.stringify(table.name)}]`;
        const fileWriteExcluded = table.columns
          .filter((column) => !FILE_SCHEMA_KEYS.some((key) => key === column.name))
          .map((column) => `${JSON.stringify(column.name)}?: never`)
          .sort();
        const fileWriteInput =
          published.some((t) => t?.isFileTable) ?
            `Pick<${tableType}["columns"], ${FILE_SCHEMA_KEYS.map((v) => JSON.stringify(v)).join(" | ")}> & { ${fileWriteExcluded.join("; ")} }`
          : undefined;
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
            (fileWriteInput ??
            ([
              required.length ? `Pick<${tableType}["columns"], ${keys(required)}>` : "",
              optional.length ? `Partial<Pick<${tableType}["columns"], ${keys(optional)}>>` : "",
              excluded.length ? `{ ${excluded.join("; ")} }` : "",
            ]
              .filter(Boolean)
              .join(" & ") ||
              "Record<string, never>"))
          );
        const updating = published.filter((t) => t?.publishInfo.update);
        const updateAllowed = table.columns
          .filter((column) =>
            updating.some((t) => t?.columns.some((c) => c.name === column.name && c.update)),
          )
          .map((column) => column.name)
          .sort();
        const updateExcluded = table.columns
          .filter((column) => !updateAllowed.includes(column.name))
          .map((column) => `${JSON.stringify(column.name)}?: never`)
          .sort();
        const updateInput =
          !updating.length ? "never" : (
            (fileWriteInput ??
            ([
              updateAllowed.length ?
                `Partial<Pick<${tableType}["columns"], ${keys(updateAllowed)}>>`
              : "",
              updateExcluded.length ? `{ ${updateExcluded.join("; ")} }` : "",
            ]
              .filter(Boolean)
              .join(" & ") ||
              "Record<string, never>"))
          );
        const optionalTable = published.every(Boolean) ? "" : " optional: true;";
        return [
          `  ${JSON.stringify(table.name)}: ${tableType} & { insertColumns: ${input}; updateColumns: ${updateInput};${optionalTable} };`,
        ];
      });
    if (!definitions.length) {
      return `export type ${name} = Record<string, never>;`;
    }
    return `export type ${name} = {\n${definitions.join("\n")}\n};`;
  };

  return [
    "/** Publish access profiles. Row types retain the database schema; runtime permissions still apply. */",
    ...entries.map(([name, schema]) => generate(name, [schema])),
    `export type ${DB_GENERATED_NAMES.CLIENT_SCHEMAS} = [\n${entries
      .map(
        ([name, { userTypes }]) =>
          `  { userType: ${userTypes
            .map((userType) => JSON.stringify(userType))
            .join(" | ")}; schema: ${name} },`,
      )
      .join("\n")}\n];`,
    "/** Permissive write inputs across all supplied profiles; tables missing from a profile are optional. */",
    generate(
      DB_GENERATED_NAMES.CLIENT_SCHEMA,
      entries.map(([, schema]) => schema),
    ),
  ].join("\n\n");
};

const keys = (names: string[]) => names.map((name) => JSON.stringify(name)).join(" | ");
const reservedNames = new Set(Object.values(DB_GENERATED_NAMES) as string[]);

export const validateClientSchemaName = (name: string) => {
  // Requiring a Schema suffix also avoids TypeScript keywords and primitive type names.
  if (!/^[A-Za-z_$][\w$]*Schema$/.test(name)) {
    throw new Error(
      `Invalid client schema name: ${JSON.stringify(name)}. Use a unique name ending in Schema.`,
    );
  }
  if (reservedNames.has(name)) {
    throw new Error(
      `Invalid client schema name: ${JSON.stringify(name)}. Use a unique name ending in Schema that does not conflict with reserved names (${Array.from(reservedNames).join(", ")}).`,
    );
  }
};

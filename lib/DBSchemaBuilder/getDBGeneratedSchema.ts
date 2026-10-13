import { fromEntries, isDefined, isEmpty, type TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { escapeTSNames } from "../utils/utils";
import { DB_GENERATED_NAMES } from "./constants";
import {
  getClientDBGeneratedSchemas,
  type ClientSchemaProfiles,
} from "./getClientDBGeneratedSchemas";
import { getColumnTypescriptDefinition } from "./getColumnTypescriptDefinition";
import { getCheckedTableColumns } from "./getCheckedTableColumns";
import { FILE_SCHEMA_KEYS } from "../DboBuilder/TableHandler/uploadFile";
import {
  FILE_TABLE_COLUMN_DEFINITIONS,
  FILE_TABLE_VERSION_COLUMN_DEFINITIONS,
} from "../StorageClient/fileTableDefinitions";

export const getDBGeneratedSchema = ({
  config,
  tablesOrViews,
  clientSchemas,
  fileTableName,
  auditTableName,
  skipChecks = false,
}: {
  config: TableConfig | undefined;
  tablesOrViews: TableSchema[];
  clientSchemas?: ClientSchemaProfiles;
  fileTableName?: string;
  auditTableName?: string;
  /** The initial DBO build precedes tableConfig migrations. */
  skipChecks?: boolean;
}): string => {
  const tables: string[] = [];

  /** Tables and columns are sorted to avoid infinite loops due to changing order */
  tablesOrViews
    .slice(0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((tableOrView) => {
      const { columns } = tableOrView;
      const cols = columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));

      /**
       * E.g.: A "users" will have referencedBy: { user_posts: ["user_id"] }
       */
      const referencedBy: Record<string, string[]> = fromEntries(
        tablesOrViews
          .map((refTable) => {
            const referencedCols = refTable.columns
              .map((refCol) => {
                const refCols = refCol.references
                  ?.filter((r) => r.ftable === tableOrView.name)
                  .map((r) => r.cols)
                  .flat();

                return refCols;
              })
              .filter(isDefined)
              .flat();
            const uniqueReferencedCols = Array.from(new Set(referencedCols));

            if (referencedCols.length) {
              return [refTable.name, uniqueReferencedCols] as const;
            }
            return;
          })
          .filter(isDefined),
      );
      const referencedByStr =
        isEmpty(referencedBy) ? "" : `referencedBy: ${JSON.stringify(referencedBy)};`;
      const checkedColumns =
        skipChecks ? undefined : getCheckedTableColumns(config, tableOrView, tablesOrViews);
      const excludedFileColumns =
        tableOrView.name === fileTableName ?
          cols.filter(
            ({ name }) =>
              (Object.hasOwn(FILE_TABLE_COLUMN_DEFINITIONS, name) ||
                Object.hasOwn(FILE_TABLE_VERSION_COLUMN_DEFINITIONS, name)) &&
              !FILE_SCHEMA_KEYS.some((key) => key === name),
          )
        : [];
      const insertColumns =
        excludedFileColumns.length ?
          `insertColumns: ${DB_GENERATED_NAMES.SCHEMA}[${JSON.stringify(tableOrView.name)}]["columns"] extends infer Row ? Row extends unknown ? Omit<Row, ${excludedFileColumns.map(({ name }) => JSON.stringify(name)).join(" | ")}> & { ${excludedFileColumns.map(({ name }) => `${JSON.stringify(name)}?: never`).join("; ")} } : never : never;`
        : "";
      tables.push(`${escapeTSNames(tableOrView.name)}: {
    columns: ${
      checkedColumns ??
      `{${cols
        .map(
          (column) => `
      ${getColumnTypescriptDefinition({ tablesOrViews, config, tableOrView, column })}`,
        )
        .join("")}
    }`
    };${insertColumns ? `\n    ${insertColumns}` : ""}${tableOrView.name === auditTableName ? "\n    updateColumns: never;" : ""}
    ${referencedByStr}
  };\n  `);
    });
  return `
export type ${DB_GENERATED_NAMES.SCHEMA} = {
  ${tables.join("")}
}

type CollapseNumberIfStringPresent<T> =
  [Extract<T, string>] extends [never] ? T : Exclude<T, number>;

/**
 * Numeric columns that serialize to strings keep the numeric type as well to allow:
 * - inserting numeric values as either numbers or strings
 * - reading numeric values as strings
 */
export type NormalizedRow<T extends Record<string, unknown>> = Required<{
  [K in keyof T]: CollapseNumberIfStringPresent<T[K]>;
}>;

/**
 * Data types as expected when selecting from the database
 * */
export type ${DB_GENERATED_NAMES.SCHEMA_OUTPUT} = {
  [K in keyof ${DB_GENERATED_NAMES.SCHEMA}]: NormalizedRow<${DB_GENERATED_NAMES.SCHEMA}[K]["columns"]>;
};

/**
 * Data types as expected when inserting into the database (optional fields might be nullable/with defaults)
 * */
export type ${DB_GENERATED_NAMES.SCHEMA_INPUT} = {
  [K in keyof ${DB_GENERATED_NAMES.SCHEMA}]: ${DB_GENERATED_NAMES.SCHEMA}[K] extends { insertColumns: infer Input } ? Input : ${DB_GENERATED_NAMES.SCHEMA}[K]["columns"];
};${clientSchemas ? "\n" + getClientDBGeneratedSchemas(clientSchemas, tablesOrViews, config) : ""}
`;
};

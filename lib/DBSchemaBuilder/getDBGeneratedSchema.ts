import { isDefined, isEmpty, type TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfig";
import { escapeTSNames } from "../utils/utils";
import { getColumnTypescriptDefinition } from "./getColumnTypescriptDefinition";
import { fromEntries } from "../PublishParser/applyScopeToTableRules";

export const getDBGeneratedSchema = ({
  config,
  tablesOrViews,
}: {
  config: TableConfig | undefined;
  tablesOrViews: TableSchema[];
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
      tables.push(`${escapeTSNames(tableOrView.name)}: {
    columns: {${cols
      .map(
        (column) => `
      ${getColumnTypescriptDefinition({ tablesOrViews, config, tableOrView, column })}`,
      )
      .join("")}
    };
    ${referencedByStr}
  };\n  `);
    });
  return `
export type DBGeneratedSchema = {
  ${tables.join("")}
}

/**
 * Data types as expected when selecting from the database
 * */
export type DBSchema = {
  [K in keyof DBGeneratedSchema]: Required<DBGeneratedSchema[K]["columns"]>;
};

/**
 * Data types as expected when inserting into the database (optional fields might be nullable/with defaults)
 * */
export type DBSchemaForInsert = {
  [K in keyof DBGeneratedSchema]: DBGeneratedSchema[K]["columns"];
};
`;
};

import type { TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfig";
import { escapeTSNames } from "../utils/utils";
import { getColumnTypescriptDefinition } from "./getColumnTypescriptDefinition";

export const getDBGeneratedSchema = ({
  tablesOrViews,
  config,
}: {
  tablesOrViews: TableSchema[];
  config: TableConfig | undefined;
}): string => {
  const tables: string[] = [];

  /** Tables and columns are sorted to avoid infinite loops due to changing order */
  tablesOrViews
    .slice(0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((tableOrView) => {
      const { privileges, columns, is_view } = tableOrView;
      const { select, insert, update, delete: del } = privileges;
      const cols = columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
      tables.push(`${escapeTSNames(tableOrView.name)}: {
${addIfTrue(
  {
    is_view,
    select,
    insert,
    update,
    delete: del,
  },
  "  ",
)}
    columns: {${cols
      .map(
        (column) => `
      ${getColumnTypescriptDefinition({ tablesOrViews, config, tableOrView, column })}`,
      )
      .join("")}
    };
  };\n  `);
    });
  return `
export type DBGeneratedSchema = {
  ${tables.join("")}
}
`;
};

const addIfTrue = (obj: Record<string, boolean | undefined>, leadingText: string) => {
  return Object.entries(obj)
    .filter(([, v]) => v)
    .map(([k]) => `${leadingText}${k}: true;`);
};

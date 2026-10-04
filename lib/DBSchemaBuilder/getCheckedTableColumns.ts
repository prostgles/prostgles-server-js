import { isObject, type TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { getTableCheckBranches } from "../TableConfig/getTableCheck";
import { escapeTSNames } from "../utils/utils";
import { getColumnTypescriptDefinition, getDataType } from "./getColumnTypescriptDefinition";

export const getCheckedTableColumns = (
  config: TableConfig | undefined,
  tableOrView: TableSchema,
  tablesOrViews: TableSchema[],
): string | undefined => {
  const tableConfig = config?.[tableOrView.name];
  if (!tableConfig || !("check" in tableConfig) || !tableConfig.check) return;
  const columns = tableOrView.columns.toSorted((a, b) => a.name.localeCompare(b.name));
  const branches = getTableCheckBranches(
    tableConfig.check,
    columns
      .filter((c) => Object.hasOwn(tableConfig.columns ?? {}, c.name))
      .map((c) => ({
        name: c.name,
        nullable: c.is_nullable,
        udt_name: c.udt_name,
      })),
  );
  return branches
    .map(
      (branch) => `{
${columns
  .map((column) => {
    const args = { config, tableOrView, tablesOrViews, column };
    if (!Object.hasOwn(branch, column.name)) return `      ${getColumnTypescriptDefinition(args)}`;
    const condition = branch[column.name] ?? null;
    const notNull = isObject(condition) && "$ne" in condition;
    const values =
      isObject(condition) ?
        "enum" in condition ?
          condition.enum
        : []
      : [condition];
    const dataType =
      notNull ?
        getDataType({ ...args, column: { ...column, is_nullable: false } })
          .trim()
          .replace(/;$/, "")
      : values.map((value) => JSON.stringify(value)).join(" | ");
    const optional = column.has_default || values.includes(null);
    return `      ${escapeTSNames(column.name)}${optional ? "?" : ""}: ${dataType};`;
  })
  .join("\n")}
    }`,
    )
    .join(" | ");
};

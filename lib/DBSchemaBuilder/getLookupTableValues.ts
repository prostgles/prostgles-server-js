import { isObject, type TableSchema } from "prostgles-types";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { getColumnConfig } from "../TableConfig/getColumnConfig";

/** Follow the referenced column at each hop, stopping at a lookup primary key. */
export const getLookupTableValues = ({
  config,
  tablesOrViews,
  tableOrView,
  column,
  visited = new Set<TableSchema["columns"][number]>(),
}: {
  config: TableConfig | undefined;
  tablesOrViews: TableSchema[];
  tableOrView: TableSchema;
  column: TableSchema["columns"][number];
  visited?: Set<TableSchema["columns"][number]>;
}): string[] | undefined => {
  if (!config || visited.has(column)) return;
  visited.add(column);

  const tableConfig = config[tableOrView.name];
  if (tableConfig && "isLookupTable" in tableConfig && column.is_pkey) {
    return Object.keys(tableConfig.isLookupTable.values);
  }

  const columnConfig = getColumnConfig(config, tableOrView.name, column.name);
  const reference = isObject(columnConfig) ? columnConfig.references : undefined;
  const targets =
    reference ?
      [{ tableName: reference.tableName, columnName: reference.columnName ?? "id" }]
    : (column.references ?? []).map((ref) => ({
        tableName: ref.ftable,
        columnName: ref.fcols[ref.cols.indexOf(column.name)],
      }));

  for (const target of targets) {
    const targetTable = tablesOrViews.find((table) => table.name === target.tableName);
    const targetColumn = targetTable?.columns.find((col) => col.name === target.columnName);
    if (!targetTable || !targetColumn) continue;
    const values = getLookupTableValues({
      config,
      tablesOrViews,
      tableOrView: targetTable,
      column: targetColumn,
      visited,
    });
    if (values) return values;
  }
};

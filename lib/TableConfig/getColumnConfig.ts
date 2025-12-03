import type { ColumnConfig, TableConfig } from "../TableConfig/TableConfig";

export const getColumnConfig = (
  config: TableConfig,
  tableName: string,
  colName: string
): ColumnConfig | undefined => {
  const tconf = config[tableName];
  if (tconf && "columns" in tconf) {
    return tconf.columns?.[colName];
  }
  return undefined;
};

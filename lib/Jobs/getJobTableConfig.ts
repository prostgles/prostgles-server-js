import type { Prostgles } from "../Prostgles";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { jobTableConfig } from "./jobTableConfig";

export const getJobTableConfig = (
  prostgles: Prostgles,
  tableConfig: TableConfig | undefined,
): TableConfig | undefined => {
  if (!prostgles.opts.jobs) return tableConfig;
  const { tableName } = prostgles.jobs;
  if (!tableName || Buffer.byteLength(tableName) > 50 || tableName.includes("\0")) {
    throw new Error("Invalid jobs.tableName (expected 1-50 bytes)");
  }
  if (tableConfig?.[tableName]) {
    throw new Error("The jobs table cannot also be defined in tableConfig");
  }
  return {
    [tableName]: {
      ...jobTableConfig,
      indexes: Object.fromEntries(
        Object.entries(jobTableConfig.indexes).map(([name, index]) => [
          `${tableName}_${name}`,
          index,
        ]),
      ),
    },
    ...tableConfig,
  };
};

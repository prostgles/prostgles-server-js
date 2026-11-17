import { getKeys } from "prostgles-types";
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
  const configuredJobs = tableConfig?.[tableName];
  if (configuredJobs !== prostgles.opts.tableConfig?.[tableName]) {
    throw new Error("The jobs table name is already used by another managed table");
  }
  if (configuredJobs && "isLookupTable" in configuredJobs) {
    throw new Error("The jobs table cannot be a lookup table");
  }
  const additionalColumnChecks = Object.fromEntries(
    getKeys(configuredJobs?.columns ?? {})
      .filter((column) => !Object.hasOwn(jobTableConfig.columns, column))
      .map((column) => [column, {}]),
  );
  const jobsTable = {
    ...configuredJobs,
    ...jobTableConfig,
    columns: { ...jobTableConfig.columns, ...configuredJobs?.columns },
    check: {
      $or: jobTableConfig.check.$or.map((branch) => ({ ...branch, ...additionalColumnChecks })),
    },
    publishRestrictions: {
      ...configuredJobs?.publishRestrictions,
      insert: false,
      update: false,
      delete: false,
    },
    indexes: {
      ...configuredJobs?.indexes,
      ...Object.fromEntries(
        Object.entries(jobTableConfig.indexes).map(([name, index]) => [
          `${tableName}_${name}`,
          index,
        ]),
      ),
    },
  } satisfies TableConfig[string];
  return configuredJobs ?
      { ...tableConfig, [tableName]: jobsTable }
    : { [tableName]: jobsTable, ...tableConfig };
};

import type { Prostgles } from "../Prostgles";
import { getFileTableConfig } from "../StorageClient/getFileTableConfig";
import { getJobTableConfig } from "../Jobs/getJobTableConfig";
import { getJobTableHooks } from "../Jobs/getJobTableHooks";
import { getAuditTableConfig } from "../Audit/getAuditTableConfig";
import { isManagedTriggerName } from "./managedTriggerNames";

export const getMergedTableConfig = (prostgles: Prostgles) => {
  for (const [tableName, table] of Object.entries(prostgles.opts.tableConfig ?? {})) {
    for (const name of Object.keys(table.triggers ?? {})) {
      if (isManagedTriggerName(name)) {
        throw new Error(`Trigger ${tableName}.${name} uses a prefix reserved for prostgles`);
      }
    }
  }
  const config = getFileTableConfig(prostgles);
  const tableConfig = getJobTableConfig(
    prostgles,
    getAuditTableConfig(prostgles, config.tableConfig),
  );
  return { tableConfig, tableHooks: getJobTableHooks(prostgles, config.tableHooks) };
};

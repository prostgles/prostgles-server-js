import { jobTableSchema } from "prostgles-types";
import type { TableDefinition } from "../TableConfig/TableConfigTypes";

export const jobTableConfig = {
  ...jobTableSchema,
  indexes: {
    occurrence: { unique: true, columns: "job_name, occurrence", where: "occurrence IS NOT NULL" },
    pending: { columns: "job_name, run_at", where: "status = 'pending'" },
    active: { columns: "job_name", where: "status IN ('pending', 'running')" },
    retention: {
      columns: "job_name, status, finished_at, id",
      where: "target_table IS NULL AND status IN ('succeeded', 'failed', 'cancelled')",
    },
  },
} as const satisfies TableDefinition;

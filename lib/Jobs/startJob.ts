import { pickKeys } from "prostgles-types";
import { runJobControl } from "../ExecutionContext";
import type { Prostgles } from "../Prostgles";
import { enqueueJob } from "./enqueueJob";
import { getJobDefinition } from "./getJobDefinition";
import type { JobRecord, JobTransaction, JobValue } from "./JobTypes";
import { getJobPrimaryKeyNames, matchesJobTriggerCondition } from "./jobUtils";

export const startJob = async (
  prostgles: Prostgles,
  transaction: JobTransaction,
  name: string,
  options: {
    params: Record<string, JobValue>;
    row: JobRecord["target_row_pkey"] | undefined;
    userId: string | undefined;
  },
) => {
  const { trigger } = getJobDefinition(prostgles, name).definition;
  const enqueue = async (targetRowPkey: JobRecord["target_row_pkey"]) => {
    const { jobId } = await enqueueJob(prostgles, transaction, name, targetRowPkey, options);
    return { jobId };
  };
  if (trigger.type !== "row") {
    if (options.row) throw new Error(`Job ${name} does not accept a row`);
    return enqueue({});
  }
  const rowTable = transaction.dbx[trigger.table];
  if (!rowTable) throw new Error(`Job source table not found: ${trigger.table}`);
  const primaryKeys = getJobPrimaryKeyNames(rowTable);
  const rowLookup = options.row;
  if (!rowLookup || !primaryKeys.length || primaryKeys.some((key) => rowLookup[key] == null)) {
    throw new Error("Job row primary key is unavailable");
  }
  const filter = Object.fromEntries(primaryKeys.map((key) => [key, { $eq: rowLookup[key] }]));
  /* Lock the target row before enqueueing, matching automatic row triggers. */
  const row = await rowTable.findOne(filter, { forUpdate: true });
  if (!row) throw new Error("Job row is unavailable");
  const targetRowPkey = pickKeys(row, primaryKeys) as JobRecord["target_row_pkey"];
  if (!(await matchesJobTriggerCondition(rowTable, targetRowPkey, trigger.when))) {
    throw new Error("Job row does not satisfy its trigger condition");
  }
  return runJobControl(rowTable, targetRowPkey, { jobName: name, operation: "startOrRetry" }, () =>
    enqueue(targetRowPkey),
  );
};

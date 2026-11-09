import type { DBTableHandlersFromSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { Prostgles } from "../Prostgles";
import { enqueueJob } from "./enqueueJob";
import { getJobDefinition } from "./getJobDefinition";
import { getJobParams } from "./getJobParams";
import type { JobRecord, JobTransaction, ManualJobControlOptions } from "./JobTypes";
import { assertJobControlStatus } from "./jobUtils";

export const controlManualJob = async <S>(
  prostgles: Prostgles,
  transaction: JobTransaction,
  name: string,
  options: ManualJobControlOptions<S>,
) => {
  const { jobId, operation } = options;
  const transactionJobs = prostgles.jobs.api.withTransaction(transaction.dbx);
  let job: JobRecord | undefined;
  if (jobId !== undefined) {
    if (!(await transactionJobs.get(jobId))) throw new Error("Job is unavailable or not readable");
    job =
      (await transaction.t.oneOrNone<JobRecord>(
        `SELECT * FROM ${prostgles.jobs.tableSQL} WHERE id = \${jobId} FOR UPDATE`,
        { jobId },
      )) ?? undefined;
    if (!job || !(await transactionJobs.get(jobId)))
      throw new Error("Job is unavailable or not readable");
    if (job.job_name !== name || job.target_table !== null) {
      throw new Error("Job does not match the manual job definition");
    }
    assertJobControlStatus(job, operation);
  } else if (operation !== "startOrRetry") {
    throw new Error("Job ID is required");
  }
  const { definition } = getJobDefinition(prostgles, name);
  const params =
    operation === "cancel" ?
      (job?.params ?? {})
    : await getJobParams(prostgles, definition.params, {
        ...job?.params,
        ...options.params,
      });
  await options.run?.({
    job,
    params,
    dbx: transaction.dbx as unknown as DBTableHandlersFromSchema<S>,
  });
  if (operation === "cancel") {
    if (!job) throw new Error("Job ID is required");
    await transactionJobs.cancel(job.id);
    return { jobId: job.id };
  }
  const { jobId: startedJobId } = await enqueueJob(
    prostgles,
    transaction,
    name,
    {},
    {
      userId: prostgles.getExecution()?.user?.id,
      reason: job ? "rerun" : "trigger",
      params,
    },
  );
  return { jobId: startedJobId };
};

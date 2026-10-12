import { pickKeys, stableStringify, type AnyObject } from "prostgles-types";
import type { DBTableHandlersFromSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import { runJobControl } from "../ExecutionContext";
import type { Prostgles } from "../Prostgles";
import type { AuthClientRequest } from "../Auth/AuthTypes";
import { runClientRequest } from "../runClientRequest";
import { enqueueJob } from "./enqueueJob";
import { getJobDefinition } from "./getJobDefinition";
import { getJobTableHandler } from "./getJobTableHandler";
import type { JobControlOptions, JobRecord, JobTransaction } from "./JobTypes";
import { jobControlStatuses } from "./JobTypes";

export const controlJob = async <S, Row extends AnyObject>(
  prostgles: Prostgles,
  transaction: JobTransaction,
  clientReq: AuthClientRequest,
  name: string,
  options: JobControlOptions<S, Row>,
) => {
  const { definition } = getJobDefinition(prostgles, name);
  const { trigger } = definition;
  if (trigger.type !== "row" || !trigger.jobIdColumn) {
    throw new Error(`Job control requires a row job with jobIdColumn: ${name}`);
  }
  const findReadableRows = (filter: AnyObject) =>
    runClientRequest.call(
      prostgles,
      {
        tableName: trigger.table,
        command: "find",
        param1: filter,
        param2: { limit: 1 },
        param3: undefined,
      },
      clientReq,
      undefined,
      transaction.dbx,
    ) as Promise<AnyObject[]>;

  const rowTable = transaction.dbx[trigger.table]!;
  const primaryKeys = rowTable.columns
    .filter((column) => column.is_pkey)
    .map((column) => column.name);
  if (!primaryKeys.length || !primaryKeys.every((key) => options.row[key] !== undefined)) {
    throw new Error("Job row primary key is unavailable");
  }
  const filter = Object.fromEntries(primaryKeys.map((key) => [key, { $eq: options.row[key] }]));
  const rows = await findReadableRows(filter);
  if (rows.length !== 1) {
    throw new Error("Job lookup must reference one readable row");
  }
  const targetRowPkey = pickKeys(rows[0]!, primaryKeys) as JobRecord["target_row_pkey"];
  if (!primaryKeys.every((key) => key in targetRowPkey)) {
    throw new Error("Job row primary key is unavailable");
  }
  const sourceRow = await rowTable.findOne({ $and: [targetRowPkey, filter] });
  if (!sourceRow) {
    throw new Error("Job row is unavailable");
  }
  const jobIdColumn = trigger.jobIdColumn;
  const previousJobId = sourceRow[jobIdColumn] as string | null;
  return runJobControl(
    rowTable,
    targetRowPkey,
    { jobName: name, operation: options.operation },
    async () => {
      // A competing control or row trigger changes the link before this claim can commit.
      const row = await rowTable.findOne(
        { $and: [targetRowPkey, filter, { [jobIdColumn]: previousJobId }] },
        { forUpdate: true },
      );
      if (!row) {
        throw new Error("Job row changed; retry the operation");
      }
      // Recheck publish filters after the claim, including changes made in this transaction.
      if ((await findReadableRows({ $and: [targetRowPkey, filter] })).length !== 1) {
        throw new Error("Job row is no longer readable");
      }
      const dbx = transaction.dbx as unknown as DBTableHandlersFromSchema<S>;
      const job =
        previousJobId ?
          await getJobTableHandler(prostgles, transaction).findOne({ id: previousJobId })
        : undefined;
      if (
        previousJobId &&
        (!job ||
          job.job_name !== name ||
          job.target_table !== trigger.table ||
          stableStringify(job.target_row_pkey) !== stableStringify(targetRowPkey))
      ) {
        throw new Error("Linked job does not match the target row");
      }
      if (job && !jobControlStatuses[options.operation].includes(job.status)) {
        throw new Error(`Job control is not allowed while the job is ${job.status}`);
      }
      if (!job && options.operation !== "startOrRetry") {
        throw new Error("Job has not started");
      }
      await options.run?.(row as Row, dbx);
      if (!(await rowTable.findOne({ $and: [targetRowPkey, { [jobIdColumn]: previousJobId }] }))) {
        throw new Error("Job control must preserve the target row and job link");
      }
      if (options.operation === "cancel") {
        await prostgles.jobs.api.withTransaction(transaction.dbx).cancel(job!.id);
        return { jobId: job!.id };
      }
      if (
        !job &&
        trigger.when &&
        !(await rowTable.findOne({ $and: [targetRowPkey, trigger.when] }))
      ) {
        throw new Error("Job row does not satisfy its trigger condition");
      }
      const { jobId, targetRow } = await enqueueJob(prostgles, transaction, name, targetRowPkey, {
        userId: prostgles.getExecution()?.user?.id,
        reason: job ? "rerun" : "trigger",
        params: job?.params,
      });
      if (!targetRow) throw new Error("Job row is unavailable");
      return { jobId };
    },
  );
};

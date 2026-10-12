import { createServerSideRequest } from "../Auth/utils/serverSideRequest";
import { runJobControl } from "../ExecutionContext";
import type { Prostgles } from "../Prostgles";
import { runClientRequest } from "../runClientRequest";
import { controlJob } from "./controlJob";
import { enqueueJob } from "./enqueueJob";
import { getJobTableHandler } from "./getJobTableHandler";
import type { JobRecord, Jobs, JobTransaction } from "./JobTypes";

export const createJobsAPI = (prostgles: Prostgles, dbx: object | undefined): Jobs => {
  const runInTransaction = async <T>(callback: (transaction: JobTransaction) => Promise<T>) => {
    prostgles.checkNotDestroyed();
    const builder = prostgles.dboBuilder;
    if (!dbx) return builder.getTX((dbx, t) => callback({ dbx, t }));
    const { dbTX, t } = builder.getTransactionForHandlers(dbx);
    try {
      return await callback({ dbx: dbTX, t });
    } catch (error) {
      builder.failTransaction(t, error);
      throw error;
    }
  };

  return {
    withTransaction: (dbx) => {
      prostgles.dboBuilder.getTransactionForHandlers(dbx);
      return createJobsAPI(prostgles, dbx);
    },
    get: async (id, options) => {
      const read = async (transaction: JobTransaction | undefined) => {
        const clientReq = getClientRequest(prostgles, options?.userId);
        if (!clientReq) return getJobTableHandler(prostgles, transaction).findOne({ id });
        return runClientRequest.call(
          prostgles,
          {
            tableName: prostgles.jobs.tableName,
            command: "findOne",
            param1: { id },
            param2: undefined,
            param3: undefined,
          },
          clientReq,
          undefined,
          transaction?.dbx,
        ) as Promise<Partial<JobRecord> | undefined>;
      };
      return dbx ? runInTransaction(read) : read(undefined);
    },
    cancel: (id) =>
      runInTransaction(async (transaction) => {
        const job = await getJobTableHandler(prostgles, transaction).findOne({ id });
        if (!job) throw new Error("Job not found");
        await transaction.t.none(
          `UPDATE ${prostgles.jobs.tableSQL} 
        SET 
          cancel_requested = TRUE,
          status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
          finished_at = CASE WHEN status = 'pending' THEN clock_timestamp() ELSE finished_at END
        WHERE id = \${jobId} 
          AND status IN ('pending', 'running')`,
          { jobId: id },
        );
      }),
    rerun: (id, params = {}, options) =>
      runInTransaction(async (transaction) => {
        const clientReq = getClientRequest(prostgles, options?.userId);
        const userId =
          clientReq ?
            (await prostgles.publishParser!.getPublishParams(clientReq, undefined)).user?.id
          : undefined;
        const job = await getJobTableHandler(prostgles, transaction).findOne({ id });
        if (!job) throw new Error("Job not found");
        const enqueue = () =>
          enqueueJob(prostgles, transaction, job.job_name, job.target_row_pkey, {
            params: { ...job.params, ...params },
            reason: "rerun",
            userId,
          });
        const { jobId } = await (job.target_table ?
          runJobControl(
            transaction.dbx[job.target_table]!,
            job.target_row_pkey,
            { jobName: job.job_name, operation: "rerun" },
            enqueue,
          )
        : enqueue());
        return { jobId };
      }),
    control: (name, options) =>
      runInTransaction((transaction) => {
        const clientReq = getClientRequest(prostgles, undefined);
        if (!clientReq) throw new Error("Job control requires a user");
        return controlJob(prostgles, transaction, clientReq, name, options);
      }),
  };
};

const getClientRequest = (prostgles: Prostgles, userId: string | undefined) => {
  const execution = prostgles.getExecution();
  if (userId !== undefined) return createServerSideRequest(prostgles, userId);
  if (execution?.clientReq) return execution.clientReq;
  return execution?.user ? createServerSideRequest(prostgles, execution.user.id) : undefined;
};

import type { Prostgles } from "../Prostgles";
import type { JobRecord, Jobs, JobTransaction } from "./JobTypes";
import { enqueueJob } from "./enqueueJob";
import { runJob } from "./runJob";
import { jobError } from "./jobUtils";
import { getJobTableHandler } from "./getJobTableHandler";
import { claimJob } from "./claimJob";
import { enqueueSchedules } from "./enqueueSchedules";
import { createServerSideRequest } from "../Auth/utils/serverSideRequest";
import { validateJobDefinitions } from "./getJobDefinition";

export class JobManager {
  constructor(private readonly prostgles: Prostgles) {}
  get tableName() {
    return this.prostgles.opts.jobs?.tableName ?? "prostgles_jobs";
  }
  get tableSQL() {
    const table = this.prostgles.dboBuilder.dboMap.get(this.tableName);
    if (!table) throw new Error(`Job table ${this.tableName} is not available in schemaFilter`);
    return table.escapedName;
  }
  private stopped = true;
  private timer?: ReturnType<typeof setTimeout>;
  private ticking?: Promise<void>;
  private readonly running = new Map<AbortController, Promise<void>>();
  private readonly schedules = new Map<string, string>();

  readonly api: Jobs = {
    get: async (id, options) => {
      const clientReq = this.getClientRequest(options?.userId);
      if (!clientReq) return getJobTableHandler(this.prostgles).findOne({ id });
      const { clientDb } = await this.prostgles.getClientDBHandlers<
        Record<string, { columns: JobRecord }>
      >(clientReq, undefined);
      const table = clientDb[this.tableName];
      if (!table?.findOne) throw new Error("Job view is not permitted");
      return table.findOne({ id });
    },
    cancel: async (id) => {
      const job = await getJobTableHandler(this.prostgles).findOne({ id });
      if (!job) throw new Error("Job not found");
      await this.prostgles.db!.none(
        `UPDATE ${this.tableSQL} SET cancel_requested = TRUE,
        status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
        finished_at = CASE WHEN status = 'pending' THEN clock_timestamp() ELSE finished_at END
        WHERE id = $1 AND status IN ('pending', 'running')`,
        [id],
      );
    },
    rerun: async (id, params = {}, options) => {
      const clientReq = this.getClientRequest(options?.userId);
      const userId =
        clientReq ?
          (await this.prostgles.publishParser!.getPublishParams(clientReq, undefined)).user?.id
        : undefined;
      const rerun = async (transaction: JobTransaction) => {
        const job = await getJobTableHandler(this.prostgles, transaction).findOne({ id });
        if (!job) throw new Error("Job not found");
        const { jobId } = await enqueueJob(this.prostgles, transaction, job.job_name, job.owner, {
          params: { ...job.params, ...params },
          reason: "rerun",
          userId,
        });
        return { jobId };
      };
      const builder = this.prostgles.dboBuilder;
      const transaction = builder.getActiveTransaction();
      if (!transaction) return builder.getTX((dbx, t) => rerun({ dbx, t }));
      return rerun(transaction).catch((error: unknown) => {
        builder.failTransaction(transaction.t, error);
        throw error;
      });
    },
  };

  validate = () => validateJobDefinitions(this.prostgles, this.prostgles.dboBuilder.tables);

  start = () => {
    if (!this.stopped || !this.prostgles.opts.jobs) return;
    getJobTableHandler(this.prostgles);
    this.stopped = false;
    this.schedule();
  };

  stop = async () => {
    this.stopped = true;
    clearTimeout(this.timer);
    for (const controller of this.running.keys())
      controller.abort(new Error("Job runner stopping"));
    await this.ticking;
    await Promise.all(this.running.values());
    this.schedules.clear();
  };

  private schedule = () => {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.ticking = this.tick()
        .catch((error: unknown) => {
          if (!this.stopped) console.error("Job runner failed", jobError(error));
        })
        .finally(this.schedule);
    }, 250);
    this.timer.unref();
  };

  private tick = async () => {
    const { prostgles } = this;
    if (!prostgles.loaded || !prostgles.opts.jobs || this.stopped) return;
    await enqueueSchedules(prostgles, this.schedules);
    for (const [name, definition] of Object.entries(prostgles.opts.jobs.definitions)) {
      for (let index = 0; index < (definition.concurrency ?? 1); index++) {
        // stop() can run while a preceding claim is pending.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.stopped) return;
        const job = await claimJob(prostgles, name, definition.concurrency ?? 1);
        if (!job) break;
        const controller = new AbortController();
        // stop() may have started while the claim was in flight.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.stopped) controller.abort(new Error("Job runner stopping"));
        const work = runJob(prostgles, job, controller, () => this.stopped)
          .catch((error: unknown) => console.error("Job run failed", jobError(error)))
          .finally(() => this.running.delete(controller));
        this.running.set(controller, work);
      }
    }
  };

  private getClientRequest = (userId: string | undefined) => {
    const execution = this.prostgles.getExecution();
    if (userId !== undefined) return createServerSideRequest(this.prostgles, userId);
    if (execution?.clientReq) return execution.clientReq;
    return execution?.user ? createServerSideRequest(this.prostgles, execution.user.id) : undefined;
  };
}

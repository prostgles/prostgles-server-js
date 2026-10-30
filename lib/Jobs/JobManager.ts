import type { Prostgles } from "../Prostgles";
import type { Jobs } from "./JobTypes";
import { createJobsAPI } from "./createJobsAPI";
import { runJob } from "./runJob";
import { jobError } from "./jobUtils";
import { getJobTableHandler } from "./getJobTableHandler";
import { claimJob } from "./claimJob";
import { enqueueSchedules } from "./enqueueSchedules";
import { validateJobDefinitions } from "./getJobDefinition";
import { getJobControlBinding } from "./getJobControlBinding";
import { getJobRetention, type JobRetentionPolicy } from "./getJobRetention";
import { pruneJobs } from "./pruneJobs";

export class JobManager {
  constructor(private readonly prostgles: Prostgles) {
    this.api = createJobsAPI(prostgles, undefined);
  }
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
  private retention: JobRetentionPolicy[] = [];
  private nextRetentionCleanup = 0;

  readonly api: Jobs;

  validate = async () => {
    await validateJobDefinitions(this.prostgles, this.prostgles.dboBuilder.tables);
    for (const group of Object.values(this.prostgles.opts.functions ?? {})) {
      for (const method of Object.values(group.functions))
        getJobControlBinding(this.prostgles, method);
    }
    this.retention = await getJobRetention(this.prostgles);
    this.nextRetentionCleanup = 0;
  };

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
    this.nextRetentionCleanup = 0;
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
    if (this.retention.length && Date.now() >= this.nextRetentionCleanup) {
      this.nextRetentionCleanup = Date.now() + 60_000;
      await pruneJobs(prostgles, this.retention);
    }
  };
}

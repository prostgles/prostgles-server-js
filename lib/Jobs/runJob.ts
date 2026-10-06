import type { Prostgles } from "../Prostgles";
import { createExecutionContext } from "../ExecutionContext";
import { getJobDefinition } from "./getJobDefinition";
import { getJobContext } from "./getJobContext";
import type { JobContext, JobRecord, ParamsSchema } from "./JobTypes";
import { assertJobValue, jobError, PermanentJobError } from "./jobUtils";

export const runJob = async (
  prostgles: Prostgles,
  job: Extract<JobRecord, { status: "running" }>,
  controller: AbortController,
  stopping: () => boolean,
) => {
  const db = prostgles.db!;
  const tableSQL = prostgles.jobs.tableSQL;
  const claim = [job.id, job.lease_token];
  const owned =
    "id = $1 AND lease_token = $2 AND status = 'running' AND locked_until > clock_timestamp()";
  const write = async (set: string, value: unknown) => {
    controller.signal.throwIfAborted();
    const result = await db.oneOrNone(
      `UPDATE ${tableSQL} SET ${set} WHERE ${owned} AND NOT cancel_requested RETURNING id`,
      [...claim, value],
    );
    if (!result) {
      controller.abort(new Error("Job cancelled or lease lost"));
      controller.signal.throwIfAborted();
    }
  };
  let heartbeat: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let heartbeatWork = Promise.resolve();
  let finished = false;
  const renew = () => {
    if (finished) return;
    heartbeat = setTimeout(() => {
      heartbeatWork = (async () => {
        const row = await db.oneOrNone<{ cancel_requested: boolean }>(
          `
          UPDATE ${tableSQL} SET locked_until = clock_timestamp() + interval '30 seconds'
          WHERE ${owned} RETURNING cancel_requested
        `,
          claim,
        );
        if (!row || row.cancel_requested)
          controller.abort(new Error("Job cancelled or lease lost"));
      })()
        .catch((error: unknown) => controller.abort(error))
        .finally(renew);
    }, 250);
    heartbeat.unref();
  };
  renew();
  let failure: { error: unknown } | undefined;
  try {
    controller.signal.throwIfAborted();
    const { definition } = getJobDefinition(prostgles, job.job_name);
    if (definition.timeoutMs) {
      timeout = setTimeout(
        () => controller.abort(new Error("Job timed out")),
        definition.timeoutMs,
      );
      timeout.unref();
    }
    const context = await getJobContext(prostgles, definition, job.user_id ?? undefined);
    const row =
      definition.trigger.type === "row" ?
        await context.dbo[definition.trigger.table]?.findOne?.(job.owner)
      : undefined;
    if (definition.trigger.type === "row" && !row)
      throw new PermanentJobError("Job row is missing or not permitted");
    const jobContext: JobContext<void, string | undefined, ParamsSchema, unknown> = {
      ...context,
      row,
      params: job.params,
      run: { id: job.id, attempt: job.attempts, reason: job.attempts > 1 ? "retry" : job.reason },
      signal: controller.signal,
      progress: async (done, total) => {
        if (
          !Number.isFinite(done) ||
          done < 0 ||
          (total !== undefined && (!Number.isFinite(total) || total < 0 || done > total))
        ) {
          throw new Error("Invalid job progress");
        }
        await write("progress = $3:json", { done, ...(total === undefined ? {} : { total }) });
      },
      checkpoint: {
        get: async <C>() => {
          controller.signal.throwIfAborted();
          const result = await db.oneOrNone<{ checkpoint: C; has_checkpoint: boolean }>(
            `SELECT checkpoint, has_checkpoint FROM ${tableSQL} WHERE ${owned} AND NOT cancel_requested`,
            claim,
          );
          if (!result) throw new Error("Job cancelled or lease lost");
          return result.has_checkpoint ? result.checkpoint : undefined;
        },
        set: async (checkpoint) => {
          assertJobValue(checkpoint);
          await write("checkpoint = $3:json, has_checkpoint = TRUE", checkpoint);
        },
      },
      fail: (reason) => {
        throw new PermanentJobError(reason);
      },
    };
    controller.signal.throwIfAborted();
    await prostgles.runWithExecution(
      {
        ...createExecutionContext(undefined),
        user: context.user,
        invocations: [
          { type: "function", id: job.id, functionName: job.job_name, relatedRecords: [] },
        ],
      },
      () => definition.run(jobContext),
    );
    controller.signal.throwIfAborted();
  } catch (error) {
    failure = { error };
  } finally {
    finished = true;
    clearTimeout(heartbeat);
    clearTimeout(timeout);
    await heartbeatWork;
  }
  if (stopping()) {
    await db.none(`UPDATE ${tableSQL} SET locked_until = clock_timestamp() WHERE ${owned}`, claim);
    return;
  }
  const retry =
    failure && !(failure.error instanceof PermanentJobError) && job.attempts < job.max_attempts;
  const delay = Math.min(
    2_147_483_647,
    job.delay_ms * (job.backoff === "exponential" ? 2 ** (job.attempts - 1) : 1),
  );
  const status =
    !failure ? "succeeded"
    : retry ? "pending"
    : "failed";
  await db.none(
    `UPDATE ${tableSQL} SET status = CASE WHEN cancel_requested THEN 'cancelled' ELSE $3 END,
      error = $4, lease_token = NULL, locked_until = NULL,
      run_at = clock_timestamp() + $5 * interval '1 millisecond',
      finished_at = CASE WHEN cancel_requested OR $3 <> 'pending' THEN clock_timestamp() ELSE NULL END
    WHERE ${owned}
  `,
    [...claim, status, failure ? jobError(failure.error) : null, delay],
  );
};

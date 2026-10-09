import { stableStringify } from "prostgles-types";
import { randomUUID } from "node:crypto";
import type { Prostgles } from "../Prostgles";
import { getJobDefinition } from "./getJobDefinition";
import type { JobRecord, JobTransaction } from "./JobTypes";
import { getJobTableHandler } from "./getJobTableHandler";
import { getJobParams } from "./getJobParams";

/** Called only by configured triggers and reruns, inside their originating transaction. */
export const enqueueJob = async (
  prostgles: Prostgles,
  transaction: JobTransaction,
  name: string,
  owner: JobRecord["owner"],
  options: {
    userId?: string;
    params?: Record<string, unknown>;
    reason?: "trigger" | "rerun";
    occurrence?: Date;
  } = {},
) => {
  const { definition } = getJobDefinition(prostgles, name);
  if (definition.runAs === "user" && !options.userId) {
    throw new Error(`User job ${name} requires a user`);
  }
  const params = await getJobParams(prostgles, definition.params, options.params ?? {});
  const jobs = getJobTableHandler(prostgles, transaction);
  const table = definition.trigger.type === "row" ? definition.trigger.table : null;
  const tableSQL = prostgles.jobs.tableSQL;
  const jobIdColumn =
    definition.trigger.type === "row" ? definition.trigger.jobIdColumn : undefined;
  const rowTable =
    jobIdColumn !== undefined && table !== null ? transaction.dbx[table]! : undefined;
  const ownerFilter = {
    $and: Object.entries(owner).map(([column, value]) => ({ [column]: { $eq: value } })),
  };
  if (rowTable && options.reason === "rerun") {
    // Match row-trigger lock ordering: the owner row before the job advisory lock.
    await rowTable.find(ownerFilter, { select: "", limit: null, forUpdate: true });
  }
  const setJobId = async (jobId: string) => {
    if (!rowTable || jobIdColumn === undefined) return { jobId, ownerRow: undefined };
    // Internal bookkeeping must not recursively enqueue update-triggered jobs.
    const ownerRow = await rowTable.update(
      ownerFilter,
      { [jobIdColumn]: jobId },
      { returning: "*", multi: false },
      undefined,
      { bypassHooks: true },
    );
    return { jobId, ownerRow: ownerRow || undefined };
  };
  // Serialize conflicts for this row without serializing writes to unrelated rows.
  await transaction.t.one("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    stableStringify([tableSQL, name, table, owner]),
  ]);
  if (options.occurrence) {
    const existing = await jobs.findOne({
      job_name: name,
      occurrence: options.occurrence.toISOString(),
    });
    if (existing) return { jobId: existing.id, ownerRow: undefined };
  }
  const active = await jobs.findOne(
    {
      $and: [
        { job_name: name, target_table: table, owner },
        { $or: [{ status: "pending" }, { status: "running" }] },
      ],
    },
    { orderBy: { created_at: 1 } },
  );
  if (active && definition.onConflict === "skip") return setJobId(active.id);
  if (active && definition.onConflict === "replace") {
    await transaction.t.none(
      `
      UPDATE ${tableSQL} 
      SET 
        cancel_requested = TRUE,
        status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
        finished_at = CASE WHEN status = 'pending' THEN clock_timestamp() ELSE finished_at END
      WHERE 
        job_name = $1 
        AND target_table IS NOT DISTINCT FROM $2 
        AND owner = $3:json
        AND status IN ('pending', 'running')`,
      [name, table, owner],
    );
  }
  const jobId = randomUUID();
  await jobs.insert({
    id: jobId,
    job_name: name,
    target_table: table,
    owner,
    params,
    user_id: options.userId ?? null,
    occurrence: options.occurrence?.toISOString() ?? null,
    reason: options.reason ?? "trigger",
    max_attempts: definition.retry?.maxAttempts ?? 1,
    delay_ms: definition.retry?.delayMs ?? 1000,
    backoff: definition.retry?.backoff ?? "fixed",
  });
  return setJobId(jobId);
};

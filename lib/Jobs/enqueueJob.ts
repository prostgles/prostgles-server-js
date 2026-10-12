import { stableStringify } from "prostgles-types";
import { randomUUID } from "node:crypto";
import type { Prostgles } from "../Prostgles";
import { getJobDefinition } from "./getJobDefinition";
import type { JobRecord, JobTransaction } from "./JobTypes";
import { getJobTableHandler } from "./getJobTableHandler";
import { getJobParams } from "./getJobParams";
import { runTableHook } from "../ExecutionContext";

/** Called only by configured triggers and reruns, inside their originating transaction. */
export const enqueueJob = async (
  prostgles: Prostgles,
  transaction: JobTransaction,
  name: string,
  targetRowPkey: JobRecord["target_row_pkey"],
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
  const targetRowFilter =
    table !== null && prostgles.isMedia(table) ?
      { id: targetRowPkey.id }
    : {
        $and: Object.entries(targetRowPkey).map(([column, value]) => ({ [column]: { $eq: value } })),
      };
  if (rowTable && options.reason === "rerun") {
    // Match row-trigger lock ordering: the target row before the job advisory lock.
    await rowTable.find(targetRowFilter, { select: "", limit: null, forUpdate: true });
  }
  const setJobId = async (jobId: string) => {
    if (!rowTable || jobIdColumn === undefined) return { jobId, targetRow: undefined };
    const updateTargetRow = () =>
      rowTable.update(targetRowFilter, { [jobIdColumn]: jobId }, { returning: "*", multi: false });
    // Reruns start outside the generated job hook; give their link update the same ancestry.
    const targetRow =
      options.reason === "rerun" ?
        await runTableHook(rowTable, [targetRowPkey], updateTargetRow, { hookKey: `job:${name}` })
      : await updateTargetRow();
    return { jobId, targetRow: targetRow || undefined };
  };
  // Serialize conflicts for this row without serializing writes to unrelated rows.
  await transaction.t.one("SELECT pg_advisory_xact_lock(hashtextextended(${advisoryLockKey}, 0))", {
    advisoryLockKey: stableStringify([tableSQL, name, table, targetRowPkey]),
  });
  if (options.occurrence) {
    const existing = await jobs.findOne({
      job_name: name,
      occurrence: options.occurrence.toISOString(),
    });
    if (existing) return { jobId: existing.id, targetRow: undefined };
  }
  const active = await jobs.findOne(
    {
      $and: [
        { job_name: name, target_table: table, target_row_pkey: targetRowPkey },
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
        job_name = \${jobName}
        AND target_table IS NOT DISTINCT FROM \${targetTable}
        AND target_row_pkey = \${targetRowPkey:json}
        AND status IN ('pending', 'running')`,
      { jobName: name, targetTable: table, targetRowPkey },
    );
  }
  const jobId = randomUUID();
  await jobs.insert({
    id: jobId,
    job_name: name,
    target_table: table,
    target_row_pkey: targetRowPkey,
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

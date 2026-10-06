import { randomUUID } from "node:crypto";
import type { Prostgles } from "../Prostgles";
import type { JobRecord } from "./JobTypes";
import { getJobTableHandler } from "./getJobTableHandler";

export const claimJob = async (prostgles: Prostgles, name: string, concurrency: number) => {
  const tableSQL = prostgles.jobs.tableSQL;
  return prostgles.dboBuilder.getTX(async (dbx, t) => {
    const jobs = getJobTableHandler(prostgles, { dbx, t });
    await t.one("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify([tableSQL, name])]);
    await t.none(`UPDATE ${tableSQL} SET
      status = CASE WHEN cancel_requested THEN 'cancelled' WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
      error = 'Worker interrupted', lease_token = NULL, locked_until = NULL,
      finished_at = CASE WHEN cancel_requested OR attempts >= max_attempts THEN clock_timestamp() ELSE NULL END
      WHERE job_name = $1 AND status = 'running' AND locked_until < clock_timestamp()`, [name]);
    const count = await jobs.count({ job_name: name, status: "running" });
    if (+count >= concurrency) return;
    return t.oneOrNone<Extract<JobRecord, { status: "running" }>>(`
      WITH next_job AS (
        SELECT j.id FROM ${tableSQL} j
        WHERE j.job_name = $1 AND j.status = 'pending' AND j.run_at <= clock_timestamp()
          AND NOT EXISTS (
            SELECT 1 FROM ${tableSQL} earlier WHERE earlier.job_name = j.job_name
              AND earlier.target_table IS NOT DISTINCT FROM j.target_table AND earlier.owner = j.owner
              AND (earlier.status = 'running' OR (earlier.status = 'pending'
                AND (earlier.created_at, earlier.id) < (j.created_at, j.id)))
          )
        ORDER BY j.created_at, j.id FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE ${tableSQL} j SET status = 'running', attempts = attempts + 1,
        lease_token = $2, locked_until = clock_timestamp() + interval '30 seconds'
      FROM next_job WHERE j.id = next_job.id RETURNING j.*
    `, [name, randomUUID()]);
  });
};

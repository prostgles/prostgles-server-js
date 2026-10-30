import { stableStringify } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { JobRetentionPolicy } from "./getJobRetention";
import { jobError } from "./jobUtils";

export const pruneJobs = async (prostgles: Prostgles, policies: JobRetentionPolicy[]) => {
  const tableSQL = prostgles.jobs.tableSQL;
  for (const policy of policies) {
    try {
      await prostgles.db!.tx(async (transaction) => {
        /* Skip cleanup while a scheduler may still enqueue an occurrence selected before this minute. */
        const { locked } = await transaction.one<{ locked: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked",
          { lockKey: stableStringify([tableSQL, policy.jobName, "schedule"]) },
        );
        if (!locked) return;
        const jobStatusCondition = `job_name = \${jobName} AND status = \${status} AND target_table IS NULL`;
        await transaction.none(
          `WITH count_boundary AS (
            SELECT finished_at, id
            FROM ${tableSQL}
            WHERE ${jobStatusCondition}
              AND \${maxCount}::bigint IS NOT NULL
            ORDER BY 
              finished_at DESC, 
              id DESC 
            OFFSET \${maxCount}::bigint LIMIT 1
          ), expired AS (
            SELECT id
            FROM ${tableSQL}
            WHERE ${jobStatusCondition}
              AND (occurrence IS NULL OR occurrence < date_trunc('minute', statement_timestamp()))
              AND (
                finished_at < statement_timestamp() - \${maxAge}::interval
                OR (finished_at, id) <= (SELECT finished_at, id FROM count_boundary)
              )
            ORDER BY 
              finished_at, 
              id 
            FOR UPDATE SKIP LOCKED 
            LIMIT 1000
          )
          DELETE FROM ${tableSQL} jobs USING expired WHERE jobs.id = expired.id`,
          policy,
        );
      });
    } catch (error) {
      console.error(`Job retention ${policy.jobName}.${policy.status} failed`, jobError(error));
    }
  }
};

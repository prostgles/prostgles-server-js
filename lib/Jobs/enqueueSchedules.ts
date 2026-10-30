import { stableStringify } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import { enqueueJob } from "./enqueueJob";
import { parseCronSchedule } from "./cronSchedule";
import { jobError } from "./jobUtils";

/** Deduplicate scheduled occurrences in PostgreSQL, including across instances and restarts. */
export const enqueueSchedules = async (prostgles: Prostgles, schedules: Map<string, string>) => {
  for (const [name, { trigger }] of Object.entries(prostgles.opts.jobs?.definitions ?? {})) {
    if (trigger.type !== "schedule") continue;
    try {
      const occurrence = await prostgles.dboBuilder.getTX(async (dbx, t) => {
        /* Protect deduplication rows from selection through enqueue, including lock waits. */
        await t.one("SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))", {
          lockKey: stableStringify([prostgles.jobs.tableSQL, name, "schedule"]),
        });
        const { now } = await t.one<{ now: string }>("SELECT clock_timestamp() AS now");
        const occurrence = parseCronSchedule(trigger)(new Date(now));
        if (!occurrence || schedules.get(name) === occurrence.toISOString()) return;
        await enqueueJob(prostgles, { dbx, t }, name, {}, { occurrence });
        return occurrence.toISOString();
      });
      if (occurrence) schedules.set(name, occurrence);
    } catch (error) {
      console.error(`Job schedule ${name} failed`, jobError(error));
    }
  }
};

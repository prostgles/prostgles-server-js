import type { Prostgles } from "../Prostgles";
import { enqueueJob } from "./enqueueJob";
import { parseCronSchedule } from "./cronSchedule";
import { jobError } from "./jobUtils";

/** Deduplicate scheduled occurrences in PostgreSQL, including across instances and restarts. */
export const enqueueSchedules = async (prostgles: Prostgles, schedules: Map<string, string>) => {
  const { now } = await prostgles.db!.one<{ now: string }>("SELECT clock_timestamp() AS now");
  for (const [name, { trigger }] of Object.entries(prostgles.opts.jobs?.definitions ?? {})) {
    if (trigger.type !== "schedule") continue;
    try {
      const occurrence = parseCronSchedule(trigger)(new Date(now));
      if (!occurrence || schedules.get(name) === occurrence.toISOString()) continue;
      await prostgles.dboBuilder.getTX((dbx, t) =>
        enqueueJob(prostgles, { dbx, t }, name, {}, { occurrence }),
      );
      schedules.set(name, occurrence.toISOString());
    } catch (error) {
      console.error(`Job schedule ${name} failed`, jobError(error));
    }
  }
};

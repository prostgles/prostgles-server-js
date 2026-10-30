import { isObject } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { JobRetention } from "./JobTypes";

export const getJobRetention = async (prostgles: Prostgles) => {
  const policies: JobRetentionPolicy[] = [];
  for (const [jobName, definition] of Object.entries(prostgles.opts.jobs?.definitions ?? {})) {
    const retention: unknown = definition.retention;
    if (retention === undefined) {
      if (definition.trigger.type === "schedule") {
        throw new Error(`Invalid job retention for ${jobName}: required for scheduled jobs`);
      }
      continue;
    }
    if (definition.trigger.type !== "schedule" || (retention !== "forever" && !isObject(retention))) {
      throw new Error(
        `Invalid job retention for ${jobName}: expected a scheduled job's status policies or "forever"`,
      );
    }
    if (retention === "forever") continue;
    for (const [status, value] of Object.entries(retention as Record<string, unknown>)) {
      const errorMessage = `Invalid job retention for ${jobName}.${status}`;
      if (status !== "succeeded" && status !== "failed" && status !== "cancelled") {
        throw new Error(`${errorMessage}: expected succeeded, failed or cancelled`);
      }
      if (value === undefined || value === "forever") continue;
      if (typeof value !== "string" && !isObject(value)) {
        throw new Error(`${errorMessage}: expected an interval, forever, or maxAge/maxCount`);
      }
      const policy: Record<string, unknown> = typeof value === "string" ? { maxAge: value } : value;
      if (
        Object.keys(policy).some((key) => key !== "maxAge" && key !== "maxCount") ||
        (policy.maxAge === undefined && policy.maxCount === undefined)
      ) {
        throw new Error(`${errorMessage}: expected an interval, forever, or maxAge/maxCount`);
      }
      const { maxAge, maxCount } = policy;
      if (
        maxCount !== undefined &&
        (typeof maxCount !== "number" || !Number.isSafeInteger(maxCount) || maxCount < 0)
      ) {
        throw new Error(`${errorMessage}: maxCount must be a non-negative safe integer`);
      }
      let interval: string | null = null;
      if (maxAge !== undefined) {
        try {
          if (
            typeof maxAge !== "string" &&
            (typeof maxAge !== "number" || !Number.isFinite(maxAge) || maxAge <= 0)
          ) {
            throw new Error("Expected milliseconds or a PostgreSQL interval");
          }
          interval = typeof maxAge === "number" ? `${maxAge} milliseconds` : maxAge;
          const { valid } = await prostgles.db!.one<{ valid: boolean }>(
            `SELECT isfinite(age) AND age > interval '0' AS valid
             FROM (SELECT \${interval}::interval AS age) parsed`,
            { interval },
          );
          if (!valid) throw new Error("Expected a positive finite interval");
        } catch (cause) {
          throw new Error(`${errorMessage}: maxAge must be a positive finite PostgreSQL interval`, {
            cause,
          });
        }
      }
      policies.push({ jobName, status, maxAge: interval, maxCount: maxCount ?? null });
    }
  }
  return policies;
};

export type JobRetentionPolicy = {
  jobName: string;
  status: keyof Exclude<JobRetention, "forever">;
  maxAge: string | null;
  maxCount: number | null;
};

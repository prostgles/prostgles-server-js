import type { JobValue } from "./JobTypes";

export const assertJobValue: (
  value: unknown,
  ancestors?: Set<object>,
) => asserts value is JobValue = (value, ancestors = new Set<object>()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (
    typeof value !== "object" ||
    ancestors.has(value) ||
    (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
  ) {
    throw new Error("Job data and checkpoints must be finite JSON values");
  }
  ancestors.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value))
    assertJobValue(child, ancestors);
  ancestors.delete(value);
};

export const jobError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class PermanentJobError extends Error {}

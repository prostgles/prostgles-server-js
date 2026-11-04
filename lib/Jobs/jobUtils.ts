import { getSerialisableError } from "prostgles-types";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { JobRecord, JobValue, RowTrigger } from "./JobTypes";

export const getJobPrimaryKeyNames = (table: TableHandler) =>
  table.columns.filter((column) => column.is_pkey).map((column) => column.name);

export const matchesJobTriggerCondition = async (
  table: TableHandler,
  targetRowPkey: JobRecord["target_row_pkey"],
  when: RowTrigger<void, string>["when"],
) => !when || !!(await table.findOne({ $and: [targetRowPkey, when] }));

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

export const jobError = (error: unknown) => getSerialisableError(error) ?? String(error);

export class PermanentJobError extends Error {}

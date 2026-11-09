import { getSerialisableError } from "prostgles-types";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import {
  jobControlStatuses,
  type JobControlOperation,
  type JobRecord,
  type JobValue,
  type RowTrigger,
} from "./JobTypes";

export const getJobPrimaryKeyNames = (table: TableHandler) =>
  table.columns.filter((column) => column.is_pkey).map((column) => column.name);

export const matchesJobTriggerCondition = async (
  table: TableHandler,
  targetRowPkey: JobRecord["target_row_pkey"],
  when: RowTrigger<void, string>["when"],
) => !when || !!(await table.findOne({ $and: [targetRowPkey, when] }));

export const assertJobControlStatus = (job: JobRecord, operation: JobControlOperation) => {
  const allowedStatuses = jobControlStatuses[operation];
  if (allowedStatuses.includes(job.status)) return;
  throw new Error(
    `Job "${job.job_name}" (${job.id}): "${operation}" is not allowed while status is "${job.status}". ` +
      `Allowed statuses: ${allowedStatuses.join(", ")}.`,
  );
};

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

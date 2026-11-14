import type { JobControlOperation } from "./JobTypes";
import { jobControlStatuses } from "./JobTypes";

export type JobControlOperations = JobControlOperation | readonly JobControlOperation[];

export type JobControlSelection =
  | { operation: JobControlOperation; operations?: never }
  | { operations: readonly JobControlOperation[]; operation?: never };

export type SelectedJobControlOperation<Selection extends JobControlOperations> =
  Selection extends readonly JobControlOperation[] ? Selection[number] : Selection;

export type JobControlOperationInput<Selection extends JobControlOperations> =
  Selection extends readonly JobControlOperation[] ? { operation: { enum: Selection } } : {};

export const getJobControlOperationInput = <Selection extends JobControlOperations>(
  selection: Selection,
): JobControlOperationInput<Selection> => {
  const control = getJobControlSelection(selection);
  const operations = control.operations ?? [control.operation];
  if (
    !operations.length ||
    operations.some((operation) => !Object.hasOwn(jobControlStatuses, operation))
  ) {
    throw new Error("Job control requires valid operations");
  }
  return (
    typeof selection === "string" ?
      {}
    : { operation: { enum: [...operations] } }) as JobControlOperationInput<Selection>;
};

export const getJobControlSelection = (selection: JobControlOperations): JobControlSelection =>
  typeof selection === "string" ? { operation: selection } : { operations: [...selection] };

export const getJobControlOperation = (
  selection: JobControlOperations,
  input: { operation?: JobControlOperation },
): JobControlOperation => {
  if (typeof selection === "string") return selection;
  if (!input.operation || !selection.includes(input.operation)) {
    throw new Error(`Job control operation is not allowed: ${input.operation}`);
  }
  return input.operation;
};

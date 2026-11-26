import { isArray } from "../utils/utils";
import type { JobControlFunctionMetadata, JobControlOperation } from "./JobTypes";
import { jobControlStatuses } from "./JobTypes";

export type JobControlOperations = JobControlFunctionMetadata["operation"];

export type SelectedJobControlOperation<Selection extends JobControlOperations> =
  Selection extends readonly JobControlOperation[] ? Selection[number] : Selection;

type JobControlOperationInput<Selection extends JobControlOperations> =
  Selection extends readonly JobControlOperation[] ? { operation: { enum: Selection } } : {};

export const getJobControlOperationInput = <Selection extends JobControlOperations>(
  selection: Selection,
) =>
  (typeof selection === "string" ?
    {}
  : { operation: { enum: selection } }) as JobControlOperationInput<Selection>;

export const getAllowedJobControlOperations = (
  selection: JobControlOperations,
): readonly JobControlOperation[] => {
  const operations = isArray(selection) ? selection : [selection];
  if (
    !operations.length ||
    operations.some((operation) => !Object.hasOwn(jobControlStatuses, operation))
  ) {
    throw new Error("Job control requires valid operations");
  }
  return operations;
};

export const getJobControlOperation = <Selection extends JobControlOperations>(
  selection: Selection,
  input: { operation?: JobControlOperation },
): SelectedJobControlOperation<Selection> => {
  const operations: JobControlOperations = selection;
  const operation = typeof operations === "string" ? operations : input.operation;
  if (!operation || (typeof operations !== "string" && !operations.includes(operation))) {
    throw new Error(`Job control operation is not allowed: ${operation}`);
  }
  return operation as SelectedJobControlOperation<Selection>;
};

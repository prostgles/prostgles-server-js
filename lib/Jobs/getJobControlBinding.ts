import type { Prostgles } from "../Prostgles";
import type { ServerFunctionDefinition } from "../PublishParser/defineServerFunction";
import { getJobDefinition } from "./getJobDefinition";
import { jobControlStatuses, type JobControlBinding } from "./JobTypes";

export const getJobControlBinding = (
  prostgles: Prostgles,
  method: ServerFunctionDefinition,
): JobControlBinding | undefined => {
  const control = method.jobControl;
  if (!control) return;
  const { jobName, operation, operations } = control;
  const { trigger } = getJobDefinition(prostgles, jobName).definition;
  if (trigger.type !== "row" || !trigger.jobIdColumn) {
    throw new Error(`Job control requires a row job with jobIdColumn: ${jobName}`);
  }
  const lookup = method.input?.row;
  if (
    !lookup ||
    typeof lookup === "string" ||
    lookup.type !== "RowLookup" ||
    lookup.table !== trigger.table
  ) {
    throw new Error(`Job control lookup must reference ${trigger.table}`);
  }
  const allowedOperations = operations ?? [operation];
  if (
    !allowedOperations.length ||
    allowedOperations.some((operation) => !Object.hasOwn(jobControlStatuses, operation))
  ) {
    throw new Error(`Invalid job control operations: ${allowedOperations}`);
  }
  if (operations) {
    const operationInput = method.input?.operation;
    if (
      !operationInput ||
      typeof operationInput === "string" ||
      !("enum" in operationInput) ||
      !operationInput.enum ||
      operationInput.optional ||
      operationInput.enum.length !== operations.length ||
      !operations.every((operation) => operationInput.enum.includes(operation))
    ) {
      throw new Error("Job control input must require its allowed operations");
    }
    return {
      jobName,
      rowArg: control.rowArg,
      tableName: prostgles.jobs.tableName,
      columnName: trigger.jobIdColumn,
      operations: Object.fromEntries(
        operations.map((operation) => [operation, jobControlStatuses[operation]]),
      ),
    };
  }
  return {
    ...control,
    tableName: prostgles.jobs.tableName,
    columnName: trigger.jobIdColumn,
    allowedStatuses: jobControlStatuses[operation],
  };
};

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
  const { jobName, operation } = control;
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
  if (!Object.hasOwn(jobControlStatuses, operation)) {
    throw new Error(`Invalid job control operation: ${operation}`);
  }
  return {
    ...control,
    tableName: prostgles.jobs.tableName,
    columnName: trigger.jobIdColumn,
    allowedStatuses: jobControlStatuses[operation],
  };
};

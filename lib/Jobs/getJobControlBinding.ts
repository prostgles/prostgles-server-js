import {
  getFieldTypeObj,
  getFunctionInputVariants,
  getJobControlInputOperations,
  getJSONBSchemaValidationError,
  getObjectEntries,
  fromEntries,
  pickKeys,
  type JSONB,
} from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { ServerFunctionDefinition } from "../PublishParser/defineServerFunction";
import { getJobDefinition, getJobTableName } from "./getJobDefinition";
import { jobControlStatuses, type JobControlBinding } from "./JobTypes";
import { getAllowedJobControlOperations } from "./jobControlFunctionUtils";

export const getJobControlBinding = (
  jobs: Prostgles["opts"]["jobs"],
  method: ServerFunctionDefinition,
): JobControlBinding | undefined => {
  const control = method.jobControl;
  if (!control) return;
  const { jobName, manualJobIdArgName, triggerRowArgName } = control;
  const { trigger } = getJobDefinition(jobs, jobName);
  const operations = getAllowedJobControlOperations(control.operation);
  const variants = getFunctionInputVariants(method.input ?? {});
  const operationsByVariant = variants.map(getJobControlInputOperations);
  const inputOperations = new Set(operationsByVariant.flat());
  const matchesInput =
    typeof control.operation === "string" ?
      variants.every((fields) => !fields.operation)
    : operationsByVariant.every((allowed) => allowed?.length) &&
      inputOperations.size === operations.length &&
      operations.every((operation) => inputOperations.has(operation));
  if (!matchesInput || !variants.length) {
    throw new Error("Job control input must match its configured operation");
  }
  const binding = {
    jobName,
    jobsTableName: getJobTableName(jobs),
    operations: pickKeys(jobControlStatuses, operations),
  };
  const hasField = (
    name: string,
    required: Pick<JSONB.BasicType, "type"> | Pick<JSONB.RowLookup, "type" | "table">,
  ) => {
    const type = fromEntries(
      getObjectEntries(required).map(([key, value]) => [key, { enum: [value] }]),
    );
    return variants.every((fields) => {
      const field = fields[name];
      return (
        field &&
        !getJSONBSchemaValidationError({ type }, getFieldTypeObj(field), {
          allowExtraProperties: true,
        }).error
      );
    });
  };
  if (manualJobIdArgName) {
    if (trigger.type !== "manual" || !hasField(manualJobIdArgName, { type: "string" })) {
      throw new Error(`Manual job control requires a jobId input: ${jobName}`);
    }
    return { ...binding, manualJobIdArgName };
  }
  if (trigger.type !== "row" || !trigger.jobIdColumn) {
    throw new Error(`Job control requires a row job with jobIdColumn: ${jobName}`);
  }
  if (!hasField(triggerRowArgName, { type: "RowLookup", table: trigger.table })) {
    throw new Error(`Job control lookup must reference ${trigger.table}`);
  }
  return { ...binding, triggerRowArgName, rowJobIdColumn: trigger.jobIdColumn };
};

export const validateJobControlBindings = ({
  functions,
  jobs,
}: Pick<Prostgles["opts"], "functions" | "jobs">) => {
  for (const group of Object.values(functions ?? {})) {
    for (const method of Object.values(group.functions)) getJobControlBinding(jobs, method);
  }
};

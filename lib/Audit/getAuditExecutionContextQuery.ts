import { as } from "pg-promise";
import { pickKeys } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { AuditTableRow } from "./AuditTable";
import { AUDIT_EXECUTION_FIELDS, AUDIT_EXECUTION_SETTING } from "../DboBuilder/sessionSettings";

export const getAuditExecutionContextQuery = (prostgles: Prostgles, queryId: string): string => {
  if (!prostgles.opts.audit) return "";
  const execution = prostgles.getExecution();
  const context: AuditTableRow["execution_context"] =
    execution ?
      {
        runId: execution.runId,
        invocations: execution.invocations.map((invocation) => {
          if (invocation.type === "function") {
            return pickKeys(invocation, ["type", "id", "functionName"]);
          }
          if (invocation.type === "jobControl") {
            return pickKeys(invocation, ["type", "id", "jobName", "operation", "tableName"]);
          }
          return pickKeys(invocation, ["type", "id", "tableName"]);
        }),
      }
    : null;
  const auditExecutionSetting =
    context ?
      JSON.stringify({
        [AUDIT_EXECUTION_FIELDS.queryId]: queryId,
        [AUDIT_EXECUTION_FIELDS.context]: context,
      })
    : "";
  return `SET LOCAL ${as.name(AUDIT_EXECUTION_SETTING)} TO ${as.text(auditExecutionSetting)};`;
};

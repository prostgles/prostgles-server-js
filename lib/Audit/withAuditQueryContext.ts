import { pickKeys } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import type { AuditTableRow } from "./AuditTable";
import type { PgQueryInput } from "../getDbConnection";

export const withAuditQueryContext = (prostgles: Prostgles, query: PgQueryInput): PgQueryInput => {
  if (!prostgles.opts.audit) return query;
  const execution = prostgles.getExecution();
  if (typeof query !== "string" && ("submit" in query || query.name)) {
    if (execution) {
      throw new Error(
        "Named prepared statements and custom query objects are not supported within an execution context when audit is enabled",
      );
    }
    return query;
  }
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
  const comment = `\n${AUDIT_EXECUTION_PREFIX}${JSON.stringify(context)}`;
  return typeof query === "string" ? query + comment : { ...query, text: query.text + comment };
};

export const AUDIT_EXECUTION_PREFIX = "-- prostgles execution context: ";

import { randomUUID } from "node:crypto";
import { pickKeys, stableStringify } from "prostgles-types";
import type { AuthClientRequest, SessionUser } from "./Auth/AuthTypes";
import type { ViewHandler } from "./DboBuilder/ViewHandler/ViewHandler";
import type { AuditTableRow } from "./Audit/AuditTable";
import type { Prostgles } from "./Prostgles";

type AuditExecutionContext = NonNullable<AuditTableRow["execution_context"]>;
type AuditInvocation = AuditExecutionContext["invocations"][number];

export type FunctionInvocation = Extract<AuditInvocation, { type: "function" }> & {
  relatedRecords: {
    argName: string;
    tableName: string;
    rowPart: Record<string, unknown>;
  }[];
};

export type TriggerInvocation = Extract<AuditInvocation, { type: "trigger" }> & {
  rowParts: Record<string, unknown>[];
};

export type JobControlInvocation = Extract<AuditInvocation, { type: "jobControl" }> & {
  rowParts: Record<string, unknown>[];
};

type Invocation = FunctionInvocation | TriggerInvocation | JobControlInvocation;

/** Correlation metadata only; database authorization still uses the explicit caller. */
export type ExecutionContext = Omit<AuditExecutionContext, "invocations"> & {
  user: undefined | SessionUser["user"];
  clientReq: undefined | AuthClientRequest;
  /** Invocation ancestry, oldest first. Parallel branches have separate lists. */
  invocations: Invocation[];
};

export const withPreparedJob = <T>(
  prostgles: Prostgles,
  jobId: string,
  prepare: () => Promise<void>,
  operation: () => Promise<T>,
) =>
  prostgles.runWithExecution(
    { ...createExecutionContext(prostgles.getExecution()), jobId },
    async () => {
      await prepare();
      return operation();
    },
  );

/** Record the row parts available to the hook, including rows without primary keys. */
export const runTableHook = <T>(
  table: ViewHandler,
  rows: Record<string, unknown>[],
  callback: () => T,
  hook?: { hookKey: string; preventRecursion?: boolean },
): T | undefined => {
  const prostgles = table.dboBuilder.prostgles;
  const parent = createExecutionContext(prostgles.getExecution());
  if (
    hook?.preventRecursion &&
    parent.invocations.some(
      (invocation) =>
        invocation.type !== "function" &&
        invocation.tableName === table.name &&
        hookKeys.get(invocation) === hook.hookKey &&
        (invocation.type === "trigger" ||
          rows.every((row) =>
            invocation.rowParts.some(
              (primaryKey) =>
                stableStringify(pickKeys(row, Object.keys(primaryKey))) ===
                stableStringify(primaryKey),
            ),
          )),
    )
  ) {
    return;
  }
  const invocation: TriggerInvocation = {
    type: "trigger",
    id: randomUUID(),
    tableName: table.name,
    rowParts: rows,
  };
  if (hook) hookKeys.set(invocation, hook.hookKey);
  return prostgles.runWithExecution(
    { ...parent, invocations: [...parent.invocations, invocation] },
    callback,
  );
};

/** Record explicit row-job control and suppress its automatic enqueue hook during nested writes. */
export const runJobControl = <T>(
  table: ViewHandler,
  row: Record<string, unknown>,
  control: Pick<JobControlInvocation, "jobName" | "operation">,
  callback: () => T,
): T => {
  const prostgles = table.dboBuilder.prostgles;
  const parent = createExecutionContext(prostgles.getExecution());
  const invocation: JobControlInvocation = {
    type: "jobControl",
    id: randomUUID(),
    ...control,
    tableName: table.name,
    rowParts: [row],
  };
  hookKeys.set(invocation, `job:${control.jobName}`);
  return prostgles.runWithExecution(
    { ...parent, invocations: [...parent.invocations, invocation] },
    callback,
  );
};

const hookKeys = new WeakMap<TriggerInvocation | JobControlInvocation, string>();

export const createExecutionContext = (parent: ExecutionContext | undefined): ExecutionContext =>
  parent ?? {
    runId: randomUUID(),
    invocations: [],
    clientReq: undefined,
    user: undefined,
  };

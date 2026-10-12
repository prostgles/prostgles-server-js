import { randomUUID } from "node:crypto";
import { pickKeys, stableStringify } from "prostgles-types";
import type { AuthClientRequest, SessionUser } from "./Auth/AuthTypes";
import type { ViewHandler } from "./DboBuilder/ViewHandler/ViewHandler";
import type { JobControlOperation } from "./Jobs/JobTypes";

export type FunctionInvocation = {
  type: "function";
  id: string;
  functionName: string;
  relatedRecords: {
    argName: string;
    tableName: string;
    rowPart: Record<string, unknown>;
  }[];
};

export type TriggerInvocation = {
  type: "trigger";
  id: string;
  tableName: string;
  rowParts: Record<string, unknown>[];
};

export type JobControlInvocation = {
  type: "jobControl";
  id: string;
  jobName: string;
  operation: JobControlOperation;
  tableName: string;
  rowParts: Record<string, unknown>[];
};

type Invocation = FunctionInvocation | TriggerInvocation | JobControlInvocation;

/** Correlation metadata only; database authorization still uses the explicit caller. */
export type ExecutionContext = {
  runId: string;
  user: undefined | SessionUser["user"];
  clientReq: undefined | AuthClientRequest;
  /** Invocation ancestry, oldest first. Parallel branches have separate lists. */
  invocations: Invocation[];
};

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
                stableStringify(pickKeys(row, Object.keys(primaryKey))) === stableStringify(primaryKey),
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

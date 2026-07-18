import type { AnyObject } from "prostgles-types";
import type { DeleteRule, InsertRule, UpdateRule } from "../../PublishParser/PublishParser";
import { isArray } from "../../utils/utils";
import type { LocalParams } from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { isApplicableHook } from "./isApplicableHook";

/**
 * Prevent same-table same-command after-hook re-entry within the same tx.
 * Allows cross-table and cross-command writes from hooks.
 */
const activeAfterHookKeysByTx = new WeakMap<object, Set<string>>();

export const executeAfterHooksCheckAndPostValidation = async ({
  tableHandler,
  operation,
  data,
  localParams,
  rows,
}: {
  tableHandler: TableHandler;
  operation:
    | { name: "delete"; rule: undefined | DeleteRule }
    | { name: "update"; rule: undefined | UpdateRule }
    | { name: "insert"; rule: undefined | InsertRule };
  localParams: LocalParams | undefined;
  data: AnyObject | AnyObject[];
  rows: AnyObject[];
}) => {
  const command = operation.name;
  const transaction = tableHandler.getTransaction(localParams);
  const hooks = tableHandler.getAfterHooksAndChecks(operation, localParams);
  const newRows = isArray(data) ? data : [data];

  const applicableHooks = hooks.filter((hook) => {
    if (hook.type === "checkFilter") return false;
    if (hook.type === "postValidate") return true;
    return isApplicableHook(tableHandler, newRows, hook, command);
  });

  if (!applicableHooks.length) return;

  if (!transaction) {
    throw new Error("Unexpected: hooks/postValidate require a transaction dbo handler");
  }

  const txParams = {
    tx: transaction.t,
    dbx: transaction.dbTX,
  };

  const txKey = transaction.t as unknown as object;
  const commandKey = `${tableHandler.name}:${command}`;
  const activeKeys = activeAfterHookKeysByTx.get(txKey) ?? new Set<string>();

  if (activeAfterHookKeysByTx.get(txKey) === undefined) {
    activeAfterHookKeysByTx.set(txKey, activeKeys);
  }

  // Re-entrant call caused by hook writes on same table+command: skip to prevent infinite recursion.
  if (activeKeys.has(commandKey)) return;

  activeKeys.add(commandKey);

  try {
    for (const row of rows) {
      const commonParams = {
        row: row,
        ...txParams,
        command,
        data,
      } as const;

      for (const hook of applicableHooks) {
        const isApplicable = isApplicableHook(
          tableHandler,
          [row],
          { commands: { [command]: 1 }, changedFields: hook.changedFields },
          command,
        );
        if (!isApplicable) continue;
        if (hook.type === "afterEach") {
          await hook.validate({
            ...commonParams,
            localParams,
          });
        } else if (hook.type === "postValidate") {
          if (!localParams) throw new Error("Unexpected: no localParams for postValidate");
          await hook.validate({
            ...commonParams,
            localParams,
          });
        }
      }
    }

    for (const hook of applicableHooks) {
      const applicableRows = rows.filter((row) => {
        const isApplicable = isApplicableHook(
          tableHandler,
          [row],
          { commands: { [command]: 1 }, changedFields: hook.changedFields },
          command,
        );
        return isApplicable;
      });
      const applicableData = newRows.filter((row) => {
        const isApplicable = isApplicableHook(
          tableHandler,
          [row],
          { commands: { [command]: 1 }, changedFields: hook.changedFields },
          command,
        );
        return isApplicable;
      });
      if (!applicableRows.length && !applicableData.length) continue;
      if (hook.type === "afterAll") {
        await hook.validate({
          ...txParams,
          command,
          data: applicableData,
          rows: applicableRows,
          localParams,
        });
      }
    }
  } finally {
    activeKeys.delete(commandKey);
    if (!activeKeys.size) {
      activeAfterHookKeysByTx.delete(txKey);
    }
  }
};

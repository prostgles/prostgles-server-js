import type { AnyObject } from "prostgles-types";
import type { DeleteRule, InsertRule, UpdateRule } from "../../PublishParser/PublishParser";
import { isArray } from "../../utils/utils";
import type { LocalParams } from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { isApplicableHook } from "./isApplicableHook";
import { runTableHook } from "../../ExecutionContext";

export const executeAfterHooksCheckAndPostValidation = async ({
  tableHandler,
  operation,
  data,
  localParams,
  rows,
  rowData,
}: {
  tableHandler: TableHandler;
  operation:
    | { name: "delete"; rule: undefined | DeleteRule }
    | { name: "update"; rule: undefined | UpdateRule }
    | { name: "insert"; rule: undefined | InsertRule };
  localParams: LocalParams | undefined;
  data: AnyObject | AnyObject[];
  rows: AnyObject[];
  rowData?: AnyObject[];
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
    ...tableHandler.getTransactionCallbacks(localParams),
  };

  for (const [index, row] of rows.entries()) {
    const commonParams = {
      row: row,
      ...txParams,
      command,
      data,
      context: tableHandler.dboBuilder.prostgles.context,
    } as const;

    for (const hook of applicableHooks) {
      const isApplicable = isApplicableHook(
        tableHandler,
        [rowData?.[index] ?? row],
        { commands: { [command]: 1 }, changedFields: hook.changedFields },
        command,
      );
      if (!isApplicable) continue;
      if (hook.type === "afterEach") {
        await runTableHook(tableHandler, [row], () =>
          hook.validate({
            ...commonParams,
            localParams,
          }),
          hook,
        );
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
    const applicableRows = rows.filter((row, index) => {
      const isApplicable = isApplicableHook(
        tableHandler,
        [rowData?.[index] ?? row],
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
      await runTableHook(tableHandler, applicableRows, () =>
        hook.validate({
          ...txParams,
          command,
          data: applicableData,
          rows: applicableRows,
          localParams,
          context: tableHandler.dboBuilder.prostgles.context,
        }),
        hook,
      );
    } else if (hook.type === "afterCommit" && applicableRows.length) {
      const context = tableHandler.dboBuilder.prostgles.context;
      runTableHook(tableHandler, applicableRows, () =>
        txParams.onCommit(({ db, dbo }) =>
          hook.run({
            rows: applicableRows,
            command,
            context,
            db,
            dbo,
            getClientDBHandlers: tableHandler.dboBuilder.prostgles.getClientDBHandlers,
            localParams,
          }),
        ),
        hook,
      );
    }
  }
};

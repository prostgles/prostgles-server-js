import type { AnyObject } from "prostgles-types";
import type { AfterEachTsTrigger } from "../../PublishParser/PublishParser";
import type { TableHandler } from "./TableHandler";

export const isApplicableHook = (
  tableHandler: TableHandler,
  rows: AnyObject[],
  hook: Pick<AfterEachTsTrigger<AnyObject, any>, "commands" | "changedFields">,
  command: "insert" | "insertOnConflictDoUpdate" | "update" | "delete",
) => {
  let changedFieldsSet = undefined as undefined | Set<string>;
  const getChangedFieldsSet = () => {
    changedFieldsSet ??= new Set(
      tableHandler.column_names.filter((col) => rows.some((row) => row[col] !== undefined)),
    );
    return changedFieldsSet;
  };

  const { commands, changedFields } = hook;
  return Boolean(
    (command === "insertOnConflictDoUpdate" ?
      commands.insert || commands.update
    : commands[command]) &&
    (command === "delete" ||
      !changedFields ||
      changedFields.some((f) => getChangedFieldsSet().has(f))),
  );
};

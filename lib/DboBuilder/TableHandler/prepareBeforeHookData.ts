import { isObject, pickKeys, type AnyObject, type FieldFilter } from "prostgles-types";
import { validateKeys } from "../ViewHandler/ViewHandler";
import type { TableHandler } from "./TableHandler";

export const prepareBeforeHookData = (
  table: TableHandler,
  row: AnyObject,
  fields: FieldFilter | undefined,
  removeDisallowedFields: boolean,
  command: "insert" | "update",
) => {
  const allowed = table.parseFieldFilter(fields, false);
  // Nested table inserts are checked against their own publish rules later.
  const nestedTables =
    command === "insert" && !table.is_media ?
      Object.keys(row).filter(
        (key) =>
          !table.columnSet.has(key) &&
          table.dboBuilder.dboMap.has(key) &&
          (isObject(row[key]) || Array.isArray(row[key]) || row[key] === undefined),
      )
    : [];
  const allowedKeys = [...allowed, ...nestedTables];
  const data = removeDisallowedFields ? pickKeys(row, allowedKeys) : { ...row };
  validateKeys(data, allowedKeys);
  return data;
};

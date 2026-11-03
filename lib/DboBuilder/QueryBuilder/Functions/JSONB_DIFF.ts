import { asNameAlias } from "../../../utils/asNameAlias";
import type { FunctionSpec } from "./Functions";

export const JSONB_DIFF: FunctionSpec = {
  name: "$jsonb_diff",
  type: "function",
  description:
    ":[oldColumn, newColumn] -> Object mapping changed top-level JSON object keys to [oldValue, newValue] pairs of strings or null. Missing values and JSON null become null; other values become text. SQL/JSON null snapshots are treated as empty objects. Unchanged objects return {}. Nested objects and arrays are compared as whole values.",
  numArgs: 2,
  singleColArg: false,
  returnType: "jsonb",
  getFields: (args) => args,
  getQuery: ({ args, tableAliasRaw, allColumns }) => {
    if (args.length !== 2) {
      throw new Error("$jsonb_diff expects two JSONB columns");
    }
    const snapshots = args.map((columnName: string) => {
      if (allColumns.find((column) => column.name === columnName)?.udt_name !== "jsonb") {
        throw new Error("$jsonb_diff expects two JSONB columns");
      }
      return `COALESCE(NULLIF(${asNameAlias(columnName, tableAliasRaw)}, 'null'::jsonb), '{}'::jsonb)`;
    });
    return `(
      SELECT COALESCE(jsonb_object_agg(
        field, jsonb_build_array(before_row ->> field, after_row ->> field)
      ), '{}'::jsonb)
      FROM (SELECT ${snapshots[0]} AS before_row, ${snapshots[1]} AS after_row) AS snapshots
      CROSS JOIN LATERAL jsonb_object_keys(before_row || after_row) AS fields(field)
      WHERE before_row -> field IS DISTINCT FROM after_row -> field
    )`;
  },
};

import { asName, isObject, type SelectParams } from "prostgles-types";
import { pgp } from "../DboBuilder/DboBuilderTypes";
import type { NewQuery } from "../DboBuilder/QueryBuilder/QueryBuilder";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";

export const getSelectRulePushdown = (
  table: ViewHandler,
  query: NewQuery,
  params: SelectParams,
  getVisibility: (field: string) => {
    condition: string;
    alwaysVisible: boolean;
  },
) => {
  // View columns can hide expressions whose evaluation is not safe to move.
  if (table.isView) {
    return { condition: "", suffix: "" };
  }

  const conditions: string[] = [];
  let fullyPushed = true;
  // Only flat conjunctions of strict built-in comparisons are proven here. Groups,
  // NULL tests, casts, functions and scope filters retain their original evaluation.
  for (const [field, filterValue] of Object.entries(query.whereOpts.filter)) {
    const column = table.columns.find((column) => column.name === field);
    const selectedItem = query.select.find((item) => item.alias === field);
    const comparison = isObject(filterValue) ? Object.entries(filterValue) : [["$eq", filterValue]];
    const [operand, value] = comparison[0] ?? [];
    const operator = COMPARISONS.find(([key]) => key === operand)?.[1];
    const isInteger = column && isIntegerColumn(column);
    const isText = column?.udt_name === "text" && column.data_type === "text";
    if (
      !column ||
      (selectedItem && (selectedItem.type !== "column" || selectedItem.columnName !== field)) ||
      comparison.length !== 1 ||
      !operator ||
      (!(isInteger && typeof value === "number" && Number.isSafeInteger(value)) &&
        !(isText && operator === "=" && typeof value === "string"))
    ) {
      fullyPushed = false;
      continue;
    }
    // A strict comparison of a masked NULL can never be true. The visibility guard
    // makes the raw-column predicate equivalent while allowing an index scan.
    const visibility = getVisibility(field);
    // The existing row permission already guards fields shared by every grant.
    const guard = visibility.alwaysVisible ? "" : `(${visibility.condition}) AND `;
    conditions.push(
      `${guard}${asName(field)} OPERATOR(pg_catalog.${operator}) ${pgp.as.format("$1", [value])}`,
    );
  }

  const canPushTopN =
    fullyPushed &&
    query.limit !== null &&
    query.limit >= 0 &&
    !query.offset &&
    !query.tableAlias &&
    !query.joins?.length &&
    !query.having &&
    !params.groupBy &&
    !("forUpdate" in params && params.forUpdate) &&
    query.select.every((item) => item.type === "column") &&
    query.orderByItems.every(({ key, nullEmpty }) => {
      const column = table.columns.find((column) => column.name === key);
      const selectedItem = query.select.find((item) => item.alias === key);
      return (
        column &&
        (isIntegerColumn(column) || (column.udt_name === "text" && column.data_type === "text")) &&
        (!selectedItem || selectedItem.columnName === key) &&
        !nullEmpty &&
        getVisibility(key).alwaysVisible
      );
    });
  const orderBy = query.orderByItems.map(
    ({ key, asc, nulls }) =>
      // Qualify the input column so ORDER BY does not sort the masked output alias.
      `${table.escapedName}.${asName(key)} ${asc ? "ASC" : "DESC"}${nulls ? ` NULLS ${nulls.toUpperCase()}` : ""}`,
  );
  return {
    condition: conditions.map((condition) => `(${condition})`).join(" AND "),
    suffix:
      canPushTopN ?
        `${orderBy.length ? ` ORDER BY ${orderBy.join(", ")}` : ""} LIMIT ${query.limit}`
      : "",
  };
};

const COMPARISONS = [
  ["$eq", "="],
  ["=", "="],
  ["$gt", ">"],
  [">", ">"],
  ["$gte", ">="],
  [">=", ">="],
  ["$lt", "<"],
  ["<", "<"],
  ["$lte", "<="],
  ["<=", "<="],
] as const;

const isIntegerColumn = (column: ViewHandler["columns"][number]) =>
  (
    [
      ["int2", "smallint"],
      ["int4", "integer"],
      ["int8", "bigint"],
    ] as const
  ).some(([type, dataType]) => column.udt_name === type && column.data_type === dataType);

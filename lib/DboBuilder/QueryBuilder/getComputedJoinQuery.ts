import { asName } from "prostgles-types";
import type { NewQuery, NewQueryJoin } from "./QueryBuilder";
import { getJoinOnCondition, getTableJoinAlias } from "../ViewHandler/getTableJoinQuery";
import { prepareOrderByQuery } from "../dboBuilderUtils";
import { asNameAlias } from "../../utils/asNameAlias";
import { JSON_AGG_FIELD_NAME, type GetJoinQueryResult } from "./getJoinQuery";

export const getComputedJoinQuery = (parent: NewQuery, child: NewQueryJoin): GetJoinQueryResult => {
  const alias = child.tableAlias ?? child.table;
  const nestedSorts = parent.orderByItems.filter(
    (item) => item.nested?.joinAlias.raw === child.joinAlias.raw,
  );
  const fields = child.select.filter(
    (field) =>
      field.selected ||
      child.orderByItems.some((item) => item.key === field.alias) ||
      nestedSorts.some((item) => item.nested?.selectItemAlias === field.alias),
  );
  const selectedFields = fields.filter((field) => field.selected);
  const sortColumns = child.orderByItems
    .map((item) => item.key)
    .filter((column) => !fields.some((field) => field.alias === column));
  const pathTables = child.joinPath.map((path, index, paths) => {
    const isLast = index === paths.length - 1;
    return {
      ...path,
      alias: isLast ? alias : getTableJoinAlias(path.table, index),
      expression: isLast ? child.source.expression : path.table,
    };
  });
  const conditions = pathTables.map((path, index) =>
    getJoinOnCondition({
      ...path,
      leftAlias:
        index ?
          pathTables[index - 1]!.alias.escaped
        : (parent.tableAlias?.escaped ?? parent.table.escaped),
      rightAlias: path.alias.escaped,
      getLeftColName: (column) =>
        asName(!index ? (parent.source.joinColumns?.[column] ?? column) : column),
      getRightColName: (column) =>
        asName(
          index === pathTables.length - 1 ? (child.source.joinColumns?.[column] ?? column) : column,
        ),
    }),
  );
  const hasAggregates = fields.some((field) => field.type === "aggregation");
  const groupBy =
    hasAggregates ?
      fields
        .flatMap((field, index) => (field.type === "aggregation" ? [] : [index + 1]))
        .concat(sortColumns.map((_, index) => fields.length + index + 1))
    : [];
  const orderBy = prepareOrderByQuery(child.orderByItems, alias.raw).join(", ");
  const rowOrderBy = prepareOrderByQuery(child.orderByItems, alias.raw, (key) =>
    fields.find((field) => field.alias === key)?.getQuery(alias.raw),
  ).join(", ");
  const rows = [
    `SELECT ${fields
      .map((field) => `${field.getQuery(alias.raw)} AS ${asName(field.alias)}`)
      .concat(sortColumns.map((column) => asNameAlias(column, alias.raw)))
      .join(", ")}`,
    ...pathTables.map((path, index) =>
      index ?
        `INNER JOIN ${path.expression} ${path.alias.escaped} ON (${conditions[index]})`
      : `FROM ${path.expression} ${path.alias.escaped}`,
    ),
    `WHERE ${[conditions[0], child.whereOpts.condition]
      .filter(Boolean)
      .map((condition) => `(${condition})`)
      .join(" AND ")}`,
    groupBy.length ? `GROUP BY ${groupBy.join(", ")}` : "",
    hasAggregates ?
      `HAVING ${["count(*) > 0", child.having]
        .filter(Boolean)
        .map((condition) => `(${condition})`)
        .join(" AND ")}`
    : "",
    rowOrderBy,
    child.limit === null ? "" : `LIMIT ${child.limit}`,
    child.offset ? `OFFSET ${child.offset}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const projection = selectedFields.map((field) => asNameAlias(field.alias, alias.raw)).join(", ");
  const aggregate = `json_agg((SELECT row_to_json(projected.*) FROM (SELECT ${projection}) projected) ${orderBy}) AS ${JSON_AGG_FIELD_NAME}`;
  const query = [
    `SELECT ${[aggregate, ...nestedSorts.map((item) => item.nested!.wrapperQuerySortItem)].join(", ")}`,
    `FROM (${rows}) ${alias.escaped}`,
    child.isLeftJoin ? "" : "HAVING count(*) > 0",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    type: "cte",
    resultAlias: { raw: JSON_AGG_FIELD_NAME, escaped: JSON_AGG_FIELD_NAME },
    firstJoinTableJoinFields: [],
    isOrJoin: false,
    joinLines: [
      `${child.isLeftJoin ? "LEFT" : "INNER"} JOIN LATERAL (${query}) ${alias.escaped} ON TRUE`,
    ],
    cteLines: [],
  };
};

import { asName } from "prostgles-types";
import type { NewQuery, NewQueryJoin } from "./QueryBuilder";
import { getJoinOnCondition } from "../ViewHandler/getTableJoinQuery";
import { prepareOrderByQuery } from "../dboBuilderUtils";
import { asNameAlias } from "../../utils/asNameAlias";
import { getJoinedSelect, JSON_AGG_FIELD_NAME, type GetJoinQueryResult } from "./getJoinQuery";
import { pgp } from "../DboBuilderTypes";

export const getLateralJoinQuery = (parent: NewQuery, child: NewQueryJoin): GetJoinQueryResult => {
  const alias = child.tableAlias ?? child.table;
  const joins = child.joins ?? [];
  const nestedSorts = parent.orderByItems.flatMap((item) =>
    item.nested?.joinAlias.raw === child.joinAlias.raw ? [item.nested] : [],
  );
  const fields = child.select.filter(
    (field) =>
      field.selected ||
      child.orderByItems.some((item) => item.key === field.alias) ||
      nestedSorts.some((item) => item.selectItemAlias === field.alias),
  );
  const reservedAliases = new Set([
    parent.tableAlias?.raw,
    alias.raw,
    ...joins.map((join) => join.joinAlias.raw),
  ]);
  let nextPathIndex = 0;
  const pathTables = child.joinPath.map((path, index, paths) => {
    const isLast = index === paths.length - 1;
    const source = isLast ? child.source : path.source;
    if (!source) throw new Error(`Join source is missing for ${path.table}`);
    if (isLast) return { ...path, alias, source };
    let pathAlias: string;
    do {
      pathAlias = `__prostgles_path_${nextPathIndex++}`;
    } while (reservedAliases.has(pathAlias));
    return { ...path, alias: { raw: pathAlias, escaped: asName(pathAlias) }, source };
  });
  const conditions = pathTables.map((path, index) => {
    const previousPath = pathTables[index - 1];
    if (index && !previousPath) throw new Error("Previous join path is missing");
    return getJoinOnCondition({
      ...path,
      leftAlias:
        previousPath ?
          previousPath.alias.escaped
        : (parent.tableAlias?.escaped ?? parent.table.escaped),
      rightAlias: path.alias.escaped,
      ...(path.computedJoin && {
        getLeftColName: (column) =>
          asName((previousPath?.source ?? parent.source).joinColumns?.[column] ?? column),
        getRightColName: (column) => asName(path.source.joinColumns?.[column] ?? column),
      }),
    });
  });
  const hasAggregates = fields.some((field) => field.type === "aggregation");
  const groupBy =
    hasAggregates ?
      fields
        .flatMap((field, index) => (field.type === "aggregation" ? [] : [String(index + 1)]))
        .concat(
          child.orderByItems
            .filter((item) => !item.nested && !fields.some((field) => field.alias === item.key))
            .map((item) => asNameAlias(item.key, alias.raw)),
        )
    : [];
  const rowOrderBy = prepareOrderByQuery(child.orderByItems, alias.raw, (key) =>
    fields.find((field) => field.alias === key)?.getQuery(alias.raw),
  ).join(", ");
  const rows = [
    `SELECT ${fields
      .map((field) => `${field.getQuery(alias.raw)} AS ${asName(field.alias)}`)
      .concat(joins.map(getJoinedSelect))
      .join(", ")}`,
    ...pathTables.map((path, index) =>
      index ?
        `INNER JOIN ${path.source.expression} ${path.alias.escaped} ON (${conditions[index]})`
      : `FROM ${path.source.expression} ${path.alias.escaped}`,
    ),
    ...joins.flatMap((join) => getLateralJoinQuery(child, join).joinLines),
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
  ]
    .filter(Boolean)
    .join("\n");
  const pagination = [
    child.limit === null ? "" : `LIMIT ${child.limit}`,
    child.offset ? `OFFSET ${child.offset}` : "",
  ].filter(Boolean);
  const parentSorts = nestedSorts.map((item) => item.wrapperQuerySortItem);
  const rankAllMatches = parentSorts.length > 0 && pagination.length > 0;
  const matchingRowsCte = "matching_rows";
  const page = [rankAllMatches ? `SELECT * FROM ${matchingRowsCte}` : rows, ...pagination].join(
    "\n",
  );
  const aggregate = `json_agg(${getJoinedRowJson(child)}) AS ${JSON_AGG_FIELD_NAME}`;
  const pageQuery = [
    `SELECT ${[aggregate, ...(rankAllMatches ? [] : parentSorts)].join(", ")}`,
    `FROM (${page}) ${alias.escaped}`,
    child.isLeftJoin ? "" : "HAVING count(*) > 0",
  ]
    .filter(Boolean)
    .join("\n");
  /* Parent ordering uses every matching child, even when its returned page is empty. */
  const query =
    rankAllMatches ?
      [
        `WITH ${matchingRowsCte} AS (${rows})`,
        `SELECT * FROM (${pageQuery}) page`,
        `CROSS JOIN (SELECT ${parentSorts.join(", ")} FROM ${matchingRowsCte} ${alias.escaped}) parent_sort`,
      ].join("\n")
    : pageQuery;
  return {
    type: "cte",
    firstJoinTableJoinFields: [],
    isOrJoin: false,
    joinLines: [
      `${child.isLeftJoin ? "LEFT" : "INNER"} JOIN LATERAL (${query}) ${alias.escaped} ON TRUE`,
    ],
    cteLines: [],
  };
};

const getJoinedRowJson = (child: NewQueryJoin) => {
  const joins = child.joins ?? [];
  const columns = [
    ...child.select.filter((field) => field.selected).map(({ alias }) => ({ key: alias, alias })),
    ...joins.map((join) => ({ key: join.outputAlias, alias: join.joinAlias.raw })),
  ].map(({ key, alias }) => ({ key, value: asNameAlias(alias, child.joinAlias.raw) }));
  /* Use literal JSON keys when a requested alias is too long or shadows its parent. */
  if (joins.some((join) => join.outputAlias !== join.joinAlias.raw)) {
    const values = columns.map(({ key, value }) => `(${pgp.as.text(key)}, to_json(${value}))`);
    return `(SELECT json_object_agg(key, value) FROM (VALUES ${values.join(", ")}) projected(key, value))`;
  }
  const projection = columns.map(({ value }) => value).join(", ");
  return `(SELECT row_to_json(projected.*) FROM (SELECT ${projection}) projected)`;
};

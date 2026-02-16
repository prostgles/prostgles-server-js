import { isDefined, asName } from "prostgles-types";
import type { ParsedJoinPath } from "../ViewHandler/parseJoinPath";
import { parseJoinPath } from "../ViewHandler/parseJoinPath";
import type { NewQuery, NewQueryJoin } from "./QueryBuilder";
import { type SelectItemValidated } from "./QueryBuilder";
import { ROOT_TABLE_ALIAS, ROOT_TABLE_ROW_NUM_ID, indentLines } from "./getSelectQuery";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import { getJoinOnCondition } from "../ViewHandler/getTableJoinQuery";
import { prepareOrderByQuery } from "../DboBuilder";
import { asNameAlias } from "../../utils/asNameAlias";

type Args = {
  q1: NewQuery;
  q2: NewQueryJoin;
  selectParamsGroupBy: boolean;
};

/**
 * Rename all join columns to prevent name clash
 */
export const getJoinCol = (colName: string) => {
  const alias = asName("prgl_join_col__" + colName);
  return {
    alias,
    rootSelect: `${asName(colName)} AS ${alias}`,
  };
};

export const JSON_AGG_FIELD_NAME = "prostgles_json_agg_result_field";
/**
 * Used for LIMIT and for sorting
 */
export const NESTED_ROWID_FIELD_NAME = "prostgles_rowid_field";

const getJoinTable = (
  tableName: string,
  pathIndex: number,
  isLastTableAlias: string | undefined,
) => {
  const rawAlias = isLastTableAlias ?? `p${pathIndex}  ${tableName}`;
  return {
    // name: asName(tableName), /** table names are already escaped */
    name: tableName,
    alias: asName(rawAlias),
    rawAlias,
  };
};

type GetJoinQueryResult = {
  resultAlias: string;
  firstJoinTableJoinFields: string[];
  isOrJoin: boolean;
  type: "cte";
  joinLines: string[];
  cteLines: string[];
};

/**
  Returns join query. All inner join tables will be prefixed with path index unless it's the final target table which is aliased using the q2 tableAlias

  LEFT JOIN (
    SELECT [target table select + join fields]
    FROM first_join/target_table
    JOIN ..next_joins ON ...
    JOIN target_table
  ) target_table
  ON ...condition
 */
export const getJoinQuery = (viewHandler: ViewHandler, { q1, q2 }: Args): GetJoinQueryResult => {
  const paths = parseJoinPath({
    rootTable: q1.table,
    rawPath: q2.joinPath,
    viewHandler: viewHandler,
    allowMultiOrJoin: true,
    addShortestJoinIfMissing: true,
  });

  if (q2.joins?.length) {
    throw new Error("Nested joins not supported yet");
  }
  const targetTableAliasRaw = q2.tableAlias || q2.table;
  const targetTableAlias = asName(targetTableAliasRaw);

  const firstJoinTablePath = paths[0]!;
  const firstJoinTableJoinFields = firstJoinTablePath.on.flatMap((condObj) =>
    Object.entries(condObj).map(([_source, target]) => target),
  );
  const jsonAggSort = prepareOrderByQuery(q2.orderByItems, targetTableAliasRaw).join(", ");
  const { rootSelectItems, jsonAggLimit } = getNestedSelectFields({
    q: q2,
    firstJoinTableAlias: getJoinTable(
      firstJoinTablePath.table,
      0,
      paths.length === 1 ? targetTableAliasRaw : undefined,
    ).rawAlias,
    _joinFields: firstJoinTableJoinFields,
    jsonAggSort,
  });

  const joinType = q2.isLeftJoin ? "LEFT" : "INNER";

  const joinCondition = getJoinOnCondition({
    on: firstJoinTablePath.on,
    leftAlias: asName(q1.tableAlias || q1.table),
    rightAlias: targetTableAlias,
    getRightColName: (col) => getJoinCol(col).alias,
  });

  const joinFields = rootSelectItems.filter((s) => s.isJoinCol).map((s) => s.alias);
  const selectedFields = rootSelectItems
    .filter((s) => s.selected)
    .map((s) => asNameAlias(s.alias, targetTableAliasRaw));
  const rootNestedSort = q1.orderByItems.filter((d) => d.nested?.joinAlias === q2.joinAlias);
  const jsonAgg = `json_agg((SELECT x FROM (SELECT ${selectedFields.join(", ")}) as x )${jsonAggSort}) ${jsonAggLimit} as ${JSON_AGG_FIELD_NAME}`;

  const { innerQuery } = getInnerJoinQuery({
    paths,
    q1,
    q2,
    rootSelectItems,
    targetTableAliasRaw,
  });

  const requiredJoinFields = joinFields.map((field) => getJoinCol(field).alias);
  /**
   * Used to prevent duplicates in case of OR filters
   */
  const rootTableIdField = `${ROOT_TABLE_ALIAS}.${ROOT_TABLE_ROW_NUM_ID}`;
  /**
   * If multiple join conditions exist it's an OR join
   * Must use LATERAL JOIN to prevent cartesian product
   */
  const isOrJoin = firstJoinTablePath.on.length > 1;
  if (isOrJoin.toString() === "true") {
    const wrappingQuery = [
      `SELECT `,
      ...indentLines(
        [rootTableIdField, jsonAgg, ...rootNestedSort.map((d) => d.nested!.wrapperQuerySortItem)],
        { appendCommas: true },
      ),
      `FROM (`,
      ...indentLines(innerQuery),
      `) ${targetTableAlias}`,
      `WHERE ${joinCondition}`,
      `GROUP BY ${rootTableIdField}`,
    ];
    const joinLines = [
      `${joinType} JOIN LATERAL (`,
      ...wrappingQuery,
      `) as ${targetTableAlias} ON TRUE`,
    ];
    return {
      type: "cte",
      resultAlias: JSON_AGG_FIELD_NAME,
      joinLines,
      cteLines: [],
      isOrJoin,
      firstJoinTableJoinFields,
    };
  }
  const wrappingQuery = [
    `SELECT `,
    ...indentLines(
      [
        ...(isOrJoin ? [rootTableIdField] : requiredJoinFields),
        jsonAgg,
        ...rootNestedSort.map((d) => d.nested!.wrapperQuerySortItem),
      ],
      { appendCommas: true },
    ),
    `FROM (`,
    ...indentLines(innerQuery),
    `) ${targetTableAlias}`,
    ...(isOrJoin ? [`LEFT JOIN ${q1.table} ${ROOT_TABLE_ALIAS}`, `ON ${joinCondition}`] : []),
    `GROUP BY ${isOrJoin ? rootTableIdField : requiredJoinFields.join(", ")}`,
  ];

  /**
   * This is done to prevent join cte names clashing with actual table names
   */
  const targetTableAliasTempRename = asName(`${targetTableAlias}_prostgles_join_temp_rename`);
  const cteLines = [`${targetTableAliasTempRename} AS (`, ...indentLines(wrappingQuery), `)`];

  const joinLines = [
    `${joinType} JOIN ( SELECT * FROM ${targetTableAliasTempRename} ) as ${targetTableAlias}`,
    isOrJoin ?
      `ON ${targetTableAlias}.${ROOT_TABLE_ROW_NUM_ID} = ${rootTableIdField}`
    : `ON ${joinCondition}`,
  ];

  return {
    type: "cte",
    resultAlias: JSON_AGG_FIELD_NAME,
    joinLines,
    cteLines,
    isOrJoin,
    firstJoinTableJoinFields,
  };
};

const getInnerJoinQuery = ({
  paths,
  q1,
  q2,
  targetTableAliasRaw,
  rootSelectItems,
}: {
  paths: ParsedJoinPath[];
  q1: NewQuery;
  q2: NewQueryJoin;
  targetTableAliasRaw: string;
  rootSelectItems: SelectItemNested[];
}) => {
  const innerQuery = paths.flatMap((path, i) => {
    const isLast = i === paths.length - 1;
    const targetQueryExtraQueries: string[] = [];

    const prevTable = getJoinTable(
      !i ?
        q1.tableAlias ?
          asName(q1.tableAlias)
        : q1.table
      : paths[i - 1]!.table,
      i - 1,
      undefined,
    );

    const table = getJoinTable(path.table, i, isLast ? targetTableAliasRaw : undefined);

    if (isLast) {
      if (q2.where) {
        targetQueryExtraQueries.push(q2.where);
      }

      /* If aggs exist need to set groupBy add joinFields into select */
      const aggs = q2.select.filter((s) => s.type === "aggregation");
      if (aggs.length) {
        const groupByFields = rootSelectItems
          .map((c, i) =>
            c.isJoinCol || (c.selected && c.type !== "aggregation") ? `${i + 1}` : undefined,
          )
          .filter(isDefined);
        if (groupByFields.length) {
          targetQueryExtraQueries.push(`GROUP BY ${groupByFields.join(", ")}`);
        }
        if (q2.having) {
          targetQueryExtraQueries.push(`HAVING ${q2.having}`);
        }
      }
    }

    const isFirst = !i;
    if (isFirst) {
      return [
        `SELECT `,
        `  /* Join fields + select */`,
        ...indentLines(
          rootSelectItems.map((s) => s.query),
          { appendCommas: true },
        ),
        `FROM ${table.name} ${table.alias}`,
        ...targetQueryExtraQueries,
      ];
    }

    return [
      `INNER JOIN ${table.name} ${table.alias}`,
      `ON ${getJoinOnCondition({
        on: path.on,
        leftAlias: prevTable.alias,
        rightAlias: table.alias,
      })}`,
      ...targetQueryExtraQueries,
    ];
  });

  return { innerQuery };
};

type GetSelectFieldsArgs = {
  q: NewQueryJoin;
  firstJoinTableAlias: string;
  _joinFields: string[];
  jsonAggSort: string;
};

export type SelectItemNested = SelectItemValidated & {
  query: string;
  isJoinCol: boolean;
};
const getNestedSelectFields = ({
  q,
  firstJoinTableAlias,
  _joinFields,
  jsonAggSort,
}: GetSelectFieldsArgs) => {
  const targetTableAlias = q.tableAlias || q.table;

  const requiredJoinFields = Array.from(new Set(_joinFields));
  const selectedFields = q.select.filter((s) => s.selected);
  const rootSelectItems: SelectItemNested[] = selectedFields
    .map((s) => ({
      ...s,
      isJoinCol: false,
      query: s.getQuery(targetTableAlias) + " AS " + asName(s.alias),
    }))
    .concat(
      requiredJoinFields.map((f) => ({
        type: "column",
        columnName: f,
        fields: [f],
        alias: f,
        getFields: () => [f],
        getQuery: (tableAlias) => asNameAlias(f, tableAlias),
        selected: false,
        isJoinCol: true,
        query: `${asName(firstJoinTableAlias)}.${getJoinCol(f).rootSelect}`,
      })),
    );

  const getQuery = (tableAlias?: string) => {
    const partitionBy = `PARTITION BY ${requiredJoinFields.map((f) => asNameAlias(f, tableAlias)).join(", ")}`;
    return `ROW_NUMBER() OVER(${partitionBy} ${jsonAggSort}) AS ${NESTED_ROWID_FIELD_NAME}`;
  };

  if (q.limit) {
    rootSelectItems.push({
      type: "computed",
      selected: false,
      alias: NESTED_ROWID_FIELD_NAME,
      fields: [],
      getQuery,
      query: getQuery(firstJoinTableAlias),
      isJoinCol: false,
    });
  }

  return {
    rootSelectItems,
    jsonAggLimit: q.limit ? `FILTER (WHERE ${NESTED_ROWID_FIELD_NAME} <= ${q.limit})` : "",
  };
};

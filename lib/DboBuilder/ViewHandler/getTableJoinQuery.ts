import { asName } from "prostgles-types";
import type { PGIdentifier } from "../DboBuilder";
import type { ParsedJoinPath } from "./parseJoinPath";
import { getComputedJoinSQL } from "../joins/computedJoins";

type getTableJoinsArgs = {
  rootTableAlias: string;
  type: "INNER" | "LEFT" | "EXISTS";
  finalWhere?: string;
  finalTableExpression: string;
  path: ParsedJoinPath[];
  rootJoinColumns?: Record<string, string>;
  targetJoinColumns?: Record<string, string>;
};
export const getTableJoinQuery = ({
  path,
  type,
  rootTableAlias,
  finalWhere,
  finalTableExpression,
  rootJoinColumns,
  targetJoinColumns,
}: getTableJoinsArgs): { targetAlias: string; query: string } => {
  const [firstPath] = path;
  if (!firstPath) {
    throw `Cannot create join query for empty path`;
  }
  const getTableAlias = (table: string, pathIndex: number) =>
    getTableJoinAlias(table, pathIndex).escaped;
  const firstJoinColumns = path.length === 1 ? targetJoinColumns : firstPath.source!.joinColumns;

  const query = path
    .map(({ table, on, computedJoin, source }, i) => {
      const tableAlias = getTableAlias(table, i);
      const prevTableAlias = i === 0 ? rootTableAlias : getTableAlias(path[i - 1]!.table, i - 1);
      const leftJoinColumns = i ? path[i - 1]!.source!.joinColumns : rootJoinColumns;
      const rightJoinColumns = i === path.length - 1 ? targetJoinColumns : source!.joinColumns;

      const onCondition = getJoinOnCondition({
        on,
        computedJoin,
        leftAlias: prevTableAlias,
        rightAlias: tableAlias,
        getLeftColName: (column) =>
          asName(computedJoin ? (leftJoinColumns?.[column] ?? column) : column),
        getRightColName: (column) =>
          asName(computedJoin ? (rightJoinColumns?.[column] ?? column) : column),
      });

      const isExists = type === "EXISTS";
      const joinType = isExists ? "INNER" : type;
      const keyword = `${joinType} JOIN`;
      const isLast = i === path.length - 1;
      const isFirst = !i;

      /**
       * rootTable joins to first path
       * first path joins to target table through inner joins
       */
      const whereJoinCondition =
        isLast && isExists ?
          `WHERE (${[
            getJoinOnCondition({
              ...firstPath,
              leftAlias: rootTableAlias,
              rightAlias: getTableAlias(firstPath.table, 0),
              getLeftColName: (column) =>
                asName(firstPath.computedJoin ? (rootJoinColumns?.[column] ?? column) : column),
              getRightColName: (column) =>
                asName(firstPath.computedJoin ? (firstJoinColumns?.[column] ?? column) : column),
            }),
            finalWhere,
          ]
            .filter(Boolean)
            .join(") AND (")})`
        : "";

      const tableSelect = isLast ? finalTableExpression : source!.expression;
      if (isExists && isFirst) {
        return [`SELECT 1`, `FROM ${tableSelect} ${tableAlias}`, whereJoinCondition]
          .filter((v) => v)
          .join("\n");
      }

      return [`${keyword} ${tableSelect} ${tableAlias}`, ` ON ${onCondition}`, whereJoinCondition]
        .filter((v) => v)
        .join("\n");
    })
    .join("\n");

  return {
    query,
    targetAlias: getTableAlias(path.at(-1)!.table, path.length - 1),
  };
};

export const getTableJoinAlias = (table: string, pathIndex: number): PGIdentifier => {
  const prefix = "jd";
  const raw = `${prefix}_${pathIndex}_${table}`;
  return { raw, escaped: asName(raw) };
};

type GetJoinOnConditionArgs = {
  on: Record<string, string>[];
  computedJoin?: ParsedJoinPath["computedJoin"];
  leftAlias: string;
  rightAlias: string;
  getLeftColName?: (col: string) => string;
  getRightColName?: (col: string) => string;
};
export const getJoinOnConditions = ({
  on,
  leftAlias,
  rightAlias,
  getLeftColName = asName,
  getRightColName = asName,
  computedJoin,
}: GetJoinOnConditionArgs) => {
  if (computedJoin) {
    return [
      getComputedJoinSQL(computedJoin, leftAlias, rightAlias, getLeftColName, getRightColName),
    ];
  }
  return on.map((constraint) =>
    Object.entries(constraint)
      .map(([leftCol, rightCol]) => {
        return `${leftAlias}.${getLeftColName(leftCol)} = ${rightAlias}.${getRightColName(rightCol)}`;
      })
      .join(" AND "),
  );
};

export const getJoinOnCondition = (args: GetJoinOnConditionArgs) => {
  return getJoinOnConditions(args).join(" OR ");
};

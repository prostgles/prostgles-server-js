import { asName } from "prostgles-types";
import type { PGIdentifier } from "../DboBuilder";
import type { ParsedJoinPath } from "./parseJoinPath";

type getTableJoinsArgs = {
  rootTableAlias: string;
  type: "INNER" | "LEFT" | "EXISTS";
  finalWhere?: string;
  finalTableExpression?: string;
  path: ParsedJoinPath[];
};
export const getTableJoinQuery = ({
  path,
  type,
  rootTableAlias,
  finalWhere,
  finalTableExpression,
}: getTableJoinsArgs): { targetAlias: string; query: string } => {
  const [firstPath] = path;
  if (!firstPath) {
    throw `Cannot create join query for empty path`;
  }
  const getTableAlias = (table: string, pathIndex: number) =>
    getTableJoinAlias(table, pathIndex).escaped;

  const query = path
    .map(({ table, on }, i) => {
      const tableName = table;
      const tableAlias = getTableAlias(table, i);
      const prevTableAlias = i === 0 ? rootTableAlias : getTableAlias(path[i - 1]!.table, i - 1);

      const onCondition = getJoinOnCondition({
        on,
        leftAlias: prevTableAlias,
        rightAlias: tableAlias,
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
              on: firstPath.on,
              leftAlias: rootTableAlias,
              rightAlias: getTableAlias(firstPath.table, 0),
            }),
            finalWhere,
          ]
            .filter(Boolean)
            .join(") AND (")})`
        : "";

      const tableSelect = isLast ? (finalTableExpression ?? tableName) : tableName;
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
}: GetJoinOnConditionArgs) => {
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

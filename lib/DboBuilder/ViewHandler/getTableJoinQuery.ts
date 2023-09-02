import { JoinPath, asName } from "prostgles-types";
import { ParsedJoinPath } from "./parseJoinPath";

type getTableJoinsArgs = {
  aliasSufix: string;
  rootTableAlias: string;
  type: "INNER" | "LEFT" | "EXISTS";
  finalWhere?: string;
  path: ParsedJoinPath[];
}
export const getTableJoinQuery = ({ path, type, aliasSufix, rootTableAlias, finalWhere }: getTableJoinsArgs): { targetAlias: string; query: string } => {

  const [firstPath] = path;
  if(!firstPath){
    throw `Cannot create join query for empty path`;
  }
  const getTableAlias = (table: string) => asName(`${aliasSufix}_${table}`);

  const query = path.map(({ table, on }, i) => {
    if(!on) throw "on missing";
    const tableName = asName(table);
    const tableAlias = getTableAlias(table);
    const prevTableAlias = i === 0? rootTableAlias : getTableAlias(path[i-1]!.table);

    const onCondition = getJoinOnCondition(on, prevTableAlias, tableAlias);

    const isExists = type === "EXISTS"
    const joinType = isExists? "INNER" : type;
    const keyword = `${joinType} JOIN`;
    const isLast = i === path.length - 1;

    /**
     * rootTable joins to first path
     * first path joins to target table through inner joins
     */
    const whereJoinCondition = (isLast && isExists) ? 
      `WHERE (${getJoinOnCondition(
      firstPath.on, 
      rootTableAlias, 
      getTableAlias(firstPath.table)
    )})` : "";

    const tableSelect = (isExists && isLast)? [
      `(`, 
      `SELECT *`,
      `FROM ${tableName}`,
      (finalWhere? `WHERE ${finalWhere}` : ""),
      `)`
    ].filter(v=>v).join("\n") : tableName;
    if(isExists && !i){
      return [
        `SELECT 1`,
        `FROM ${tableSelect} ${tableAlias}`,
        whereJoinCondition
      ].filter(v=>v).join("\n");
    }

    return [
      `${keyword} ${tableName} ${tableAlias}`,
      ` ON ${onCondition}`,
      whereJoinCondition
    ].filter(v=>v).join("\n");

  }).join("\n");

  return {
    query,
    targetAlias: getTableAlias(path.at(-1)!.table)
  }
}
export const getJoinOnCondition = (on: Record<string, string>[], leftAlias: string, rightAlias: string) => {
  return on.map(constraint => Object.entries(constraint).map(([leftCol, rightCol]) => {
    return `${leftAlias}.${leftCol} = ${rightAlias}.${rightCol}`;
  }).join(" AND ")).join(" OR ")
}
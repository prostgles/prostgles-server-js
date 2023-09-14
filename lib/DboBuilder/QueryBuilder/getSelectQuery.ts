
import { prepareSort } from "../../DboBuilder";
import { isDefined, asName } from "prostgles-types";
import { NewQuery, asNameAlias } from "./QueryBuilder";
import { ViewHandler } from "../ViewHandler/ViewHandler";
import { getJoinCol, getJoinQuery } from "./getJoinQuery";

/**
 * Creating the text query from the NewQuery spec
 * No validation/authorisation at this point 
 * */
export function getSelectQuery(
  viewHandler: ViewHandler,
  q: NewQuery,
  depth = 0,
  selectParamsGroupBy: boolean,
): string {

  const shouldGroupBy = selectParamsGroupBy || !!q.joins?.length;
  const rootTableAlias = 'prostgles_root_table_alias';
  const rootSelect = q.select.filter(s => s.selected).map(s => [s.getQuery(rootTableAlias), " AS ", asName(s.alias)].join(""));

  const parsedJoins = q.joins?.flatMap(q2 => {
    const parsed = getJoinQuery(
      viewHandler, { 
        q1: { ...q, tableAlias: rootTableAlias }, 
        q2: { ...q2 }, 
        depth: depth + 1, 
        selectParamsGroupBy: shouldGroupBy 
      }
    );
    return {
      ...q2,
      ...parsed
    }
  }) ?? [];

  const selectItems = rootSelect.concat(
    parsedJoins?.map(join => {
      const joinAlias = join.tableAlias || join.table
      const selectedFields = join.select.filter(s => s.selected).map(s => asNameAlias(s.alias, joinAlias));
      /** Used to ensure the json array object has named properties */
      const jsonAggSelect = `SELECT x FROM (SELECT ${selectedFields}) as x`;
      /** Used to: 
       *  1) prevent arrays with a single null element when no rows were matched 
       *  2) allow nested limit
       * */
      const joinAggNonNullArrayElemFilter = join.targetTableJoinFields
        .map(f => `${joinAlias}.${getJoinCol(f).alias} IS NOT NULL`)
        .concat(join.limitFieldName? [`${asNameAlias(join.limitFieldName, joinAlias)} <= ${join.limit}`] : [])
        .join(" AND ");
        
      const nestedOrderBy = join.orderByItems.length? prepareSort(join.orderByItems, joinAlias).join(", ") : ""
      return (`COALESCE(json_agg((${jsonAggSelect}) ${nestedOrderBy}) FILTER (WHERE ${joinAggNonNullArrayElemFilter}), '[]'::JSON) as ${joinAlias}`);
    }) ?? []);
  
  const query = [
    `SELECT`
    ,...indentLines(selectItems, { appendCommas: true })
    , `FROM ( `
    , `  SELECT * `
    , `  FROM ${q.table}`
    , `  ${q.where}`
    , `) ${rootTableAlias}`
    , ...parsedJoins.flatMap(j => j.queryLines)
    , ...getRootGroupBy(q, selectParamsGroupBy)
    , ...prepareSort(q.orderByItems)
    , ...(q.having ? [`HAVING ${q.having} `] : [])
    , ...(depth ? [] : [`LIMIT ${q.limit || 0}`])
    , ...(q.offset? [`OFFSET ${q.offset || 0}`] : [])
  ];

  return indentLinesToString(query);
}

const indentLine = (numberOfSpaces: number, str: string, indentStr = "    "): string => new Array(numberOfSpaces).fill(indentStr).join("") + str;
type IndentLinesOpts = {
  numberOfSpaces?: number;
  indentStr?: string;
  appendCommas?: boolean;
}
export const indentLines = (strArr: (string | undefined | null)[],  { numberOfSpaces = 2, indentStr = " ", appendCommas = false }: IndentLinesOpts = {}): string[] => {
  const nonEmptyLines = strArr
    .filter(v => v);

  return nonEmptyLines.map((str, idx) => {
      const res = indentLine(numberOfSpaces, str as string, indentStr);
      if(appendCommas && idx < nonEmptyLines.length - 1){
        return `${res},`;
      }
      return res;
    });
}
const indentLinesToString = (strArr: (string | undefined | null)[], numberOfSpaces = 0, separator = " \n ", indentStr = " ") => indentLines(strArr, { numberOfSpaces, indentStr }).join(separator);
const getTableAlias = (q: NewQuery) => !q.tableAlias ? q.table : `${q.tableAlias || ""}_${q.table}`;
export const getTableAliasAsName = (q: NewQuery) => asName(getTableAlias(q));


export const getRootGroupBy = (q: NewQuery, selectParamsGroupBy?: boolean) => {

  const aggs = q.select.filter(s => s.selected && s.type === "aggregation");
  const nonAggs = q.select.filter(s => s.selected && s.type !== "aggregation");
  
  if ((selectParamsGroupBy || aggs.length || q.joins && q.joins.length) && nonAggs.length) {
    
    /** Add ORDER BY items not included in root select */
    const orderByItems: string[] = [];
    q.orderByItems.forEach(sortItem => {
      if (!sortItem.nested && "fieldQuery" in sortItem && !orderByItems.includes(sortItem.fieldQuery)) {
        orderByItems.push(sortItem.fieldQuery);
      }
    });

    return [`GROUP BY ${q.select.map((s, i)=> s.selected && s.type !== "aggregation"? `${i+1}` : undefined).concat(orderByItems).filter(isDefined).join(", ")} `]
  }

  return []
}
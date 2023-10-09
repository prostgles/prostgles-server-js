
import { prepareOrderByQuery } from "../../DboBuilder";
import { isDefined, asName } from "prostgles-types";
import { NewQuery } from "./QueryBuilder";
import { ViewHandler } from "../ViewHandler/ViewHandler";
import { getJoinQuery } from "./getJoinQuery"; 

/**
 * Used to prevent single row nested results in case of OR join conditions
 */
export const ROOT_TABLE_ROW_NUM_ID = "prostgles_root_table_row_id" as const;
export const ROOT_TABLE_ALIAS = 'prostgles_root_table_alias' as const;

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

  const rootSelect = q.select.filter(s => s.selected).map(s => [s.getQuery(ROOT_TABLE_ALIAS), " AS ", asName(s.alias)].join(""));

  const parsedJoins = q.joins?.flatMap(q2 => {
    const parsed = getJoinQuery(
      viewHandler, 
      { 
        q1: { ...q, tableAlias: ROOT_TABLE_ALIAS }, 
        q2: { ...q2 }, 
        depth: depth + 1, 
        selectParamsGroupBy 
      }
    );
    return {
      ...q2,
      ...parsed
    }
  }) ?? [];

  const selectItems = rootSelect.concat(
    parsedJoins?.map(join => {
      const { joinAlias } = join;
      return `COALESCE(${asName(joinAlias)}.${join.resultAlias}, '[]') as ${asName(joinAlias)}`
    }) ?? []);

  /** OR joins cannot be easily aggregated to one-many with the root table. Must group by root table id */
  const hasOrJoins = parsedJoins.some(j => j.isOrJoin)
  
  let joinCtes = !parsedJoins.length? [] : [
    ...parsedJoins.flatMap((j, i) => {
      const needsComma = parsedJoins.length > 1 && i < parsedJoins.length -1;
      return j.cteLines.concat(needsComma? [","] : []);
    })
  ];

  
  if(hasOrJoins){
    const pkey = viewHandler.columns.find(c => c.is_pkey);
    joinCtes = [
      `${q.table} AS (`,
      `  SELECT *, ${pkey? asName(pkey.name): "ROW_NUMBER() OVER()"} as ${ROOT_TABLE_ROW_NUM_ID}`,
      `  FROM ${q.table}`,
      `),`,
      ...joinCtes
    ]
  }

  if(joinCtes.length){
    joinCtes.unshift(`WITH `)
  }

  const query = [
    ...joinCtes,
    `SELECT`
    ,...indentLines(selectItems, { appendCommas: true })
    , `FROM ( `
    , `  SELECT *`
    , `  FROM ${q.table}`
    , ...(q.where? [`  ${q.where}`] : [])
    , `) ${ROOT_TABLE_ALIAS}`
    , ...parsedJoins.flatMap(j => j.joinLines)
    , ...getRootGroupBy(q, selectParamsGroupBy)
    , ...prepareOrderByQuery(q.orderByItems)
    , ...(q.having ? [`HAVING ${q.having} `] : [])
    , ...(depth || q.limit === null ? [] : [`LIMIT ${q.limit || 0}`])
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
  
  if ((selectParamsGroupBy || aggs.length) && nonAggs.length) {
    
    /** Add ORDER BY items not included in root select */
    const orderByItems: string[] = [];
    // q.orderByItems.forEach(sortItem => {
    //   if (!sortItem.nested && "fieldQuery" in sortItem && !orderByItems.includes(sortItem.fieldQuery)) {
    //     orderByItems.push(sortItem.fieldQuery);
    //   }
    // });

    return [`GROUP BY ${q.select.map((s, i)=> s.selected && s.type !== "aggregation"? `${i+1}` : undefined).concat(orderByItems).filter(isDefined).join(", ")} `]
  }

  return []
}
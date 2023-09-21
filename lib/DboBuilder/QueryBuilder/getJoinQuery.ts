import { isDefined, asName } from "prostgles-types";
import { parseJoinPath } from "../ViewHandler/parseJoinPath";
import { NewQuery, NewQueryJoin, SelectItem, asNameAlias } from "./QueryBuilder";
import { indentLines } from "./getSelectQuery";
import { ViewHandler } from "../ViewHandler/ViewHandler";
import { getJoinOnCondition } from "../ViewHandler/getTableJoinQuery";

type Args = {
  q1: NewQuery;
  q2: NewQueryJoin;
  depth: number;
  selectParamsGroupBy: boolean;
}

/**
 * Rename all join columns to prevent name clash
 */
export const getJoinCol = (colName: string) => {
  const alias = asName("prgl_join_col__" + colName);
  return {
    alias,
    rootSelect: `${asName(colName)} AS ${alias}`,
  }
}

const getJoinTable = (tableName: string, pathIndex: number, isLastTableAlias: string | undefined) => {
  const rawAlias = isLastTableAlias ?? `p${pathIndex}  ${tableName}`; 
  return {
    // name: asName(tableName), /** table names are already escaped */
    name: tableName,
    alias: asName(rawAlias),
    rawAlias,
  }
}

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
export const getJoinQuery = (viewHandler: ViewHandler, { q1, q2, depth }: Args): { queryLines: string[]; targetTableJoinFields: string[]; limitFieldName?: string; } => {
  const paths = parseJoinPath({ rootTable: q1.table, rawPath: q2.joinPath, viewHandler: viewHandler, allowMultiOrJoin: true, addShortestJoinIfMissing: true, })

  const targetTableAliasRaw = q2.tableAlias || q2.table;
  const targetTableAlias = asName(targetTableAliasRaw);
  
  const firstJoinTablePath = paths[0]!;
  const firstJoinTableJoinFields = firstJoinTablePath.on.flatMap(condObj => Object.entries(condObj).map(([source, target]) => target));
  const { rootSelectItems, limitFieldName } = getSelectFields({ 
    q: q2, 
    firstJoinTableAlias: getJoinTable(firstJoinTablePath.table, 0, paths.length === 1? targetTableAliasRaw : undefined).rawAlias, 
    _joinFields: firstJoinTableJoinFields 
  });

  const joinType = q2.isLeftJoin? "LEFT" : "INNER";
  const innerQuery = paths.flatMap((path, i) => {
    
    const isLast = i === paths.length - 1;
    const targetQueryExtraQueries: string[] = [];
    // const prevTableAlias = !i? (q1.tableAlias ?? q1.table) : `t${i-1}`;
    // const tableAlias = isLast? targetTableAlias : asName(`t${i}`);

    const prevTable = getJoinTable(!i? (q1.tableAlias? asName(q1.tableAlias) : q1.table) : paths[i-1]!.table, i-1, undefined);
    // const tableAlias = isLast? targetTableAlias : asName(path.table);
    const table = getJoinTable(path.table, i, isLast? targetTableAliasRaw : undefined);

    if(isLast){
      if(q2.where){
        targetQueryExtraQueries.push(q2.where);
      }

      /* If aggs exist need to set groupBy add joinFields into select */
      const aggs = q2.select.filter(s => s.type === "aggregation")
      if (aggs.length) {
        const groupByFields = rootSelectItems.map((c, i) => (c.isJoinCol || c.selected && c.type !== "aggregation")? `${i+1}` : undefined ).filter(isDefined);
        if(groupByFields.length){
          targetQueryExtraQueries.push(`GROUP BY ${groupByFields}`)
        }
      }
    }

    const isFirst = !i;
    if(isFirst){
      return [
        `SELECT `,
        `  /* Join fields + select */`, 
        ...indentLines(rootSelectItems.map(s => s.query), { appendCommas: true }),
        `FROM ${table.name} ${table.alias}`,
        ...targetQueryExtraQueries
      ]
    }

    return [
      `INNER JOIN ${table.name} ${table.alias}`,
      `ON ${getJoinOnCondition({ on: path.on, leftAlias: prevTable.alias, rightAlias: table.alias})}`,
      ...targetQueryExtraQueries
    ]
  });

  const queryLines = [
    `${joinType} JOIN (`,
    ...indentLines(innerQuery),
    `) ${targetTableAlias}`,
    `ON ${getJoinOnCondition({ 
      on: firstJoinTablePath.on, 
      leftAlias: asName(q1.tableAlias || q1.table), 
      rightAlias: targetTableAlias, 
      getRightColName: (col) => getJoinCol(col).alias
    })}`
  ];

  return {
    queryLines,
    limitFieldName,
    targetTableJoinFields: firstJoinTableJoinFields,
  }
}


type GetSelectFieldsArgs = {
  q: NewQueryJoin | NewQuery;
  firstJoinTableAlias: string;
  _joinFields: string[];
}
const getSelectFields = ({ q, firstJoinTableAlias, _joinFields }: GetSelectFieldsArgs) => {
  const targetTableAlias = (q.tableAlias || q.table);
  const limitFieldName = q.limit? "prostgles_nested_limit" : undefined;
  const requiredJoinFields = Array.from(new Set(_joinFields))
  const selectedFields = q.select.filter(s => s.selected);
  const rootSelectItems: (SelectItem & { query: string; isJoinCol: boolean; })[] = selectedFields 
    .map(s => ({ 
      ...s,
      isJoinCol: false,
      query: s.getQuery(targetTableAlias) + " AS " + asName(s.alias)
    }))
    .concat(requiredJoinFields.map(f => ({
      type: "column",
      columnName: f,
      alias: f,
      getFields: () => [f],
      getQuery: (tableAlias) => asNameAlias(f, tableAlias),
      selected: false,
      isJoinCol: true,
      query: `${asName(firstJoinTableAlias)}.${getJoinCol(f).rootSelect}`,
    })));

  if(limitFieldName){
    const getQuery = (tableAlias?: string) => `ROW_NUMBER() OVER( PARTITION BY ${requiredJoinFields.map(f => asNameAlias(f, tableAlias))}) AS ${asName(limitFieldName)}`;
    rootSelectItems.push({
      type: "computed",
      selected: false,
      alias: limitFieldName,
      getFields: () => [],
      getQuery,
      query: getQuery(firstJoinTableAlias),
      isJoinCol: false,
    })
  }
  return { rootSelectItems, limitFieldName };
}

/** Multiple joins where some are one to many will lead to duplicates in all other nested columns */
const removeMultiJoinDupes = {
  /**
   * 1) add a "prostgles_cartesian_rowid" to each join before last SELECT clause: 
    ROW_NUMBER() OVER( PARTITION BY all_join_cols_up_to_here (what about multi col joins??) ) as prostgles_cartesian_rowid
   */
  addJoinSelectCartesianRowid: ({ joinIndex, totalJoins, selectQueries, allAliasedJoinColsUpToHere }: { joinIndex: number; totalJoins: number; selectQueries: string[]; allAliasedJoinColsUpToHere: string[] }) => {
    if(joinIndex < totalJoins - 1){
      return [
        ...selectQueries,
        /* (what about multi col joins??) */
        `ROW_NUMBER() OVER( PARTITION BY ${allAliasedJoinColsUpToHere} ) as prostgles_cartesian_rowid`
      ]
    }

    return selectQueries;
  },
  /**
   * 3) add this condition to the WHERE clause of each join (ensure any existing OR conditions will not break it)
    AND (the join condition)
    <this to each join after first:
    AND (prostgles_cartesian_rowid IS NULL OR prostgles_cartesian_rowid = 1)
   */
  addJoinWhereClause: ({ where, joinCondition, joinIndex }: { where: string; joinIndex: number; joinCondition: string; }) => {
    return `${!where? "WHERE " : where} AND (${joinCondition})${joinIndex? ` AND (prostgles_cartesian_rowid IS NULL OR prostgles_cartesian_rowid = 1)` : ""}`
  }
}

/**
 * 
 * TODO
console.error(`
2) add lateral to all joins
4) Each join innerQuery must be nested to allow the nested LIMIT:
  root_table
  LEFT JOIN (
    SELECT *
    FROM (
      SELECT ..., ROW_NUMBER() OVER( PARTITION BY my_join_cols ) as prostgles_nested_limit
      ...innerJoinQuery
    ) t
    WHERE t.prostgles_nested_limit < <desired limit>
  )
`);
 * 
 * 
 * 
 */
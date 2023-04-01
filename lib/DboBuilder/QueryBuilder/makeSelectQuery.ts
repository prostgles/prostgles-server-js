
import { prepareSort } from "../../DboBuilder";
import { SelectParams, asName } from "prostgles-types";
import { NewQuery, SelectItem } from "./QueryBuilder";
import { TableHandler } from "../TableHandler";

/**
 * Creating the text query from the NewQuery spec
 * No validation/authorisation at this point */
export function makeSelectQuery(
  _this: TableHandler,
  q: NewQuery, 
  depth = 0, 
  joinFields: string[] = [],
  selectParams: SelectParams = {},
): string {
  const PREF = `prostgles`,
      joins = q.joins || [],
      // aggs = q.aggs || [],
      getTableAlias = (q: NewQuery) => !q.tableAlias? q.table : `${q.tableAlias || ""}_${q.table}`,
      getTableJoinAliasAsName = (joinAlias: string | undefined, table: string) => asName(!joinAlias? table : `${joinAlias || ""}_${table}`),
      getTableAliasAsName = (q: NewQuery) => asName(getTableAlias(q));

  const indentLine = (numberOfSpaces: number, str: string, indentStr = "    "): string => new Array(numberOfSpaces).fill(indentStr).join("") + str;
  
  const indentArray = (numberOfSpaces: number, strArr: string[], indentStr = "    "): string[] => strArr.map(str => indentLine(numberOfSpaces, str, indentStr) );

  const indentArrayAndJoin = (numberOfSpaces: number, strArr: string[], separator = " \n ", indentStr = "    ") => indentArray(numberOfSpaces, strArr, indentStr).join(separator);

  const appendCommas = (strArr: string[]): string[] => strArr.map((s, i, arr)=> s + (i < arr.length - 1? " , " : " "));

  const createAlias = (q: NewQuery, str: string) => asName(`${q.tableAlias || q.table}_${PREF}_${str}`);

  // const indent = (a, b) => a;
  const joinTables = (q1: NewQuery, q2: NewQuery): { t1Alias: string; t2Alias: string; query: string[]; rowidSortedColName: string; rowidDupesColName: string; jsonColName: string; limitColName: string; q: NewQuery }=> {
    const joinInfo = _this.getJoins(q1.table, q2.table, q2.$path, true);
    const paths = joinInfo.paths;

    let rowidSortedColName = "";
    let rowidDupesColName = "";
    let jsonColName = "";
    let t2Alias = "";
    let limitColName = "";
    const t1Alias = q.table;

    const queries = paths.flatMap(({ table, on }, i): { query: string[]; prevTable: string; thisAlias: string; } => {
      const getColName = (col: string, q: NewQuery) => {
        if(table === q.table){
          const colFromSelect = q.select.find(s => s.getQuery() === asName(col));
          if(!colFromSelect){
            console.error(`${col} column might be missing in user publish `);
            throw `Could not find join column (${col}) in allowe select. Some join tables and columns might be invalid/dissallowed`
          }
          return colFromSelect.alias;
        }

        return col;
      }

      const getPrevColName = (col: string) => {
        return getColName(col, q1);
      }
      const getThisColName = (col: string) => {
        return getColName(col, q2);
      }

      // console.log(JSON.stringify({i, table, on, q1, q2}, null, 2));

      const prevTable = i === 0? t1Alias : (paths[i - 1]!.table);
      const thisAlias = getTableJoinAliasAsName(q2.tableAlias, table);
      
      const prevAlias =  i === 0? getTableAliasAsName(q1) : getTableJoinAliasAsName(q2.tableAlias, prevTable);

      /* If root then prev table is aliased from root query. Alias from join otherwise  */
      let iQ = [
        asName(table) + ` ${thisAlias}`
      ];

      /* If target table then add filters, options, etc */
      if(i === paths.length - 1){
          
          const targetSelect = q2.select.filter(s => s.selected).map(s => {
              /* Rename aggs to avoid collision with join cols */
              if(s.type === "aggregation") return asName(`agg_${s.alias}`) + " AS " + asName(s.alias);
              return asName(s.alias);
            }).concat(q2.joins?.map(j => asName(j.table)) ?? []).join(", ");

          const leafSelect = makeSelectQuery(
            _this, 
            q2, 
            depth + 1,
            on.flatMap(cond => cond.map(([c1, c2]) => asName(c2))),
            selectParams,
          ).split("\n");

          t2Alias = thisAlias;
          rowidSortedColName = createAlias(q2, `rowid_sorted`);
          rowidDupesColName = createAlias(q2, `dupes_rowid`);
          limitColName = createAlias(q2, `limit`);
          jsonColName = createAlias(q2, `json`)

          iQ = [
            "("
            ,...indentArray(depth + 1, [
                  `-- 4. [target table] `
              ,   `SELECT *,`
              ,   `row_number() over() as ${rowidSortedColName},`
              ,   `row_to_json((select x from (SELECT ${targetSelect}) as x)) AS ${jsonColName}`
              ,   `FROM (`
              ,   ...indentArray(depth + 2, leafSelect)
              ,   `) ${asName(q2.table)}    `
            ]),
            `) ${thisAlias}`
          ]
      }

      const getJoinCondition = (t1Alias: string, t2Alias: string,  on: [string, string][][]) => {
        return on.map(cond => cond.map(([c1, c2]) => 
          `${t1Alias}.${asName(getPrevColName(c1))} = ${t2Alias}.${asName(getThisColName(c2))} `
          ).join(" AND ")
        ).join(" OR ")
      }

      const query: string[] = [
          `${q2.isLeftJoin? "LEFT" : "INNER"} JOIN `
      , ...iQ
      ,   `ON ${getJoinCondition(prevAlias, thisAlias, on)}`
      ];
      return { query, prevTable, thisAlias };
    });

    return { q: q2, query: queries.flatMap(q => q.query), t1Alias: q.table, t2Alias, rowidSortedColName: rowidSortedColName, jsonColName, rowidDupesColName, limitColName  }
  }

  const getGroupBy = (rootSelectItems: SelectItem[], groupByItems: SelectItem[]): string => {
    if(groupByItems.length){

      /** Root Select column index number is used where possible to prevent "non-integer constant in GROUP BY" error */
      return `GROUP BY ` + groupByItems.map(gi => {
        const idx = rootSelectItems.findIndex(si => si.alias === gi.alias);
        if(idx < 0) throw `Could not find GROUP BY column ${gi.alias} in ROOT SELECT ${rootSelectItems.map(s => s.alias)}`;
        return idx + 1;
      }).join(", ")
    }

    return "";
  }
      
  /* Leaf query with no joins -> return simple query */
  const aggs = q.select.filter(s => s.type === "aggregation");
  const nonAggs = q.select.filter(s => depth || s.selected).filter(s => s.type !== "aggregation");
  if(!joins.length){

    /* Nested queries contain all fields to allow joining */
    let groupBy = "";

    const rootSelectItems = q.select.filter(s => joinFields.includes(s.getQuery()) || s.selected)

    /* If aggs exist need to set groupBy add joinFields into select */
    if(aggs.length || selectParams?.groupBy){

        if(nonAggs.length){
          const groupByFields = nonAggs.filter(sf => !depth || joinFields.includes(sf.getQuery()));
          groupBy = getGroupBy(rootSelectItems, groupByFields);
        }
    }

    const simpleQuery = indentArrayAndJoin(depth, [
        `-- 0. or 5. [leaf query] `
        
        /* Group by selected fields + any join fields */
    ,   `SELECT ` + rootSelectItems.map(s => {
            // return s.getQuery() + ((s.type !== "column")? (" AS " + s.alias) : "")
            
            if(s.type === "aggregation"){
              /* Rename aggs to avoid collision with join cols */
              return s.getQuery() + " AS " + asName((depth? "agg_" : "") + s.alias);
            }
            return s.getQuery() + " AS " + asName(s.alias)
      }).join(", ")
    ,   `FROM ${asName(q.table)} `
    ,   q.where
    ,   groupBy //!aggs.length? "" : `GROUP BY ${nonAggs.map(sf => asName(sf.alias)).join(", ")}`,
    ,   q.having? `HAVING ${q.having}` : ""
    ,   prepareSort(q.orderByItems)
    ,   !depth? `LIMIT ${q.limit} ` : null
    ,   !depth? `OFFSET ${q.offset || 0} ` : null
    ].filter(v => v && (v + "").trim().length) as unknown as string[]);
    
    // console.log(fres);
    return simpleQuery;
  } else {
    // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
    if(
      q.select.find(s => s.type === "aggregation") && 
      joins.find(j => j.select.find(s => s.type === "aggregation"))
    ) throw "Cannot join two aggregates";
  }

  if(joins && joins.length && (aggs.length || selectParams.groupBy)) throw "Joins within Aggs dissallowed";

  // if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
  
  const rootSelectItems = q.select.filter(s => depth || s.selected)

  let rootGroupBy: string | undefined;
  if((selectParams.groupBy || aggs.length || q.joins && q.joins.length) && nonAggs.length){
    const groupByItems = (depth? 
      q.allFields.map(f => asName(f)) : 
      nonAggs.map(s => s.type === "function"? s.getQuery() : asName(s.alias))
    ).concat(
      (aggs?.length)? 
        [] : 
        [`ctid`]
    ).filter(s => s);

    /** Add ORDER BY items not included in root select */
    q.orderByItems.forEach(sortItem => {
      if("fieldQuery" in sortItem && !groupByItems.includes(sortItem.fieldQuery)){
        groupByItems.push(sortItem.fieldQuery);
      }
    })

    rootGroupBy = `GROUP BY ${groupByItems.join(", ")} `
  }

  const parsedJoins = joins.map(j => joinTables(q, j));

  /* Joined query */
  const joinedQuery = [
      " \n"
  ,   `-- 0. [joined root]  `
  ,   "SELECT    "
  ,...appendCommas(rootSelectItems.map(s => s.getQuery() + " AS " + asName(s.alias)).concat(
    parsedJoins.map((j, i)=> {

        /** Apply LIMIT to joined items */
        const jsq = `json_agg(${j.jsonColName}::jsonb ORDER BY ${j.rowidSortedColName}) FILTER (WHERE ${j.limitColName} <= ${j.q.limit} AND ${j.rowidDupesColName} = 1 AND ${j.jsonColName} IS NOT NULL)`;
        const resAlias = asName(j.q.tableAlias || j.q.table)

        /* If limit = 1 then return a single json object (first one) */
        return (j.q.limit === 1? `${jsq}->0 ` : `COALESCE(${jsq}, '[]') `) +  `  AS ${resAlias}`;
      })
    ))
  ,   `FROM ( `
  ,   ...indentArray(depth + 1, [
          "-- 1. [subquery limit + dupes] "
      ,   "SELECT     "
      ,    ...appendCommas([`t1.*`].concat(
              parsedJoins.map((j, i)=> {
                  return  `row_number() over(partition by ${j.rowidDupesColName}, ` + 
                      `ctid order by ${j.rowidDupesColName}) AS ${j.limitColName}  `
              }))
          )
      ,   `FROM ( ----------- ${getTableAliasAsName(q)}`
      ,   ...indentArray(depth + 1, [
              "-- 2. [source full select + ctid to group by] "
          ,   "SELECT "
          ,   ...appendCommas(
                  q.allFields.concat(["ctid"])
                  .map(field => `${getTableAliasAsName(q)}.${asName(field)}  `)
                  .concat(
                    parsedJoins.map((j, i) => 
                      j.t2Alias + "." + j.jsonColName + ", " + 
                      j.t2Alias + "." + j.rowidSortedColName + ", " + 
                      `row_number() over(partition by ` +
                        `${j.t2Alias}.${j.rowidSortedColName}, ` +
                        `${getTableAliasAsName(q)}.ctid ) AS ${j.rowidDupesColName}`
                    )
                  )
                    
              )
          ,   `FROM ( `
          ,   ...indentArray(depth + 1, [
                  "-- 3. [source table] "
              ,   "SELECT "
              ,   "*, row_number() over() as ctid "
              ,   `FROM ${asName(q.table)} `
              ,   `${q.where} `
              ])
          ,   `) ${getTableAliasAsName(q)} `
          ,   ...joins.flatMap((j, i) => joinTables(q, j).query)
          ])
      ,   ") t1"
      ])
  ,   ") t0"
  ,   rootGroupBy
  ,   q.having? `HAVING ${q.having} ` : ""
  ,   prepareSort(q.orderByItems)
  ,   depth? null : `LIMIT ${q.limit || 0} OFFSET ${q.offset || 0}`
  ,   "-- EOF 0. joined root"
  ,   " \n"
  ].filter(v => v)

  const res = indentArrayAndJoin(depth, joinedQuery as unknown as string[]);
  // res = indent(res, depth);
  // console.log(res);
  return res;
}

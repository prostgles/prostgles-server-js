import { AnyObject, EXISTS_KEY, EXISTS_KEYS, FieldFilter, JoinPath, asName } from "prostgles-types";
import { ExistsFilterConfig, JoinInfo, LocalParams } from "../../DboBuilder";
import { ViewHandler } from "./ViewHandler";
import { TableRule } from "../../PublishParser";
import { TableHandler } from "../TableHandler";
import { parseJoinPath } from "./parseJoinPath";
import { getTableJoinQuery } from "./getTableJoinQuery";


export async function getExistsCondition(this: ViewHandler, eConfig: ExistsFilterConfig, localParams: LocalParams | undefined): Promise<string> {

  const thisTable = this.name;
  const isNotExists = ["$notExists", "$notExistsJoined"].includes(eConfig.existType);

  const { targetTableFilter, tables, isJoined, shortestJoin } = eConfig;
  const targetTable = tables.at(-1)!;

  /** Check if join tables are valid */
  tables.forEach(t => {
    if (!this.dboBuilder.dbo[t]) {
      throw { stack: ["prepareExistCondition()"], message: `Invalid or dissallowed table: ${t}` };
    }
  });

  /* Nested $exists is not allowed */
  if (targetTableFilter && Object.keys(targetTableFilter).find(fk => EXISTS_KEYS.includes(fk as EXISTS_KEY))) {
    throw { stack: ["prepareExistCondition()"], message: "Nested exists dissallowed" };
  } 

  let t2Rules: TableRule | undefined = undefined,
    forcedFilter: AnyObject | undefined,
    filterFields: FieldFilter | undefined,
    tableAlias;

  /* Check if allowed to view data - forcedFilters will bypass this check through isForcedFilterBypass */
  if (localParams?.isRemoteRequest && !localParams?.socket && !localParams?.httpReq) {
    throw "Unexpected: localParams isRemoteRequest and missing socket/httpReq: ";
  }
  if ((localParams?.socket || localParams?.httpReq) && this.dboBuilder.publishParser) {

    t2Rules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ 
      tableName: targetTable, 
      command: "find", 
      localParams 
    }) as TableRule;

    if (!t2Rules || !t2Rules.select) throw "Dissallowed";
    ({ forcedFilter, filterFields } = t2Rules.select);
  }

  const tableHandler = this.dboBuilder.dbo[targetTable] as TableHandler
  const finalWhere = (await tableHandler.prepareWhere({
    filter: targetTableFilter,
    forcedFilter,
    filterFields,
    addKeywords: false,
    tableAlias,
    localParams,
    tableRule: t2Rules
  })).where

  let innerQuery = [
    `SELECT 1`,
    `FROM ${asName(targetTable)}`,
    `${finalWhere ? `WHERE ${finalWhere}` : ""}`
  ].join("\n");

  if(isJoined){
    
    const joinPath = parseJoinPath({ rootTable: thisTable, path: shortestJoin? ["**", ...tables] : tables, viewHandler: this });
    const { query } = getTableJoinQuery({
      path: joinPath,
      aliasSufix: "jd",
      rootTableAlias: thisTable,
      type: "EXISTS",
      finalWhere,
    });
    innerQuery = query;
  }

  return `${isNotExists ? " NOT " : " "} EXISTS ( \n${innerQuery} \n) `;

}

type Args = {
  joinInfo: JoinInfo;
  joinPathIndex?: number;
  thisTable: string;
  finalFilter: string;
}
// const getJoinQuery = (args: Args): string => {
//   const { joinInfo, joinPathIndex = 0, thisTable, finalFilter } = args;

//   const { paths } = joinInfo;
//   const joinPath = paths[joinPathIndex];
//   if (!joinPath) throw "joinPath undefined";

//   const table = joinPath.table;
//   const tableAlias = asName(joinPathIndex < paths.length - 1 ? `jd${joinPathIndex}` : table);
//   const prevTableAlias = asName(joinPathIndex ? `jd${joinPathIndex - 1}` : thisTable);

//   const cond = joinPath.on.map(c => {
//     return c.map(([c1, c2]) => 
//       `${prevTableAlias}.${asName(c1)} = ${tableAlias}.${asName(c2)}`
//     ).join(" AND ")
//   }).join("\n OR ");

//   const isLastJoin = joinPathIndex === paths.length - 1
//   let joinQuery = `SELECT 1 \n` +
//     `FROM ${asName(table)} ${tableAlias} \n` +
//     `WHERE (${cond}) \n`;
//   if (
//     isLastJoin &&
//     finalFilter
//   ) {
//     joinQuery += `AND ${finalFilter} \n`;
//   }

//   const indent = (a: any, _b: any) => a;

//   if (!isLastJoin) {
//     joinQuery += `AND ${getJoinQuery({ 
//       ...args,
//       joinPathIndex: joinPathIndex + 1
//     })} \n`
//   }

//   joinQuery = indent(joinQuery, joinPathIndex + 1);
//   return joinQuery;
// }

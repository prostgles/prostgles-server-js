import { AnyObject, EXISTS_KEY, EXISTS_KEYS, FieldFilter, JoinPath, asName } from "prostgles-types";
import { ExistsFilterConfig, JoinInfo, LocalParams } from "../../DboBuilder";
import { ViewHandler } from "./ViewHandler";
import { TableRule } from "../../PublishParser";
import { TableHandler } from "../TableHandler";

export async function getExistsCondition(this: ViewHandler, eConfig: ExistsFilterConfig, localParams: LocalParams | undefined): Promise<string> {

  let res = "";
  const thisTable = this.name;
  const isNotExists = ["$notExists", "$notExistsJoined"].includes(eConfig.existType);

  const { f2, tables, isJoined } = eConfig;
  const t2 = tables.at(-1)!;

  tables.forEach(t => {
    if (!this.dboBuilder.dbo[t]) throw { stack: ["prepareExistCondition()"], message: `Invalid or dissallowed table: ${t}` };
  });

  /* Nested $exists not allowed ??! */
  if (f2 && Object.keys(f2).find(fk => EXISTS_KEYS.includes(fk as EXISTS_KEY))) {
    throw { stack: ["prepareExistCondition()"], message: "Nested exists dissallowed" };
  }

  const makeTableChain = (finalFilter: string) => {

    let joinPaths: JoinInfo["paths"] = [];
    let expectOne = true;
    tables.forEach((t2, depth) => {
      const t1 = (depth ? tables[depth - 1] : thisTable)!;
      let exactPaths: JoinPath | undefined = [{ table: t2 }];

      if (!depth && eConfig.shortestJoin) exactPaths = undefined;
      const jinf = this.getJoins(t1, t2, exactPaths, true);
      expectOne = Boolean(expectOne && jinf.expectOne)
      joinPaths = joinPaths.concat(jinf.paths);
    });

    return getJoinQuery({
      joinInfo: { paths: joinPaths, expectOne },
      thisTable,
      finalFilter,
      isNotExists,
    });
  }

  let finalWhere = "";

  let t2Rules: TableRule | undefined = undefined,
    forcedFilter: AnyObject | undefined,
    filterFields: FieldFilter | undefined,
    tableAlias;

  /* Check if allowed to view data - forcedFilters will bypass this check through isForcedFilterBypass */
  if (localParams?.isRemoteRequest && (!localParams?.socket && !localParams?.httpReq)) throw "Unexpected: localParams isRemoteRequest and missing socket/httpReq: ";
  if (localParams && (localParams.socket || localParams.httpReq) && this.dboBuilder.publishParser) {

    t2Rules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: t2, command: "find", localParams }) as TableRule;
    if (!t2Rules || !t2Rules.select) throw "Dissallowed";
    ({ forcedFilter, filterFields } = t2Rules.select);
  }

  finalWhere = (await (this.dboBuilder.dbo[t2] as TableHandler).prepareWhere({
    filter: f2,
    forcedFilter,
    filterFields,
    addKeywords: false,
    tableAlias,
    localParams,
    tableRule: t2Rules
  })).where

  if (!isJoined) {
    res = `${isNotExists ? " NOT " : " "} EXISTS (SELECT 1 \nFROM ${asName(t2)} \n${finalWhere ? `WHERE ${finalWhere}` : ""}) `
  } else {
    res = makeTableChain(finalWhere);
  }
  return res;

}

type Args = {
  joinInfo: JoinInfo;
  ji?: number;
  thisTable: string;
  finalFilter: string;
  isNotExists: boolean;
}
const getJoinQuery = (args: Args): string => {
  const { joinInfo, ji = 0, thisTable, finalFilter, isNotExists } = args;

  const { paths } = joinInfo;
  const jp = paths[ji];
  if (!jp) throw "jp undef";

  const table = jp.table;
  const tableAlias = asName(ji < paths.length - 1 ? `jd${ji}` : table);
  const prevTableAlias = asName(ji ? `jd${ji - 1}` : thisTable);

  const cond = `${jp.on.map(c => {
    return c.map(([c1, c2]) => `${prevTableAlias}.${asName(c1)} = ${tableAlias}.${asName(c2)}`).join(" AND ")
  }).join("\n OR ")
    }`;

  let joinQuery = `SELECT 1 \n` +
    `FROM ${asName(table)} ${tableAlias} \n` +
    `WHERE (${cond}) \n`;//
  if (
    ji === paths.length - 1 &&
    finalFilter
  ) {
    joinQuery += `AND ${finalFilter} \n`;
  }

  const indent = (a: any, _b: any) => a;

  if (ji < paths.length - 1) {
    joinQuery += `AND ${getJoinQuery({ 
      ...args,
      joinInfo, 
      ji: ji + 1
    })} \n`
  }

  joinQuery = indent(joinQuery, ji + 1);

  const result = `${isNotExists ? " NOT " : " "} EXISTS ( \n` +
    joinQuery +
  `) \n`;
  return indent(result, ji);
}
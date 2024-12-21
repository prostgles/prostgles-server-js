import { AnyObject, EXISTS_KEY, EXISTS_KEYS, FieldFilter, asName } from "prostgles-types";
import { LocalParams, ExistsFilterConfig } from "../DboBuilder";
import { ViewHandler } from "./ViewHandler";
import { TableRule } from "../../PublishParser/PublishParser";
import { TableHandler } from "../TableHandler/TableHandler";
import { getTableJoinQuery } from "./getTableJoinQuery";

export async function getExistsCondition(
  this: ViewHandler,
  eConfig: ExistsFilterConfig,
  localParams: LocalParams | undefined
): Promise<string> {
  const thisTable = this.name;
  const isNotExists = ["$notExists", "$notExistsJoined"].includes(eConfig.existType);

  const { targetTableFilter } = eConfig;

  /* Nested $exists is not allowed */
  if (Object.keys(targetTableFilter).find((fk) => EXISTS_KEYS.includes(fk as EXISTS_KEY))) {
    throw {
      stack: ["prepareExistCondition()"],
      message: "Nested exists dissallowed",
    };
  }

  let t2Rules: TableRule | undefined = undefined,
    forcedFilter: AnyObject | undefined,
    filterFields: FieldFilter | undefined,
    tableAlias;

  /* Check if allowed to view data - forcedFilters will bypass this check through isForcedFilterBypass */
  if (localParams?.isRemoteRequest && !localParams.clientReq) {
    throw "Unexpected: localParams isRemoteRequest and missing clientReq";
  }
  const targetTable = eConfig.isJoined ? eConfig.parsedPath.at(-1)!.table : eConfig.targetTable;
  if (localParams?.clientReq && this.dboBuilder.publishParser) {
    t2Rules = (await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({
      tableName: targetTable,
      command: "find",
      clientReq: localParams.clientReq,
    })) as TableRule | undefined;

    if (!t2Rules || !t2Rules.select) throw "Dissallowed";
    ({ forcedFilter, filterFields } = t2Rules.select);
  }

  const tableHandler = this.dboBuilder.dbo[targetTable] as TableHandler;
  const finalWhere = (
    await tableHandler.prepareWhere({
      select: undefined,
      filter: targetTableFilter,
      forcedFilter,
      filterFields,
      addWhere: false,
      tableAlias,
      localParams,
      tableRule: t2Rules,
    })
  ).where;

  let innerQuery = [
    `SELECT 1`,
    `FROM ${asName(targetTable)}`,
    `${finalWhere ? `WHERE ${finalWhere}` : ""}`,
  ].join("\n");

  if (eConfig.isJoined) {
    const { query } = getTableJoinQuery({
      path: eConfig.parsedPath,
      rootTableAlias: thisTable,
      type: "EXISTS",
      finalWhere,
    });
    innerQuery = query;
  }

  return `${isNotExists ? " NOT " : " "} EXISTS ( \n${innerQuery} \n) `;
}

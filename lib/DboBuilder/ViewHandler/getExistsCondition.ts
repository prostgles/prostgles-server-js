import type { EXISTS_KEY } from "prostgles-types";
import { EXISTS_KEYS } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { ExistsFilterConfig, LocalParams } from "../DboBuilder";
import { getQuerySourceSQL } from "../QueryBuilder/getQuerySource";
import { getTableJoinAlias, getTableJoinQuery } from "./getTableJoinQuery";
import type { ViewHandler } from "./ViewHandler";
import { prepareWhere } from "./prepareWhere";

export async function getExistsCondition(
  this: ViewHandler,
  eConfig: ExistsFilterConfig,
  rootTableAlias: string | undefined,
  localParams: LocalParams | undefined,
  rootJoinColumns: Record<string, string> | undefined,
): Promise<string> {
  const rootTable = this.name;
  const isNotExists = ["$notExists", "$notExistsJoined"].includes(eConfig.existType);

  const { targetTableFilter } = eConfig;

  /* Nested $exists is not allowed */
  if (Object.keys(targetTableFilter).find((fk) => EXISTS_KEYS.includes(fk as EXISTS_KEY))) {
    throw {
      stack: ["prepareExistCondition()"],
      message: "Nested exists disallowed",
    };
  }

  /* Check if allowed to view data - forcedFilters will bypass this check through isForcedFilterBypass */
  if (localParams?.isRemoteRequest && !localParams.clientReq) {
    throw "Unexpected: localParams isRemoteRequest and missing clientReq";
  }

  let targetTableRules = (targetTableFilter as FilterWithTableRules)[EXISTS_TABLE_RULES];
  const targetTable = eConfig.isJoined ? eConfig.parsedPath.at(-1)!.table : eConfig.targetTable;
  const tableHandler = this.dboBuilder.dboMap.get(targetTable);
  if (!tableHandler) {
    throw `Table handler for ${targetTable} not found`;
  }
  if (localParams?.clientReq) {
    if (!this.dboBuilder.publishParser) {
      throw "Unexpected: missing publishParser";
    }
    targetTableRules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr(
      {
        tableName: targetTable,
        command: "find",
        clientReq: localParams.clientReq,
      },
      localParams.scope,
    );

    if (!targetTableRules.select) throw "Disallowed";
  }

  const targetAlias =
    eConfig.isJoined ? getTableJoinAlias(targetTable, eConfig.parsedPath.length - 1) : undefined;
  const whereOpts = await prepareWhere(tableHandler, {
    select: undefined,
    selectParams: {},
    filter: targetTableFilter,
    forcedFilter: targetTableRules?.select?.forcedFilter,
    filterFields: targetTableRules?.select?.filterFields,
    tableRule: targetTableRules,
    addWhere: false,
    tableAlias: targetAlias,
    localParams,
  });
  const { source: targetSource, where: finalWhere } = whereOpts;
  eConfig.targetTableColumns = whereOpts.columnsUsed;
  eConfig.rowPermissionTables = [
    ...(targetSource.rowPermissionTables ?? []),
    ...(eConfig.isJoined ?
      eConfig.parsedPath.flatMap((part) => part.source?.rowPermissionTables ?? [])
    : []),
  ];
  eConfig.dependencyTables = [
    ...(eConfig.isJoined ? eConfig.parsedPath.map(({ table }) => table) : [targetTable]),
    ...eConfig.rowPermissionTables,
    ...whereOpts.exists.flatMap((filter) => filter.dependencyTables ?? []),
  ];

  let innerQuery = [
    `SELECT 1`,
    `FROM ${getQuerySourceSQL(targetSource)}`,
    `${finalWhere ? `WHERE ${finalWhere}` : ""}`,
  ].join("\n");

  if (eConfig.isJoined) {
    const { query } = getTableJoinQuery({
      path: eConfig.parsedPath,
      rootTableAlias: rootTableAlias ?? rootTable,
      type: "EXISTS",
      finalWhere,
      finalTableExpression: targetSource.expression,
      rootJoinColumns,
      targetJoinColumns: targetSource.joinColumns,
    });
    innerQuery = query;
  }

  return `${isNotExists ? " NOT " : " "} EXISTS ( \n${innerQuery} \n) `;
}

const EXISTS_TABLE_RULES = Symbol("existsTableRules");
type FilterWithTableRules = ExistsFilterConfig["targetTableFilter"] & {
  [EXISTS_TABLE_RULES]?: ParsedTableRule;
};

/** Internal inferred permissions reuse the target's normalized select rule. */
export const withExistsTableRules = (tableRules: ParsedTableRule): FilterWithTableRules => ({
  [EXISTS_TABLE_RULES]: tableRules,
});

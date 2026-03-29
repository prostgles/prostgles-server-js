import { getObjectEntries, isObject } from "prostgles-types";
import type { AuthResultWithSID } from "../Auth/AuthTypes";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import type { PublishParser } from "./PublishParser";
import type { DboTable, ParsedPublishTable } from "./publishTypesAndUtils";
import { TABLE_RULE_NO_LIMITS, type PublishObject } from "./publishTypesAndUtils";

export async function getTableRulesWithoutFileTable(
  this: PublishParser,
  { tableName, clientReq }: DboTable,
  clientInfo: AuthResultWithSID | undefined,
  overridenPublish?: PublishObject,
): Promise<ParsedPublishTable | undefined> {
  if (!tableName) {
    throw new Error("tableName is missing in getTableRules");
  }

  const publish =
    overridenPublish ?? (clientReq && (await this.getPublishObject(clientReq, clientInfo)));

  const rawTableRule = publish?.[tableName];
  if (!rawTableRule || (isObject(rawTableRule) && Object.values(rawTableRule).every((v) => !v))) {
    return undefined;
  }

  /* Get view or table specific rules */
  const tableHandler = this.dbo[tableName] as TableHandler | ViewHandler | undefined;
  if (!tableHandler) {
    throw {
      stack: ["getTableRules()"],
      message: `${tableName} could not be found in dbo`,
    };
  }

  const is_view = tableHandler.is_view;

  /**
   * Allow subscribing to a view if it has primary key columns from other tables
   */
  const canSubscribe = !is_view || tableHandler.columns.some((c) => c.references);

  const isStarOrTrue = (value: any): value is "*" | true => value === "*" || value === true;
  const { privileges } = tableHandler.tableOrViewInfo;
  const tableRulesObject =
    isStarOrTrue(rawTableRule) ?
      {
        select: privileges.select ? TABLE_RULE_NO_LIMITS.select : undefined,
        insert: privileges.insert ? TABLE_RULE_NO_LIMITS.insert : undefined,
        update: privileges.update ? TABLE_RULE_NO_LIMITS.update : undefined,
        delete: privileges.delete ? TABLE_RULE_NO_LIMITS.delete : undefined,
      }
    : rawTableRule;

  const selectRule =
    !tableRulesObject.select ? undefined
    : isStarOrTrue(tableRulesObject.select) ? TABLE_RULE_NO_LIMITS.select
    : tableRulesObject.select;
  const insertRule =
    !tableRulesObject.insert ? undefined
    : isStarOrTrue(tableRulesObject.insert) ? TABLE_RULE_NO_LIMITS.insert
    : tableRulesObject.insert;
  const updateRule =
    !tableRulesObject.update ? undefined
    : isStarOrTrue(tableRulesObject.update) ? TABLE_RULE_NO_LIMITS.update
    : tableRulesObject.update;
  const deleteRule =
    !tableRulesObject.delete ? undefined
    : isStarOrTrue(tableRulesObject.delete) ? TABLE_RULE_NO_LIMITS.delete
    : tableRulesObject.delete;

  const parsedTableRule: ParsedPublishTable = {
    select: selectRule && {
      ...selectRule,
      disableMethods:
        canSubscribe ?
          selectRule.disableMethods
        : {
            ...selectRule.disableMethods,
            subscribe: 1,
          },
      subscribeThrottle: selectRule.subscribeThrottle ?? 0,
    },
    insert: insertRule,
    update: updateRule,
    delete: deleteRule,
  };

  const cannotBatchUpdate =
    !parsedTableRule.update ||
    parsedTableRule.update.checkFilter ||
    parsedTableRule.update.postValidate;

  if (cannotBatchUpdate && parsedTableRule.update) {
    parsedTableRule.update.disableMethods = {
      updateBatch: 1,
    };
  }
  getObjectEntries(parsedTableRule).forEach(([publishCommand, publishValue]) => {
    if (!publishValue) {
      return;
    }

    const pgUserIsAllowedThisCommand = tableHandler.tableOrViewInfo.privileges[publishCommand];
    if (!pgUserIsAllowedThisCommand) {
      throw `Current postgres user is not allowed ${publishCommand} on table ${tableName}`;
    }
  });

  return parsedTableRule;
}

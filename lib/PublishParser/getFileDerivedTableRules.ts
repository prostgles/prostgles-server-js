import { fromEntries } from "prostgles-types";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { LocalParams } from "../DboBuilder/DboBuilder";
import type { PublishParser } from "./PublishParser";
import type {
  ParsedPublishTable,
  ParsedTableRule,
  PublishObject,
  SelectRule,
} from "./publishTypesAndUtils";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";
import {
  getSelectRules,
  hasSelectRules,
  mergeSelectRuleOptions,
  mergeSelectRules,
} from "./mergeSelectRules";
import type { FileTableRow, FileVersionTableRow } from "../StorageClient/fileTableDefinitions";
import { withExistsTableRules } from "../DboBuilder/ViewHandler/getExistsCondition";
import type { FileDerivedTable } from "./getFileDerivedTables";
import { getFileContentTableRules } from "./getFileContentTableRules";

export const getFileDerivedTableRules = async function (
  this: PublishParser,
  derivedTable: FileDerivedTable,
  explicitRules: ParsedPublishTable | undefined,
  clientReq: AuthClientRequest | undefined,
  clientInfo: AuthResultWithSID | undefined,
  scope: LocalParams["scope"] | undefined,
  resolvedPublishObject: PublishObject | undefined,
): Promise<ParsedPublishTable | undefined> {
  const { tableName, sourceTableName, isVersion } = derivedTable;
  if (
    resolvedPublishObject &&
    Object.hasOwn(resolvedPublishObject, tableName) &&
    !explicitRules?.select
  ) {
    return;
  }

  const sourceRules = await this.getTableRules({
    tableName: sourceTableName,
    clientReq,
    clientInfo,
    scope,
    resolvedPublishObject,
  });
  if (!sourceRules?.select) return;

  const tableHandler = this.dbo[tableName];
  if (!tableHandler) throw new Error(`File derived table not found: ${tableName}`);
  const sourceHandler = this.dbo[sourceTableName];
  if (!sourceHandler) throw new Error(`File source table not found: ${sourceTableName}`);
  const select = explicitRules?.select;
  if (!isVersion) {
    const contentRules = getFileContentTableRules(sourceHandler, sourceRules);
    if (!contentRules?.select) return;
    const sourceSelect = contentRules.select;
    const contentFilter = {
      $existsJoined: {
        path: derivedTable.joinPath,
        filter: withExistsTableRules(contentRules),
      },
    };
    const inheritContent = (rule: SelectRule): SelectRule => ({
      ...rule,
      ...mergeSelectRuleOptions([sourceSelect, rule]),
      forcedFilter:
        rule.forcedFilter ? { $and: [contentFilter, rule.forcedFilter] } : contentFilter,
    });
    const derivedSelect =
      hasSelectRules(select) ?
        getSelectRules(select, tableHandler).map(inheritContent)
      : inheritContent(select ?? { fields: "*" });
    return this.getParsedPublishTable({
      tableName,
      clientReq,
      clientInfo,
      resolvedPublishObject: { [tableName]: { select: derivedSelect } },
      isInferred: true,
    });
  }

  const versionSelects = select ? getSelectRules(select, tableHandler) : [undefined];
  const versionRules = getSelectRules(sourceRules.select, sourceHandler).flatMap((sourceSelect) =>
    versionSelects.map((versionSelect) =>
      getVersionSelectRule(
        derivedTable,
        tableHandler,
        sourceHandler,
        sourceSelect,
        versionSelect,
        sourceRules,
      ),
    ),
  );
  return {
    select:
      hasSelectRules(sourceRules.select) || hasSelectRules(select) ?
        mergeSelectRules(tableHandler, versionRules)
      : versionRules[0],
  };
};

const getVersionSelectRule = (
  { joinPath }: FileDerivedTable,
  tableHandler: ViewHandler,
  sourceHandler: ViewHandler,
  sourceSelect: SelectRule,
  select: SelectRule | undefined,
  sourceRules: ParsedTableRule,
): SelectRule => {
  const requestedFields = tableHandler.parseFieldFilter(select?.fields ?? "*");
  const sourceSelectFields = sourceHandler.parseFieldFilter(sourceSelect.fields);
  const fields = (tableHandler.column_names as (keyof FileVersionTableRow)[]).filter(
    (field) =>
      requestedFields.includes(field) &&
      sourceSelectFields.includes(getFileVersionSourceField(field)),
  );
  const requestedFilterFields = tableHandler.parseFieldFilter(select?.filterFields ?? fields);
  const requestedOrderByFields = tableHandler.parseFieldFilter(select?.orderByFields ?? fields);
  const inheritedFilter = {
    $existsJoined: {
      path: joinPath,
      filter: sourceSelect.forcedFilter ?? {},
    },
  };
  const filters = [inheritedFilter, ...(select?.forcedFilter ? [select.forcedFilter] : [])];
  if (hasSelectRules(sourceRules.select) && sourceRules.select.forcedFilter) {
    filters.push({
      $existsJoined: {
        path: joinPath,
        filter: withExistsTableRules(sourceRules),
      },
    });
  }

  return {
    ...sourceSelect,
    ...select,
    ...mergeSelectRuleOptions(select ? [sourceSelect, select] : [sourceSelect]),
    fields: toFieldFilter(fields),
    filterFields: toFieldFilter(fields.filter((field) => requestedFilterFields.includes(field))),
    orderByFields: toFieldFilter(fields.filter((field) => requestedOrderByFields.includes(field))),
    forcedFilter: { $and: filters },
  };
};

const getFileVersionSourceField = (field: keyof FileVersionTableRow): keyof FileTableRow => {
  if (field === "file_id") return "id";
  if (field === "created") return "updated";
  return field;
};

const toFieldFilter = (fields: string[]) => fromEntries(fields.map((field) => [field, 1 as const]));

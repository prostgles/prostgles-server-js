import { fromEntries } from "prostgles-types";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { LocalParams } from "../DboBuilder/DboBuilder";
import type { FileTableConfig } from "../ProstglesTypes";
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
import { getFileVersionTableName } from "../StorageClient/fileVersionUtils";
import type { FileTableRow, FileVersionTableRow } from "../StorageClient/fileTableDefinitions";
import { withExistsTableRules } from "../DboBuilder/ViewHandler/getExistsCondition";

export const getFileVersionTableRules = async function (
  this: PublishParser,
  config: FileTableConfig,
  explicitRules: ParsedPublishTable | undefined,
  clientReq: AuthClientRequest | undefined,
  clientInfo: AuthResultWithSID | undefined,
  scope: LocalParams["scope"] | undefined,
  resolvedPublishObject: PublishObject | undefined,
): Promise<ParsedPublishTable | undefined> {
  const versionTableName = getFileVersionTableName(config);
  if (
    resolvedPublishObject &&
    Object.hasOwn(resolvedPublishObject, versionTableName) &&
    !explicitRules?.select
  ) {
    return;
  }

  const fileRules = await this.getTableRules({
    tableName: config.tableName,
    clientReq,
    clientInfo,
    scope,
    resolvedPublishObject,
  });
  if (!fileRules?.select) return;

  const versionHandler = this.dbo[versionTableName];
  if (!versionHandler) throw new Error(`File version table not found: ${versionTableName}`);
  const fileHandler = this.dbo[config.tableName];
  if (!fileHandler) throw new Error(`File table not found: ${config.tableName}`);
  const select = explicitRules?.select;
  const versionRules = getSelectRules(fileRules.select, fileHandler).flatMap((fileSelect) =>
    (select ? getSelectRules(select, versionHandler) : [undefined]).map((versionSelect) =>
      getVersionSelectRule(versionHandler, fileHandler, fileSelect, versionSelect, fileRules),
    ),
  );
  return {
    select:
      hasSelectRules(fileRules.select) || hasSelectRules(select) ?
        mergeSelectRules(versionHandler, versionRules)
      : versionRules[0],
  };
};

const getVersionSelectRule = (
  versionHandler: ViewHandler,
  fileHandler: ViewHandler,
  fileSelect: SelectRule,
  select: SelectRule | undefined,
  fileRules: ParsedTableRule,
): SelectRule => {
  const requestedFields = versionHandler.parseFieldFilter(select?.fields ?? "*");
  const fileSelectFields = fileHandler.parseFieldFilter(fileSelect.fields);
  const fields = (versionHandler.column_names as (keyof FileVersionTableRow)[]).filter(
    (field) =>
      requestedFields.includes(field) &&
      fileSelectFields.includes(getFileVersionSourceField(field)) &&
      (fileHandler.column_names as (keyof FileTableRow)[]).includes(
        getFileVersionSourceField(field),
      ),
  );
  const requestedFilterFields = versionHandler.parseFieldFilter(select?.filterFields ?? fields);
  const requestedOrderByFields = versionHandler.parseFieldFilter(select?.orderByFields ?? fields);
  const path = [{ table: fileHandler.name, on: [{ file_id: "id" }] }];
  const inheritedFilter = {
    $existsJoined: {
      path,
      filter: fileSelect.forcedFilter ?? {},
    },
  };
  const filters = [inheritedFilter, ...(select?.forcedFilter ? [select.forcedFilter] : [])];
  if (hasSelectRules(fileRules.select) && fileRules.select.forcedFilter) {
    filters.push({ $existsJoined: { path, filter: withExistsTableRules(fileRules) } });
  }

  return {
    ...fileSelect,
    ...select,
    ...mergeSelectRuleOptions(select ? [fileSelect, select] : [fileSelect]),
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

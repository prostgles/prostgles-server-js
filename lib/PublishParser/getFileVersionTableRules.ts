import { fromEntries } from "prostgles-types";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { LocalParams } from "../DboBuilder/DboBuilder";
import type { FileTableConfig } from "../ProstglesTypes";
import type { PublishParser } from "./PublishParser";
import type { ParsedPublishTable, PublishObject } from "./publishTypesAndUtils";
import { getFileVersionTableName } from "../StorageClient/fileVersionUtils";
import type { FileTableRow, FileVersionTableRow } from "../StorageClient/fileTableDefinitions";

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
  const requestedFields = versionHandler.parseFieldFilter(select?.fields ?? "*");
  const fileSelectFields = fileHandler.parseFieldFilter(fileRules.select.fields);
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
  const inheritedFilter = {
    $existsJoined: {
      path: [{ table: config.tableName, on: [{ file_id: "id" }] }],
      filter: fileRules.select.forcedFilter ?? {},
    },
  };

  return {
    select: {
      ...fileRules.select,
      ...select,
      fields: fromEntries(fields.map((field) => [field, 1 as const] as const)),
      filterFields: fromEntries(
        fields
          .filter((field) => requestedFilterFields.includes(field))
          .map((field) => [field, 1 as const] as const),
      ),
      orderByFields: fromEntries(
        fields
          .filter((field) => requestedOrderByFields.includes(field))
          .map((field) => [field, 1 as const] as const),
      ),
      forcedFilter:
        select?.forcedFilter ? { $and: [inheritedFilter, select.forcedFilter] } : inheritedFilter,
      maxLimit: getMostRestrictiveLimit(fileRules.select.maxLimit, select?.maxLimit),
      subscribeThrottle: Math.max(
        fileRules.select.subscribeThrottle ?? 0,
        select?.subscribeThrottle ?? 0,
      ),
      disableMethods: {
        ...fileRules.select.disableMethods,
        ...select?.disableMethods,
      },
    },
  };
};

const getFileVersionSourceField = (field: keyof FileVersionTableRow): keyof FileTableRow => {
  if (field === "file_id") return "id";
  if (field === "created") return "updated";
  return field;
};

const getMostRestrictiveLimit = (
  inheritedLimit: number | null | undefined,
  explicitLimit: number | null | undefined,
) => {
  const limits = [inheritedLimit, explicitLimit].filter(
    (limit): limit is number => typeof limit === "number",
  );
  if (limits.length) return Math.min(...limits);
  return inheritedLimit === null || explicitLimit === null ? null : undefined;
};

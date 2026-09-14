import { isObject } from "prostgles-types";
import type { PublishParser } from "./PublishParser";
import { type PublishObject } from "./PublishParser";
import { getFileVersionTableName, isFileVersionTable } from "../StorageClient/fileVersionUtils";

export const getPublishedTableNames = (
  publishParserInstance: PublishParser,
  publishObject: PublishObject,
) => {
  const txKey = !publishParserInstance.prostgles.opts.transactions ? "" : "tx";
  if (txKey && txKey in publishObject) {
    throw new Error(
      `Transactions key ${JSON.stringify(txKey)} collides with a published table name`,
    );
  }
  const tableNames = Object.keys(publishObject);

  /**
   * Add file table to the list of published tables if it's referenced by other published tables.
   * Access to the file table is controlled through the publish rules of the tables referencing it.
   */
  const fileTableName = publishParserInstance.prostgles.opts.fileTable?.tableName;
  if (
    fileTableName &&
    publishParserInstance.dbo[fileTableName]?.is_media &&
    !tableNames.includes(fileTableName)
  ) {
    const isReferenced = publishParserInstance.prostgles.dboBuilder.tablesOrViews?.some(
      (t) =>
        !isFileVersionTable(publishParserInstance.prostgles.opts.fileTable, t.name) &&
        t.columns.some((c) => c.references?.some((r) => r.ftable === fileTableName)),
    );
    if (isReferenced) {
      tableNames.unshift(fileTableName);
    }
  }

  const fileConfig = publishParserInstance.prostgles.opts.fileTable;
  if (fileConfig?.versioning && tableNames.includes(fileConfig.tableName)) {
    const versionTableName = getFileVersionTableName(fileConfig);
    if (!tableNames.includes(versionTableName)) {
      tableNames.unshift(versionTableName);
    }
  }

  const audit = publishParserInstance.prostgles.resolvedAuditConfig;
  const publishedFileTableName =
    fileTableName && tableNames.includes(fileTableName) ? fileTableName : undefined;
  if (
    audit &&
    !tableNames.includes(audit.tableName) &&
    Object.keys(audit.tables).some((tableName) => {
      const rule = publishObject[tableName];
      return (
        tableName === publishedFileTableName ||
        rule === "*" ||
        rule === true ||
        (isObject(rule) && Boolean(rule.select))
      );
    })
  ) {
    tableNames.unshift(audit.tableName);
  }
  return tableNames;
};

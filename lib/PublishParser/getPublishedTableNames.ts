import type { PublishParser } from "./PublishParser";
import { type PublishObject } from "./PublishParser";

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
    const isReferenced = publishParserInstance.prostgles.dboBuilder.tablesOrViews?.some((t) =>
      t.columns.some((c) => c.references?.some((r) => r.ftable === fileTableName)),
    );
    if (isReferenced) {
      tableNames.unshift(fileTableName);
    }
  }
  return tableNames;
};

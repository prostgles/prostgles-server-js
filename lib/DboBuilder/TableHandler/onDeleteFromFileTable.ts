import type pgPromise from "pg-promise";
import type { AnyObject } from "prostgles-types";
import { asName, pickKeys } from "prostgles-types";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { TableHandlers } from "../DboBuilder";
import type { FileTableRow } from "../../StorageClient/getFileTableConfig";

type OnDeleteFromFileTableArgs = {
  returningQuery: undefined | string;
  filterOpts: {
    where: string;
    filter: AnyObject;
  };
  t: pgPromise.ITask<{}>;
  dbTX: TableHandlers;
  isOneOrNone: boolean;
};
export const onDeleteFromFileTable = async (
  config: FileTableConfig,
  { dbTX, t, returningQuery, filterOpts, isOneOrNone }: OnDeleteFromFileTableArgs,
) => {
  const { storageClient, tableName } = config;
  const tableHandler = dbTX[tableName];
  if (!tableHandler) {
    throw new Error(`TableHandler for ${tableName} not found in dbTX`);
  }
  if (config.delayedDelete) {
    const result = await t.any(
      `UPDATE ${asName(tableName)} SET deleted = now() ${filterOpts.where} ${returningQuery ?? ""};`,
    );
    return (isOneOrNone ? result[0] : result) as undefined | AnyObject[];
  }

  let files: { id: string }[] = [];
  const totalFiles = await tableHandler.count(filterOpts.filter);
  do {
    const batch = (await tableHandler.find(filterOpts.filter, {
      limit: 100,
      offset: files.length,
    })) as FileTableRow[];
    files = [...files, ...batch];
  } while (files.length < totalFiles);

  for (const file of files) {
    await t.any(`DELETE FROM ${asName(tableName)} WHERE id = \${id}`, file);
  }
  /** If any table delete fails then do not delete files */
  for (const file of files) {
    await storageClient.delete(file.id);
  }

  if (returningQuery) {
    return files.map((f) => pickKeys(f, ["id"]));
  }

  return undefined;
};

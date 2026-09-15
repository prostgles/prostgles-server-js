import type pgPromise from "pg-promise";
import type { AnyObject } from "prostgles-types";
import { asName } from "prostgles-types";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { OnCommit } from "../../PublishParser/publishTypesAndUtils";
import { deleteUnreferencedFile } from "../../StorageClient/deleteUnreferencedFile";
import {
  getFileRevisionsTableHandler,
  getFileTableHandler,
} from "../../StorageClient/fileVersionUtils";
import type { TableHandlers } from "../DboBuilder";

type OnDeleteFromFileTableArgs = {
  returningQuery: undefined | string;
  filterOpts: {
    where: string;
    filter: AnyObject;
  };
  t: pgPromise.ITask<{}>;
  dbx: TableHandlers;
  onCommit: OnCommit;
  isOneOrNone: boolean;
};

export const onDeleteFromFileTable = async (
  config: FileTableConfig,
  { onCommit, t, dbx, returningQuery, filterOpts, isOneOrNone }: OnDeleteFromFileTableArgs,
) => {
  const { tableName } = config;
  if (config.delayedDelete) {
    const result = await t.any(
      `UPDATE ${asName(tableName)} SET deleted = now() ${filterOpts.where} ${returningQuery ?? ""};`,
    );
    return (isOneOrNone ? result[0] : result) as undefined | AnyObject[];
  }

  const fileIds =
    config.versioning ?
      await getFileTableHandler(dbx, config).find(filterOpts.filter, {
        select: { id: 1 },
        limit: null,
      })
    : [];
  const versionFiles =
    fileIds.length ?
      await getFileRevisionsTableHandler(dbx, config).find(
        { file_id: { $in: fileIds.map(({ id }) => id) } },
        { select: { storage_key: 1 }, limit: null },
      )
    : [];

  const KEY = "_prostgles_storage_key" as const;
  const files = await t.any<Record<string, unknown> & { [KEY]: string }>(
    `DELETE FROM ${asName(tableName)} ${filterOpts.where}
     ${returningQuery ? `${returningQuery},` : "RETURNING"}
     COALESCE(storage_key, id) AS ${KEY}`,
  );
  const storageKeys = new Set([
    ...versionFiles.map(({ storage_key }) => storage_key),
    ...files.map((row) => row[KEY]),
  ]);
  for (const storageKey of storageKeys) {
    onCommit(({ db }) => deleteUnreferencedFile(db, config, storageKey));
  }
  const result = files.map(({ [KEY]: _, ...row }) => row);
  if (!returningQuery) return undefined;
  return (isOneOrNone ? result[0] : result) as AnyObject[] | undefined;
};

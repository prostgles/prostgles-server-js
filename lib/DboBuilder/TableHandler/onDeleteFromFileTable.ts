import type pgPromise from "pg-promise";
import type { AnyObject } from "prostgles-types";
import { asName } from "prostgles-types";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { OnCommit } from "../../PublishParser/publishTypesAndUtils";
import { deleteUnreferencedFile } from "../../StorageClient/deleteUnreferencedFile";

type OnDeleteFromFileTableArgs = {
  returningQuery: undefined | string;
  filterOpts: {
    where: string;
    filter: AnyObject;
  };
  t: pgPromise.ITask<{}>;
  onCommit: OnCommit;
  isOneOrNone: boolean;
};
export const onDeleteFromFileTable = async (
  config: FileTableConfig,
  { onCommit, t, returningQuery, filterOpts, isOneOrNone }: OnDeleteFromFileTableArgs,
) => {
  const { tableName } = config;
  if (config.delayedDelete) {
    const result = await t.any(
      `UPDATE ${asName(tableName)} SET deleted = now() ${filterOpts.where} ${returningQuery ?? ""};`,
    );
    return (isOneOrNone ? result[0] : result) as undefined | AnyObject[];
  }

  const files = await t.any<Record<string, unknown> & { _prostgles_storage_key: string }>(
    `DELETE FROM ${asName(tableName)} ${filterOpts.where}
     ${returningQuery ? `${returningQuery},` : "RETURNING"}
     COALESCE(storage_key, id) AS _prostgles_storage_key`,
  );
  const result = files.map(({ _prostgles_storage_key, ...row }) => {
    onCommit(({ db }) => deleteUnreferencedFile(db, config, _prostgles_storage_key));
    return row;
  });
  if (!returningQuery) return undefined;
  return (isOneOrNone ? result[0] : result) as AnyObject[] | undefined;
};

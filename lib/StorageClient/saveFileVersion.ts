import { pickKeys } from "prostgles-types";
import type { TableHandlers } from "../DboBuilder/DboBuilder";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import type { FileTableConfig } from "../ProstglesTypes";
import type { OnCommit } from "../PublishParser/publishTypesAndUtils";
import { deleteUnreferencedFile } from "./deleteUnreferencedFile";
import {
  FILE_VERSION_TABLE_COLUMN_DEFINITIONS,
  type FileTableRow,
  type FileVersionTableInsertRow,
} from "./fileTableDefinitions";
import { getFileRevisionsTableHandler, getFileTableHandler } from "./fileVersionUtils";
import { getFileStorageKey } from "./getFileStorageKey";

export const saveFileVersion = async (
  config: FileTableConfig,
  row: FileTableRow,
  dbx: TableHandlers,
  onCommit: OnCommit,
) => {
  if (!config.versioning) return;
  const version = Number(row.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid file version: ${row.version}`);
  }

  const versions = getFileRevisionsTableHandler(dbx, config);
  const versionColumns = (versions as TableHandler).column_names;
  await versions.insert(getFileVersionRow(row, versionColumns), {
    onConflict: {
      action: "DoNothing",
      conflictColumns: ["file_id", "version"],
    },
  });
  const customColumns = versionColumns.filter(
    (column) => !Object.hasOwn(FILE_VERSION_TABLE_COLUMN_DEFINITIONS, column),
  );
  if (customColumns.length) {
    await (versions as TableHandler).update(
      { file_id: row.id, version },
      pickKeys(row, customColumns as (keyof FileTableRow)[]),
    );
  }

  const { maxVersions } = config.versioning;
  if (maxVersions === undefined) return;
  const removed = (await versions.find(
    { file_id: row.id },
    {
      select: { id: 1, storage_key: 1 },
      orderBy: { version: -1 },
      offset: maxVersions,
      limit: null,
    },
  )) as { id: string; storage_key: string }[];
  if (!removed.length) return;

  await versions.delete({ id: { $in: removed.map(({ id }) => id) } });
  for (const storageKey of new Set(removed.map(({ storage_key }) => storage_key))) {
    onCommit(({ db }) => deleteUnreferencedFile(db, config, storageKey));
  }
};

export const backfillFileVersions = async (dbo: TableHandlers, config: FileTableConfig) => {
  if (!config.versioning) return;
  const files = getFileTableHandler(dbo, config);
  const fileRows = await files.find({}, { limit: null });
  if (!fileRows.length) return;
  console.log(`Backfilling file versions for ${fileRows.length} files`);
  const fileRevisionsTableHandler = getFileRevisionsTableHandler(dbo, config);
  const fileRevisionColumns = (fileRevisionsTableHandler as TableHandler).column_names;
  await fileRevisionsTableHandler.insertMany(
    fileRows.map((fileRow) => getFileVersionRow(fileRow, fileRevisionColumns)),
    {
      onConflict: {
        action: "DoNothing",
        conflictColumns: ["file_id", "version"],
      },
    },
  );
};

/** Must ensure we copy over any columns that might have been created by the user */
const getFileVersionRow = (row: FileTableRow, cols: string[]): FileVersionTableInsertRow => {
  const { id, ...insertRow } = pickKeys(row, cols as (keyof FileTableRow)[]);
  const version = Number(row.version ?? 1);
  return {
    ...insertRow,
    file_id: id,
    version,
    storage_key: getFileStorageKey(row),
    url: `${row.url}?version=${version}`,
    created: row.updated,
  };
};

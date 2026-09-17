import { asName, getKeys, isEmpty, omitKeys, pickKeys } from "prostgles-types";
import { md5 } from "prostgles-types/dist/md5";
import { onDeleteFromFileTable } from "../DboBuilder/TableHandler/onDeleteFromFileTable";
import { updateFile } from "../DboBuilder/TableHandler/updateFile";
import { assertFileObjectValid, uploadFile } from "../DboBuilder/TableHandler/uploadFile";
import type { Prostgles } from "../Prostgles";
import type {
  AfterEachTsTrigger,
  BeforeEachTsTrigger,
} from "../PublishParser/publishTypesAndUtils";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import type { TableHooks } from "../TableHooks/TableHooks";
import { setupFileServeHandler } from "./setupFileServeHandler";
import type { TableHandlers } from "../DboBuilder/DboBuilder";
import { getFileTableHandler, getFileVersionTableName } from "./fileVersionUtils";
import { backfillFileVersions, saveFileVersion } from "./saveFileVersion";
import {
  FILE_TABLE_COLUMN_DEFINITIONS,
  FILE_TABLE_VERSION_COLUMN_DEFINITIONS,
  FILE_VERSION_TABLE_COLUMN_DEFINITIONS,
  type FileTableRow,
} from "./fileTableDefinitions";

export type { FileTableInsertRow, FileTableRow } from "./fileTableDefinitions";

export const getFileTableConfig = (
  prg: Prostgles,
): { tableConfig: TableConfig | undefined; tableHooks: TableHooks<void, any> | undefined } => {
  const { fileTable, tableConfig, tableHooks } = prg.opts;
  if (!fileTable) {
    return { tableConfig, tableHooks };
  }

  const { expressApp } = fileTable;

  const { tableName: fileTableName, storageClient } = fileTable;
  const versionTableName = getFileVersionTableName(fileTable);
  const versionConstraintName = `prostgles_file_version_${md5(JSON.stringify([versionTableName, fileTableName]))}`;
  const versionIndexName = `prostgles_file_version_${md5(versionTableName)}_key`;
  if (fileTable.versioning) {
    if (versionTableName === fileTableName) {
      throw new Error("File version table name must differ from the file table name");
    }
    if (
      fileTable.versioning.maxVersions !== undefined &&
      (!Number.isInteger(fileTable.versioning.maxVersions) || fileTable.versioning.maxVersions < 1)
    ) {
      throw new Error("fileTable.versioning.maxVersions must be a positive integer");
    }
    if (tableConfig?.[versionTableName]) {
      throw new Error(
        `File version table name (${versionTableName}) is managed and cannot be configured in tableConfig`,
      );
    }
  }

  const fileColumnDefinitions = {
    ...FILE_TABLE_COLUMN_DEFINITIONS,
    ...(fileTable.versioning && FILE_TABLE_VERSION_COLUMN_DEFINITIONS),
  };
  const fileColumnDefinitionsColumnNames = getKeys(fileColumnDefinitions);
  const userFileTableConfig = tableConfig?.[fileTableName];
  if (userFileTableConfig) {
    if ("isLookupTable" in userFileTableConfig) {
      throw new Error(
        `FileManager table name (${fileTableName}) cannot have isLookupTable set in tableConfig`,
      );
    }
    if (userFileTableConfig.dropIfExists || userFileTableConfig.dropIfExistsCascade) {
      throw new Error(
        `FileManager table name (${fileTableName}) cannot have dropIfExists or dropIfExistsCascade set in tableConfig`,
      );
    }
    if ("columns" in userFileTableConfig && userFileTableConfig.columns) {
      const userCols = new Set(Object.keys(userFileTableConfig.columns));
      const clashingFileColumns = Object.keys(fileColumnDefinitions).filter((col) =>
        userCols.has(col),
      );
      if (clashingFileColumns.length) {
        throw new Error(
          `FileManager table name (${fileTableName}) has clashing column names in tableConfig: ${clashingFileColumns}`,
        );
      }

      const clashingFileRevisionColumns = Object.keys(FILE_VERSION_TABLE_COLUMN_DEFINITIONS).filter(
        (col) => userCols.has(col),
      );
      if (clashingFileRevisionColumns.length) {
        throw new Error(
          `FileManager table name (${fileTableName}) has clashing column names with file revision table in tableConfig: ${clashingFileRevisionColumns}`,
        );
      }
    }
  }

  const mergedTableConfig: TableConfig = {
    [fileTableName]: {
      ...userFileTableConfig,
      columns: {
        ...fileColumnDefinitions,
        ...userFileTableConfig?.columns,
      },
      onMount: ({ _db }) => {
        const { destroy } = setupFileServeHandler(_db, fileTable, storageClient, expressApp, prg);

        const maxBfSizeMB = (prg.opts.io?.engine.opts.maxHttpBufferSize || 1e6) / 1e6;
        console.log(
          `Prostgles: Initiated file manager. Max allowed file size: ${maxBfSizeMB}MB (maxHttpBufferSize = 1e6). To increase this set maxHttpBufferSize in socket.io server init options`,
        );
        return {
          onUnmount: destroy,
        };
      },
    },
    ...(fileTable.versioning && {
      [versionTableName]: {
        /** Mirror user columns in the file revision table */
        columns: { ...FILE_VERSION_TABLE_COLUMN_DEFINITIONS, ...userFileTableConfig?.columns },
        constraints: {
          [versionConstraintName]: `FOREIGN KEY (file_id) REFERENCES ${asName(fileTableName)}(id) ON DELETE CASCADE`,
        },
        indexes: {
          [versionIndexName]: {
            unique: true,
            columns: "file_id, version",
          },
        },
        onMount: async ({ dbo }) => {
          await backfillFileVersions(dbo, fileTable);
        },
      },
    }),
    ...omitKeys(tableConfig ?? {}, [fileTableName]),
  };

  const userFileTableHooks = tableHooks?.[fileTableName];
  const mergedTableHooks: TableHooks<void, any> = {
    ...tableHooks,
    [fileTableName]: {
      ...userFileTableHooks,
      beforeEach: [
        {
          commands: {
            insert: 1,
            update: 1,
          },
          validate: async ({
            data: insertOrUpdateData,
            localParams,
            command,
            filter,
            dbx,
            onCommit,
            onRollback,
          }) => {
            const tableHandler = dbx[fileTableName];
            if (!tableHandler) throw "Storage tableHandler not found";
            const fileData = pickKeys(insertOrUpdateData, fileColumnDefinitionsColumnNames);

            /**
             * File table config can be extended with extra columns.
             * Allow updates that only target those columns without affecting the core file data
             */
            const extraData = omitKeys(insertOrUpdateData, fileColumnDefinitionsColumnNames);

            if (command === "update" && isEmpty(fileData)) {
              return;
            }
            assertFileObjectValid(fileData);

            const { data: dataBlob, original_name, id, original_last_modified = null } = fileData;
            const data = dataBlob as unknown as Buffer;
            if (command === "update") {
              const { newData } = await updateFile(tableHandler, fileTable, {
                onCommit,
                onRollback,
                filter: filter ?? {},
                localParams,
                data,
                original_name,
                original_last_modified,
              });
              return {
                row: { ...newData, ...extraData },
                hookContext: {
                  data,
                },
              };
            }

            const media = await uploadFile(fileTable, {
              onCommit,
              onRollback,
              data,
              original_name,
              localParams,
              mediaId: id,
              original_last_modified,
            });

            return {
              row: { ...media, ...extraData },
              hookContext: {
                data,
              },
            };
          },
        } satisfies BeforeEachTsTrigger<FileTableRow, TableHandlers>,
        ...(userFileTableHooks?.beforeEach || []),
      ],
      afterEach: [
        ...(userFileTableHooks?.afterEach || []),
        {
          commands: { insert: 1, update: 1 },
          validate: async ({ row, dbx, onCommit }) => {
            const fileRow = await getFileTableHandler(dbx, fileTable).findOne({ id: row.id });
            if (!fileRow) throw new Error(`File not found after write: ${row.id}`);
            await saveFileVersion(fileTable, fileRow, dbx, onCommit);
          },
        } satisfies AfterEachTsTrigger<FileTableRow, TableHandlers> as AfterEachTsTrigger<
          any,
          TableHandlers
        >,
      ],
      onInsteadOfDelete: async ({ onCommit, dbx, tx, returningQuery, isOneOrNone, filterOpts }) => {
        return onDeleteFromFileTable(fileTable, {
          onCommit,
          dbx,
          t: tx,
          returningQuery,
          isOneOrNone,
          filterOpts,
        });
      },
    },
  };

  return {
    tableConfig: mergedTableConfig,
    tableHooks: mergedTableHooks,
  };
};

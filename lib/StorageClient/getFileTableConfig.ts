import { omitKeys } from "prostgles-types";
import { onDeleteFromFileTable } from "../DboBuilder/TableHandler/onDeleteFromFileTable";
import { updateFile } from "../DboBuilder/TableHandler/updateFile";
import { assertFileObjectValid, uploadFile } from "../DboBuilder/TableHandler/uploadFile";
import type { Prostgles } from "../Prostgles";
import type { BeforeEachTsTrigger } from "../PublishParser/publishTypesAndUtils";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import type { TableRowFromColumnDefinitions } from "../TableConfig/TableRowFromColumnDefinitions";
import type { TableHooks } from "../TableHooks/TableHooks";
import { setupFileServeHandler } from "./setupFileServeHandler";
import type { TableHandlers } from "../DboBuilder/DboBuilder";

const FILE_TABLE_COLUMN_DEFINITIONS = {
  id: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
  storage_key: `UUID UNIQUE`, // NULL for legacy objects stored under their file ID.
  extension: `TEXT NOT NULL DEFAULT ''`,
  content_type: `TEXT NOT NULL DEFAULT ''`,
  content_length: `BIGINT NOT NULL DEFAULT 0`,
  etag: `TEXT NOT NULL DEFAULT ''`,
  original_name: `TEXT NOT NULL`,
  original_last_modified: `TIMESTAMPTZ`,
  description: `TEXT`,
  url: `TEXT NOT NULL DEFAULT ''`,
  cloud_url: `TEXT`,
  signed_url: `TEXT`,
  signed_url_expires: `BIGINT`,
  added: `TIMESTAMP NOT NULL DEFAULT NOW()`,
  updated: `TIMESTAMP NOT NULL DEFAULT NOW()`,
  deleted: `TIMESTAMPTZ`,
  deleted_from_storage: `TIMESTAMPTZ`,
  data: `BYTEA NOT NULL CHECK (data = decode('01', 'hex'))`, // Used as a placeholder to ensure insert types are correct. Actual data is uploaded to storageClient and not stored in the DB
} as const;

export type FileTableRow = TableRowFromColumnDefinitions<typeof FILE_TABLE_COLUMN_DEFINITIONS>;

export const getFileTableConfig = (
  prg: Prostgles,
): { tableConfig: TableConfig | undefined; tableHooks: TableHooks<void, any> | undefined } => {
  const { fileTable, tableConfig, tableHooks } = prg.opts;
  if (!fileTable) {
    return { tableConfig, tableHooks };
  }

  const { expressApp } = fileTable;

  const { tableName: fileTableName, storageClient } = fileTable;

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
      const clashingColumns = Object.keys(FILE_TABLE_COLUMN_DEFINITIONS).filter((col) =>
        userCols.has(col),
      );
      if (clashingColumns.length) {
        throw new Error(
          `FileManager table name (${fileTableName}) has clashing column names in tableConfig: ${clashingColumns}`,
        );
      }
    }
  }

  const mergedTableConfig: TableConfig = {
    [fileTableName]: {
      ...userFileTableConfig,
      columns: {
        ...FILE_TABLE_COLUMN_DEFINITIONS,
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
            data: insertData,
            localParams,
            command,
            filter,
            dbx,
            onCommit,
            onRollback,
          }) => {
            const tableHandler = dbx[fileTableName];
            if (!tableHandler) throw "Storage tableHandler not found";
            assertFileObjectValid(insertData);

            const { data: dataBlob, original_name, id, original_last_modified = null } = insertData;
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
                row: newData,
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
              row: media,
              hookContext: {
                data,
              },
            };
          },
        } satisfies BeforeEachTsTrigger<FileTableRow, TableHandlers>,
        ...(userFileTableHooks?.beforeEach || []),
      ],
      onInsteadOfDelete: async ({ onCommit, tx, returningQuery, isOneOrNone, filterOpts }) => {
        return onDeleteFromFileTable(fileTable, {
          onCommit,
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

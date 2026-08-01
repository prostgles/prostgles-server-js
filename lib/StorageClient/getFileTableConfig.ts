import { omitKeys } from "prostgles-types";
import { updateFile } from "../DboBuilder/TableHandler/updateFile";
import { assertFileObjectValid, uploadFile } from "../DboBuilder/uploadFile";
import type { Prostgles } from "../Prostgles";
import type { TableConfig } from "../TableConfig/TableConfigTypes";
import { setupFileServeHandler } from "./setupFileServeHandler";
import { onDeleteFromFileTable } from "../DboBuilder/TableHandler/onDeleteFromFileTable";
import type { BeforeEachTsTrigger } from "../PublishParser/publishTypesAndUtils";

const FILE_TABLE_COLUMN_DEFINITIONS = {
  name: `TEXT NOT NULL UNIQUE`,
  extension: `TEXT NOT NULL`,
  content_type: `TEXT NOT NULL`,
  content_length: `BIGINT NOT NULL DEFAULT 0`,
  added: `TIMESTAMP NOT NULL DEFAULT NOW()`,
  url: `TEXT NOT NULL`,
  id: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
  original_name: `TEXT NOT NULL`,
  description: `TEXT`,
  cloud_url: `TEXT`,
  signed_url: `TEXT`,
  signed_url_expires: `BIGINT`,
  etag: `TEXT NOT NULL`,
  deleted: `BIGINT`,
  deleted_from_storage: `BIGINT`,
} as const;

type FileTableColumnDefinitions = typeof FILE_TABLE_COLUMN_DEFINITIONS;

export type FileTableRow = {
  [K in keyof FileTableColumnDefinitions as K]: FileTableColumnDefinitions[K] extends (
    `${string} NOT NULL${string}` | `${string}PRIMARY KEY${string}`
  ) ?
    string
  : string | null;
};

export const getFileTableConfig = (prg: Prostgles): TableConfig | undefined => {
  const { fileTable, tableConfig } = prg.opts;
  if (!fileTable) {
    return tableConfig;
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

  return {
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
      hooks: {
        ...userFileTableConfig?.hooks,
        beforeEach: [
          {
            commands: {
              insert: 1,
              update: 1,
            },
            validate: async ({ data: insertData, localParams, command, filter }) => {
              const tableHandler = prg.dboBuilder.dboMap.get(fileTableName);
              if (!tableHandler) throw "Storage tableHandler not found";
              assertFileObjectValid(insertData);

              const { data: dataBlob, name, id } = insertData;
              const data = dataBlob as unknown as Buffer;
              if (command === "update") {
                const { newData } = await updateFile(tableHandler, fileTable, {
                  filter: filter ?? {},
                  localParams,
                  data,
                  name,
                });
                return {
                  row: newData,
                  hookContext: {
                    data,
                  },
                };
              }

              const media = await uploadFile(fileTable, {
                data,
                name,
                localParams,
                mediaId: id,
              });

              return {
                row: media,
                hookContext: {
                  data,
                },
              };
            },
          } satisfies BeforeEachTsTrigger<FileTableRow, {}>,
          ...(userFileTableConfig?.hooks?.beforeEach || []),
        ],
        onInsteadOfDelete: async ({ dbx, tx, returningQuery, isOneOrNone, filterOpts }) => {
          return onDeleteFromFileTable(fileTable, {
            dbTX: dbx,
            t: tx,
            returningQuery,
            isOneOrNone,
            filterOpts,
          });
        },
      },
    },
    ...omitKeys(tableConfig ?? {}, [fileTableName]),
  };
};

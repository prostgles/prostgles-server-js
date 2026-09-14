import { omitKeys } from "prostgles-types";
import type { TableRowFromColumnDefinitions } from "../TableConfig/TableRowFromColumnDefinitions";

export const FILE_TABLE_COLUMN_DEFINITIONS = {
  id: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`,
  /**
   * NULL for legacy objects stored under their file ID.
   * */
  storage_key: `UUID UNIQUE`,
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

export const FILE_TABLE_VERSION_COLUMN_DEFINITIONS = {
  version: `INTEGER NOT NULL DEFAULT 1`,
} as const;

export const FILE_VERSION_TABLE_COLUMN_DEFINITIONS = {
  ...omitKeys(FILE_TABLE_COLUMN_DEFINITIONS, ["data"]),
  storage_key: `UUID NOT NULL`,
  file_id: `UUID NOT NULL`, // FK constraint is added later on
  version: `INTEGER NOT NULL`,
  created: `TIMESTAMP NOT NULL DEFAULT NOW()`,
} as const;

export type FileTableInsertRow = TableRowFromColumnDefinitions<
  typeof FILE_TABLE_COLUMN_DEFINITIONS
> &
  Partial<TableRowFromColumnDefinitions<typeof FILE_TABLE_VERSION_COLUMN_DEFINITIONS>>;
export type FileTableRow = Required<
  TableRowFromColumnDefinitions<typeof FILE_TABLE_COLUMN_DEFINITIONS>
> &
  Partial<Required<TableRowFromColumnDefinitions<typeof FILE_TABLE_VERSION_COLUMN_DEFINITIONS>>>;

export type FileVersionTableInsertRow = TableRowFromColumnDefinitions<
  typeof FILE_VERSION_TABLE_COLUMN_DEFINITIONS
>;
export type FileVersionTableRow = Required<FileVersionTableInsertRow>;

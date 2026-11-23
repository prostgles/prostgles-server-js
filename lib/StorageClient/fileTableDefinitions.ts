import type {
  FileTableInsertRow as SharedFileTableInsertRow,
  FileTableRow as SharedFileTableRow,
  FileVersionTableRow,
} from "prostgles-types";

export {
  FILE_TABLE_COLUMN_DEFINITIONS,
  FILE_TABLE_VERSION_COLUMN_DEFINITIONS,
  FILE_VERSION_TABLE_COLUMN_DEFINITIONS,
  type FileVersionTableInsertRow,
  type FileVersionTableRow,
} from "prostgles-types";

export type FileTableInsertRow = SharedFileTableInsertRow<Buffer>;
export type FileTableRow = SharedFileTableRow<Buffer>;

export const FILE_LOOKUP_FIELDS = {
  file: ["id"],
  revision: ["file_id", "version"],
} as const satisfies { file: (keyof FileTableRow)[]; revision: (keyof FileVersionTableRow)[] };

export const FILE_CONTENT_SELECT = {
  id: 1,
  storage_key: 1,
  signed_url: 1,
  signed_url_expires: 1,
  content_type: 1,
} as const satisfies Partial<Record<keyof FileTableRow, 1>>;

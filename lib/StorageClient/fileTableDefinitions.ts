import type {
  FileTableInsertRow as SharedFileTableInsertRow,
  FileTableRow as SharedFileTableRow,
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

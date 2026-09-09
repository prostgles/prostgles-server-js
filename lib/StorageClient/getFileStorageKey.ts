import type { FileTableRow } from "./getFileTableConfig";

/** Legacy files are stored under their logical ID. */
export const getFileStorageKey = (file: Pick<FileTableRow, "id" | "storage_key">) =>
  file.storage_key ?? file.id;

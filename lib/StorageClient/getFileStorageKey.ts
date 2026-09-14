import type { FileTableRow } from "./getFileTableConfig";

/** Legacy files are stored under their logical ID. */
export const getFileStorageKey = (
  file: Pick<FileTableRow, "id" | "storage_key"> | { storage_key: string },
) => {
  const { storage_key } = file;
  const id = "id" in file ? file.id : undefined;
  const key = storage_key ?? id;
  if (!key) {
    throw new Error("Unable to determine file storage key");
  }
  return key;
};

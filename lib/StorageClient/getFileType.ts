// const fileType = require("file-type");
// const res = await fileType.fromBuffer(typeof file === "string"? Buffer.from(file, 'utf8') : file);

// import * as sharp from "sharp";

import type { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION } from "prostgles-types";
import { CONTENT_TYPE_TO_EXT, getKeys } from "prostgles-types";

export const getFileType = async (
  file: Buffer | string,
  fileName: string,
): Promise<{ mime: ALLOWED_CONTENT_TYPE; ext: ALLOWED_EXTENSION }> => {
  const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    typeof import("file-type", { with: { "resolution-mode": "import" } })
  >);

  const fileNameMime = getFileTypeFromFilename(fileName);
  if (!fileNameMime?.ext) throw new Error("File name must contain extension");
  const res = await fileTypeFromBuffer(typeof file === "string" ? Buffer.from(file, "utf8") : file);

  if (!res) {
    /* Set correct/missing extension */
    const nameExt = fileNameMime.ext;
    if (["xml", "txt", "csv", "tsv", "svg", "sql"].includes(nameExt)) {
      return fileNameMime;
    }

    throw new Error("Could not get the file type from file buffer");
  } else {
    if (fileNameMime.ext.toLowerCase() !== res.ext.toLowerCase()) {
      throw new Error(
        `There is a mismatch between file name extension and actual buffer extension: ${fileNameMime.ext} vs ${res.ext}`,
      );
    }
  }
  return res as any;
};

export const getFileTypeFromFilename = (
  fileName: string,
): { mime: ALLOWED_CONTENT_TYPE; ext: ALLOWED_EXTENSION } | undefined => {
  const nameParts = fileName.split(".");

  if (nameParts.length < 2) return undefined;

  const nameExt = nameParts.at(-1)!.toLowerCase(),
    mime = getKeys(CONTENT_TYPE_TO_EXT).find((k) =>
      (CONTENT_TYPE_TO_EXT[k] as readonly string[]).includes(nameExt),
    );

  if (!mime) return undefined;

  return {
    mime,
    ext: nameExt as ALLOWED_EXTENSION,
  };
};

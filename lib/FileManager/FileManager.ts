import type * as stream from "stream";

// import * as sharp from "sharp";

import type { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION } from "prostgles-types";
import { CONTENT_TYPE_TO_EXT, getKeys } from "prostgles-types";

export type LocalConfig = {
  /**
   * example: path.join(__dirname+'/media')
   * note that this location will be relative to the compiled file location
   */
  localFolderPath: string;

  /**
   * Minimum amount of free bytes available to allow saving files
   * Defaults to 100MB
   */
  minFreeBytes?: number;
};

export const HOUR = 3600 * 1000;

export type OnProgress = (progress: { total: number; loaded: number }) => void;

export type UploadedCloudFile = {
  cloud_url: string;
  etag: string;
  content_length: number;
};
export type FileUploadArgs = {
  fileName: string;
  contentType: string;
  file: string | Buffer | stream.PassThrough;
  onProgress?: (bytesUploaded: number) => void;
};
export type StorageClientBase = {
  upload: (file: FileUploadArgs) => Promise<UploadedCloudFile>;
  downloadAsStream: (name: string) => Promise<stream.Readable>;
  delete: (fileName: string) => Promise<void>;
};
export type LocalStorageClient = StorageClientBase & {
  type: "local";
  localFolderPath: string;
};
export type CloudStorageClient = StorageClientBase & {
  type: "cloud";
  getSignedUrlForDownload: (fileName: string, expiresInSeconds: number) => Promise<string>;
};
export type StorageClient = LocalStorageClient | CloudStorageClient;

export type UploadItem = {
  name: string;
  content_type: string;
  data: Buffer;
  extension: string;
};
export type UploadedItem = {
  /**
   * Url that is passed to client
   */
  url: string;
  filePath?: string;
  etag: string;

  /**
   * Cloud url of the resource
   */
  cloud_url?: string;

  /**
   * Total uploaded file size in bytes
   */
  content_length: number;
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

// const fileType = require("file-type");
// const res = await fileType.fromBuffer(typeof file === "string"? Buffer.from(file, 'utf8') : file);

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

export function bytesToSize(bytes: number) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes == 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)) + "");
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + sizes[i];
}

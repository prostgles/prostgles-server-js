import type * as stream from "stream";

export const HOUR = 3600 * 1000;

export type LocalUploadedFileDetails = {
  type: "local";
  filePath: string;
  contentHash: string;
  contentLength: number;
};
export type CloudUploadedFileDetails = {
  type: "cloud";
  url: string;
  /**
   * The ETag  
   */
  contentHash: string;
  contentLength: number;
};
export type UploadFileOptions = {
  fileName: string;
  contentType: string;
  file: string | Buffer | stream.PassThrough;
  onProgress?: (bytesUploaded: number) => void;
};
export type StorageClientBase<T> = {
  upload: (file: UploadFileOptions) => Promise<T>;
  downloadAsStream: (name: string) => Promise<stream.Readable>;
  delete: (fileName: string) => Promise<void>;
};
export type LocalStorageClient = StorageClientBase<LocalUploadedFileDetails> & {
  type: "local";
  localFolderPath: string;
};
export type CloudStorageClient = StorageClientBase<CloudUploadedFileDetails> & {
  type: "cloud";
  getSignedUrlForDownload: (fileName: string, expiresInSeconds: number) => Promise<string>;
};
export type StorageClient = LocalStorageClient | CloudStorageClient;

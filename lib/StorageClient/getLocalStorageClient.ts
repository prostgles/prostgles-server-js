import crypto from "crypto";
import fs from "fs";
import path from "path";
import stream from "stream";
import { pipeline } from "stream/promises";
import type {
  UploadFileOptions,
  LocalStorageClient,
  LocalUploadedFileDetails,
} from "./StorageClientTypes";

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

export const getLocalStorageClient = (localConfig: LocalConfig): LocalStorageClient => {
  const { localFolderPath, minFreeBytes = 100 * 1024 * 1024 } = localConfig; // Default 100MB

  // Helper to ensure we have enough free disk space (Requires Node >= 18.17.0)
  const checkFreeSpace = async () => {
    try {
      const stats = await fs.promises.statfs(localFolderPath);
      const freeSpace = stats.bavail * stats.bsize;

      if (freeSpace < minFreeBytes) {
        throw new Error(
          `Insufficient disk space. Required: ${minFreeBytes} bytes, Available: ${freeSpace} bytes`,
        );
      }
    } catch (error: any) {
      // If the directory doesn't exist yet, statfs will throw. We'll ignore and let mkdir handle it.
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  };

  return {
    type: "local",
    localFolderPath: localConfig.localFolderPath,
    upload: async (args: UploadFileOptions): Promise<LocalUploadedFileDetails> => {
      await fs.promises.mkdir(localFolderPath, { recursive: true });
      await checkFreeSpace();

      const filePath = path.join(localFolderPath, args.fileName);
      const hash = crypto.createHash("md5");
      let contentLength = 0;

      const buffered = typeof args.file === "string" || Buffer.isBuffer(args.file);
      const source = buffered ? stream.Readable.from([args.file]) : args.file;
      let lastProgress = Date.now();
      const measure = new stream.Transform({
        transform: (chunk: Buffer, _encoding, callback) => {
          contentLength += chunk.length;
          hash.update(chunk);
          if (args.onProgress && (buffered || Date.now() - lastProgress > 1000)) {
            lastProgress = Date.now();
            args.onProgress(contentLength);
          }
          callback(null, chunk);
        },
      });
      // Wait for all streams to close before transaction cleanup can remove a failed upload.
      await pipeline(source, measure, fs.createWriteStream(filePath));
      return {
        type: "local",
        filePath,
        contentHash: hash.digest("hex"),
        contentLength,
      };
    },

    downloadAsStream: async (name: string) => {
      const filePath = path.join(localFolderPath, name);

      try {
        await fs.promises.access(filePath, fs.constants.R_OK);
      } catch (err) {
        throw new Error(`File not found or unreadable: ${name}`);
      }

      return fs.createReadStream(filePath);
    },

    delete: async (fileName: string) => {
      const filePath = path.join(localFolderPath, fileName);
      try {
        await fs.promises.unlink(filePath);
      } catch (err: any) {
        // Ignore error if file doesn't exist
        if (err.code !== "ENOENT") {
          throw err;
        }
      }
    },
  };
};

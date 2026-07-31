import crypto from "crypto";
import fs from "fs";
import path from "path";
import stream from "stream";
import type {
  FileUploadArgs,
  LocalConfig,
  LocalStorageClient,
  UploadedCloudFile,
} from "./FileManager";

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
    upload: async (args: FileUploadArgs): Promise<UploadedCloudFile> => {
      // Ensure the target directory exists
      await fs.promises.mkdir(localFolderPath, { recursive: true });
      await checkFreeSpace();

      const filePath = path.join(localFolderPath, args.fileName);
      const hash = crypto.createHash("md5");
      let contentLength = 0;

      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(filePath);

        writeStream.on("error", reject);
        writeStream.on("finish", () => {
          resolve({
            cloud_url: filePath,
            etag: hash.digest("hex"),
            content_length: contentLength,
          });
        });

        // Handle raw string or Buffer
        if (typeof args.file === "string" || Buffer.isBuffer(args.file)) {
          const buffer = Buffer.isBuffer(args.file) ? args.file : Buffer.from(args.file);

          contentLength = buffer.length;
          hash.update(buffer);

          if (args.onProgress) {
            args.onProgress(contentLength);
          }

          writeStream.write(buffer);
          writeStream.end();
        } else if (
          args.file instanceof stream.Readable ||
          (args.file as unknown) instanceof stream.PassThrough
        ) {
          let lastProgress = Date.now();
          const throttle = 1000; // 1 second
          args.file.on("data", (chunk: Buffer) => {
            contentLength += chunk.length;
            hash.update(chunk);
            if (args.onProgress && Date.now() - lastProgress > throttle) {
              lastProgress = Date.now();
              args.onProgress(contentLength);
            }
          });

          args.file.on("error", reject);
          args.file.pipe(writeStream);
        } else {
          reject(new Error("Unsupported file type provided to upload."));
        }
      });
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

import { FileManager, OnProgress, UploadedItem } from "./FileManager";
import * as fs from "fs";
import * as stream from "stream";
import * as path from "path";

export function uploadStream(
  this: FileManager,
  name: string,
  mime: string,
  onProgress?: OnProgress,
  onError?: (error: any) => void,
  onEnd?: (item: UploadedItem) => void,
  expectedSizeBytes?: number,
) {
  const passThrough = new stream.PassThrough();

  if (!this.cloudClient && "localFolderPath" in this.config) {
    try {
      this.checkFreeSpace(this.config.localFolderPath, expectedSizeBytes).catch(
        (err) => {
          onError?.(err);
          passThrough.end();
        },
      );
      const url = this.getLocalFileUrl(name);
      fs.mkdirSync(this.config.localFolderPath, { recursive: true });
      const filePath = path.resolve(`${this.config.localFolderPath}/${name}`);
      const writeStream = fs.createWriteStream(filePath);

      let errored = false;
      let loaded = 0;
      writeStream.on("error", (err) => {
        errored = true;
        onError?.(err);
      });

      let lastProgress = Date.now();
      const throttle = 1000;
      if (onProgress) {
        passThrough.on("data", function (chunk) {
          loaded += chunk.length;
          const now = Date.now();
          if (now - lastProgress > throttle) {
            lastProgress = now;
            onProgress?.({ loaded, total: expectedSizeBytes ?? 0 });
          }
        });
      }

      if (onEnd) {
        writeStream.on("finish", () => {
          if (errored) return;
          let content_length = 0;
          try {
            content_length = fs.statSync(filePath).size;

            onEnd?.({
              url,
              filePath,
              etag: `none`,
              content_length,
            });
          } catch (err) {
            onError?.(err);
          }
        });
      }

      passThrough.pipe(writeStream);
    } catch (err) {
      onError?.(err);
    }
  } else {
    this.upload(passThrough, name, mime, onProgress).then(onEnd).catch(onError);
  }

  return passThrough;
}

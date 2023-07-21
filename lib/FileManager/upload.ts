import { FileManager, LocalConfig, OnProgress, CloudClient, UploadedItem } from "./FileManager";
import * as stream from 'stream'; 
import * as fs from 'fs';

export async function upload(
  this: FileManager,
  file: Buffer | string | stream.PassThrough, 
  name: string,
  mime: string,
  onProgress?: OnProgress
): Promise<UploadedItem> {

  return new Promise(async (resolve, reject) => {
    if(!file){
      throw "No file. Expecting: Buffer | String | stream.PassThrough";
    }
    if(!name){
      throw "No file name. Expecting: String";
    }

    const url = this.getLocalFileUrl(name);
    if(!this.cloudClient){
      if(file instanceof stream.PassThrough){
        throw new Error("S3 config missing. Can only upload streams to S3");
      }
      const config = this.config as LocalConfig;
      try {
        await fs.promises.mkdir(config.localFolderPath, { recursive: true });
        const filePath = `${config.localFolderPath}/${name}`;
        fs.writeFileSync(filePath, file);
        resolve({
          url,
          etag: `none`,
          content_length: fs.statSync(filePath).size
        });
      } catch(err){
        console.error("Error saving file locally", err);
        reject("Internal error")
      }
    } else {

      let content_length = 0;
      this.cloudClient.upload({
        fileName: name,
        contentType: mime,
        file,
        onFinish: (err, { etag, cloud_url, content_length }) => {
          if(err){
            reject(err.toString());
          } else {
            resolve({ url, etag, cloud_url, content_length });
          }
        },
        onProgress: loaded => {
          content_length = loaded;
          onProgress?.({ loaded, total: content_length });
        }
      });
    }

  });
}
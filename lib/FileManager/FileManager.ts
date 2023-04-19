
import { S3, IAM } from 'aws-sdk'; 
// import { PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import * as fs from 'fs';
import * as stream from 'stream';

import * as sharp from "sharp";
import checkDiskSpace from 'check-disk-space';

import { DB, DBHandlerServer, ExpressApp, Prostgles } from '../Prostgles';
import { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION, CONTENT_TYPE_TO_EXT, getKeys, isDefined, ValidatedColumnInfo } from 'prostgles-types';

import AWS from 'aws-sdk'; 
import * as path from "path";
import { initFileManager } from "./initFileManager";
import { parseFile } from "./parseFile";
import { upload } from "./upload";
import { uploadStream } from "./uploadStream";

export const HOUR = 3600 * 1000;

export const asSQLIdentifier = async (name: string, db: DB): Promise<string> => {
  return (await db.one("select format('%I', $1) as name", [name]))?.name
}

export type OnProgress = (progress: S3.ManagedUpload.Progress) => void

export type ImageOptions = {
  keepMetadata?: boolean;
  compression?:
    /**
     * Will resize image maintaing scale ratio
     */
    | { inside: { width: number; height: number } }
    | { contain: 
        | { width: number }
        | { height: number }
      }
}

export type S3Config = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

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
}

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
   * S3 url of the resource
   */
  s3_url?: string;

  /**
   * Total uploaded file size in bytes
   */
  content_length: number;
};

export class FileManager {

  static testCredentials = async (accessKeyId: string, secretAccessKey: string) => {
    const sts = new AWS.STS();
    AWS.config.credentials = {
      accessKeyId,
      secretAccessKey
    }

    const ident = await sts.getCallerIdentity({}).promise();
    return ident;
  }
  
  s3Client?: S3;

  config: S3Config | LocalConfig;
  imageOptions?: ImageOptions;

  prostgles?: Prostgles;
  get dbo(): DBHandlerServer { 
    if(!this.prostgles?.dbo) {
      // this.prostgles?.refreshDBO();
      throw "this.prostgles.dbo missing"
    }
    return this.prostgles.dbo 
  }
  
  get db(): DB { 
    if(!this.prostgles?.db) throw "this.prostgles.db missing"
    return this.prostgles.db 
  }
  
  tableName?: string;

  fileRoute?: string;
  get fileRouteExpress (){
    return this.fileRoute + "/:name";
  }
  private checkInterval?: NodeJS.Timeout;

  constructor(config: FileManager["config"], imageOptions?: ImageOptions){
    this.config = config;
    this.imageOptions = imageOptions;

    if("region" in config){
      const { region, accessKeyId, secretAccessKey } = config;
      this.s3Client = new S3({ 
        region, 
        credentials: { accessKeyId, secretAccessKey },
      });
    }

    const fullConfig = this.prostgles?.opts.fileTable;
    if(fullConfig?.delayedDelete){
      this.checkInterval = setInterval(async () => {
        const fileTable = fullConfig.tableName;
        const daysDelay = fullConfig.delayedDelete?.deleteAfterNDays ?? 0;
        if(fileTable && this.dbo[fileTable]?.delete && daysDelay){
          const filesToDelete = await this.dbo[fileTable]?.find?.({ deleted_from_storage: null, deleted: { ">": Date.now() - (daysDelay * HOUR * 24) } }) ?? [];
          for await(const file of filesToDelete){
            await this.deleteFile(file.name)
          }
        } else {
          console.error("FileManager checkInterval delayedDelete FAIL: Could not access file table tableHandler.delete()")
        }
      }, Math.max(10000, (fullConfig.delayedDelete.checkIntervalHours || 0) * HOUR))
    }
  }

  async getFileStream(name: string): Promise<stream.Readable> {
    if("bucket" in this.config && this.s3Client){
      return this.s3Client.getObject({ Key: name, Bucket: this.config.bucket }).createReadStream()
    } else if("localFolderPath" in this.config){
      const filePath = path.resolve(`${this.config.localFolderPath}/${name}`);
      if(!fs.existsSync(filePath)){
        throw `File ${filePath} could not be found`;
      }
      return fs.createReadStream(filePath, { encoding: undefined })
    } else throw new Error("Not expected");
  }

  async deleteFile(name: string) {
    if("bucket" in this.config && this.s3Client){
      const res = await this.s3Client?.deleteObject({ Bucket: this.config.bucket, Key: name }).promise();
      return res;
    } else if("localFolderPath" in this.config){
      const path = `${this.config.localFolderPath}/${name}`;
      if(!fs.existsSync(path)){
        throw `File ${path} could not be found`;
      }
      fs.unlinkSync(path);
      if(fs.existsSync(path)) throw new Error("Could not delete file");
    }
    return true
  }

  parseFile = parseFile.bind(this);

  getLocalFileUrl = (name: string) => this.fileRoute? `${this.fileRoute}/${name}` : "";

  checkFreeSpace = async (folderPath: string, fileSize = 0) => {
    if(!this.s3Client && "localFolderPath" in this.config) {
      const { minFreeBytes = 1.048e6 } = this.config;
      const required = Math.max(fileSize, minFreeBytes)
      if(required){
        const diskSpace = await checkDiskSpace(folderPath);
        if(diskSpace.free < required){
          const err =  `There is not enough space on the server to save files.\nTotal: ${bytesToSize(diskSpace.size)} \nRemaning: ${bytesToSize(diskSpace.free)} \nRequired: ${bytesToSize(required)}`
          throw new Error(err);
        }
      }
    }
  }
  
  uploadStream = uploadStream.bind(this);

  upload = upload.bind(this);

  uploadAsMedia = async (params: {
    item: UploadItem;
    allowedExtensions?: Array<ALLOWED_EXTENSION>;
    dissallowedExtensions?: Array<ALLOWED_EXTENSION>;
    imageOptions?: ImageOptions;
  }): Promise<UploadedItem> => {
    const { item, imageOptions } = params;
    const { name, data, content_type, extension } = item;
    if(!data) throw "No file provided";
    if(!name || typeof name !== "string") throw "Expecting a string name";
    
    // const type = await this.getMIME(data, name, allowedExtensions, dissallowedExtensions);

    let _data = data;
    
    /** Resize/compress/remove exif from photos */
    if(content_type.startsWith("image") && extension.toLowerCase() !== "gif"){

      const compression = imageOptions?.compression
      if(compression){
        console.log("Resizing image")
        let opts;
        if("contain" in compression){
          opts = {
            fit: sharp.fit.contain,
            ...compression.contain
          }
        } else if("inside" in compression){
          opts = {
            fit: sharp.fit.inside,
            ...compression.inside
          }
        }
        _data = await sharp(data)
          .resize(opts as any)
          .withMetadata(Boolean(imageOptions?.keepMetadata) as any)
          // .jpeg({ quality: 80 })
          .toBuffer()
      } else if(!imageOptions?.keepMetadata) {
        /**
         * Remove exif
         */
        // const metadata = await simg.metadata();
        // const simg = await sharp(data);

        _data = await sharp(data).clone().withMetadata({
            exif: {}
          })
          .toBuffer()
      }
    }

    const res = await this.upload(_data, name, content_type);

    return res
  }

  async getFileS3URL(fileName: string, expiresInSeconds: number = 30 * 60){
    const params = {
      Bucket: (this.config as S3Config).bucket, 
      Key: fileName,
      Expires: Math.round(expiresInSeconds || 30 * 60) // Error if float
    };
    return await this.s3Client?.getSignedUrlPromise("getObject", params);
  }

  parseSQLIdentifier = async (name: string ) => asSQLIdentifier(name, this.prostgles!.db!);//  this.prostgles.dbo.sql<"value">("select format('%I', $1)", [name], { returnType: "value" } )

  getColInfo = (args: { tableName: string; colName: string }): ValidatedColumnInfo["file"] | undefined => {
    const { colName, tableName } = args;
    const tableConfig = this.prostgles?.opts.fileTable?.referencedTables?.[tableName];
    const isReferencingFileTable = this.dbo[tableName]?.columns?.some(c => c.name === colName && c.references && c.references?.some(({ ftable }) => ftable === this.tableName ));
    if(isReferencingFileTable){
      if(tableConfig && typeof tableConfig !== "string"){
        return tableConfig.referenceColumns[colName];
      }
      return { acceptedContent: "*" };
    }
    return undefined;
  }

  init = initFileManager.bind(this);

  destroy = () => {
    removeExpressRoute(this.prostgles?.opts.fileTable?.expressApp, [this.fileRouteExpress]);
  }
}

export const removeExpressRoute = (app: ExpressApp | undefined, routePaths: (string | undefined)[]) => {

  const routes = app?._router?.stack;
  if(routes){
    routes.forEach((route, i) => {
      if(routePaths.filter(isDefined).includes(route.route?.path as any)){
        routes.splice(i, 1);
      }
    })
  }
}

export const getFileTypeFromFilename = (fileName: string): { mime: ALLOWED_CONTENT_TYPE; ext: ALLOWED_EXTENSION | string } | undefined => {

  const nameParts = fileName.split(".");

  if(nameParts.length < 2) return undefined;

  const nameExt = nameParts.at(-1)!.toLowerCase(),
    mime = getKeys(CONTENT_TYPE_TO_EXT).find(k => (CONTENT_TYPE_TO_EXT[k] as readonly string[]).includes(nameExt));

  if(!mime) return undefined;

  return {
    mime,
    ext: nameExt as ALLOWED_EXTENSION,
  }
}

// const fileType = require("file-type");
// const res = await fileType.fromBuffer(typeof file === "string"? Buffer.from(file, 'utf8') : file);

export const getFileType = async (file: Buffer | string, fileName: string): Promise<{ mime: ALLOWED_CONTENT_TYPE; ext: ALLOWED_EXTENSION }> => {

  const { fileTypeFromBuffer } = await (eval('import("file-type")') as Promise<typeof import('file-type')>);
  
  const fileNameMime = getFileTypeFromFilename(fileName);
  if(!fileNameMime?.ext) throw new Error("File name must contain extenion")
  const res = await fileTypeFromBuffer(typeof file === "string"? Buffer.from(file, 'utf8') : file);
  
  if(!res) {

    /* Set correct/missing extension */
    const nameExt = fileNameMime?.ext;
    if(["xml", "txt", "csv", "tsv", "svg", "sql"].includes(nameExt) && fileNameMime.mime){
      return fileNameMime as any;
    }
    
    throw new Error("Could not get the file type from file buffer");
  } else {

    if(!res.ext || fileNameMime?.ext.toLowerCase() !== res.ext.toLowerCase()){
      throw new Error(`There is a mismatch between file name extension and actual buffer extension: ${fileNameMime?.ext } vs ${res.ext}`)
    }
  }
  return res as any;
}

export function bytesToSize(bytes: number) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes == 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)) + "");
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}


/**
 *
 

    // if(content_type && typeof content_type !== "string") throw "Invalid content_type provided";
    // if(title && typeof title !== "string") throw "Invalid title provided";
    // let fExt = name.split(".").pop()
    // if(content_type && name.split(".").length > 1 && fExt && fExt.length <= 4){
    //   type = {
    //     mime: content_type,
    //     ext: fExt,
    //     fileName: name,
    //   }
    // } else {
    //   type = await this.getMIME(data, name);//, ["png", "jpg", "ogg", "webm", "pdf", "doc"]);
    // }



 */
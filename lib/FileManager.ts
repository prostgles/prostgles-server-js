
import { S3 } from 'aws-sdk';
import { ManagedUpload } from 'aws-sdk/clients/s3';
import * as fs from 'fs';

import * as sharp from "sharp";

import { DB, DBHandlerServer, Prostgles } from './Prostgles';
import { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION, asName, CONTENT_TYPE_TO_EXT, getKeys, isObject, ValidatedColumnInfo } from 'prostgles-types';
import { TableHandler, ViewHandler } from './DboBuilder';

const HOUR = 3600 * 1000;

export const asSQLIdentifier = async (name: string, db: DB): Promise<string> => {
  return (await db.one("select format('%I', $1) as name", [name]))?.name
}

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
  // onUploaded?: () => any;
}

export type LocalConfig = {
  /**
   * example: path.join(__dirname+'/media')
   * note that this location will be relative to the compiled file location
   */
  localFolderPath: string;
}

export type UploadItem = {
  name: string;
  content_type: string;
  data: Buffer;
};
export type UploadedItem = {
  /**
   * Url that is passed to client
   */
  url: string;
  etag: string;

  /**
   * S3 url of the resource
   */
  s3_url?: string;
};

export default class FileManager {
  
  s3Client?: S3;

  config: S3Config | LocalConfig;
  imageOptions?: ImageOptions;

  prostgles?: Prostgles;
  get dbo(): DBHandlerServer { 
    if(!this.prostgles?.dbo) throw "this.prostgles.dbo missing"
    return this.prostgles.dbo 
  };
  get db(): DB { 
    if(!this.prostgles?.db) throw "this.prostgles.db missing"
    return this.prostgles.db 
  };
  
  tableName?: string;

  private fileRoute?: string;

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
  }

  async parseFile(args: {
    file: Buffer | string;
    fileName: string;
    colName?: string;
    tableName?: string;
  }): Promise<{
    mime: string | ALLOWED_CONTENT_TYPE;
    ext: string | ALLOWED_EXTENSION;

    /** File name is not returned because we fail if the extensions do not match */
    // fileName: string;
  }> {
    const { file, fileName, tableName, colName } = args;
    const config = this.prostgles?.opts.fileTable;
    if(!config) throw new Error("File table config missing");

    const buffer = typeof file === "string"? Buffer.from(file, 'utf8') : file;
    const mime = await getFileType(buffer, fileName);

    if(tableName && colName){
      const tableConfig = config.referencedTables?.[tableName];

      if(tableConfig && isObject(tableConfig) && tableConfig.referenceColumns[colName]){
        const colConfig = tableConfig.referenceColumns[colName];
        if(colConfig.maxFileSizeMB){
          const actualBufferSize = Buffer.byteLength(buffer);
          if((actualBufferSize/1e6) > colConfig.maxFileSizeMB){
            throw new Error(`Provided file is larger than the ${colConfig.maxFileSizeMB}MB limit`);
          }
        }
        
        if("acceptedContent" in colConfig && colConfig.acceptedContent){
          const CONTENTS = [ 
            "image",
            "audio",
            "video",
            "text",
            "application",
          ];
          const allowedContent = ViewHandler._parseFieldFilter(colConfig.acceptedContent, false, CONTENTS);
          if(!allowedContent.some(c => mime.mime.startsWith(c))){
            throw new Error(`Dissallowed content type provided: ${mime.mime.split("/")[0]}. Allowed content types: ${allowedContent} `)
          }
        } else if("acceptedContentType" in colConfig && colConfig.acceptedContentType){
          const allowedContentTypes = ViewHandler._parseFieldFilter(colConfig.acceptedContentType, false, getKeys(CONTENT_TYPE_TO_EXT));
          
          if(!allowedContentTypes.some(c => c === mime.mime)){
            throw new Error(`Dissallowed MIME provided: ${mime.mime}. Allowed MIME values: ${allowedContentTypes} `)
          }
        } else if("acceptedFileTypes" in colConfig && colConfig.acceptedFileTypes){
          const allowedExtensions = ViewHandler._parseFieldFilter(colConfig.acceptedFileTypes, false, Object.values(CONTENT_TYPE_TO_EXT).flat());
          
          if(!allowedExtensions.some(c => c === mime.ext)){
            throw new Error(`Dissallowed extension provided: ${mime.ext}. Allowed extension values: ${allowedExtensions} `)
          }
        }
      } 
    }

    return mime;
  }

  // private async getMIME(
  //   file: Buffer | string, 
  //   fileName: string, 
  //   allowedExtensions?: Array<ALLOWED_EXTENSION>,
  //   dissallowedExtensions?: Array<ALLOWED_EXTENSION>,
  //   onlyFromName = true
  // ): Promise<{
  //   mime: string;
  //   ext: string | ALLOWED_EXTENSION;
  //   fileName: string;
  // }> {

  //   const nameParts = fileName.split(".");
    
  //   const nameExt = nameParts[nameParts.length - 1].toLowerCase(),
  //     mime = getKeys(CONTENT_TYPE_TO_EXT).find(k => (CONTENT_TYPE_TO_EXT[k] as readonly string[]).includes(nameExt));

  //   let type = {
  //     fileName,
  //     mime,
  //     ext: nameExt,
  //   }

  //   if(onlyFromName && !mime) throw `Invalid file extension: content_type could not be found for extension(${nameExt})`;

  //   if(!mime){
  //     /* Set correct/missing extension */
  //     if(["xml", "txt", "csv", "tsv"].includes(nameExt)){
  //       type = { ...type, mime: ("text/" + nameExt) as any, ext: nameExt };
  //     } else if(["svg"].includes(nameExt)){
  //       type = { ...type, mime: "image/svg+xml", ext: nameExt };
  //     } else {
  //       const res = await getFileTypeFromBuffer(file);
        
  //       type = {
  //         ...(res as any),
  //         fileName,
  //       }
  //     }
  //   }

  //   if(
  //     allowedExtensions &&
  //     !allowedExtensions.map(v => v.toLowerCase())?.includes(type.ext)
  //   ){
  //     throw fileName + " -> File type ( " + type.ext + " ) not allowed. Expecting one of: " + allowedExtensions.map(v => v.toLowerCase()).join(", ");

  //   } else if(
  //     dissallowedExtensions &&
  //     dissallowedExtensions.map(v => v.toLowerCase())?.includes(type.ext)
  //   ){
  //     throw fileName + " -> File type ( " + type.ext + " ) not allowed";

  //   }

  //   if(!onlyFromName){
  //     let { ext } = type;
  //     if(nameExt !== ext) fileName = nameParts.slice(0, -1).join('') + "." + ext;
  //   }

  //   const res = {
  //     ...type,
  //     fileName
  //   }
  //   if(!res.mime) throw "Could not find mime"
  //   return res as any;
  // }

  // async getUploadURL(fileName: string): Promise<string> {
  //   const thisHour = new Date();
  //   thisHour.setMilliseconds(0);
  //   thisHour.setSeconds(0);
  //   thisHour.setMinutes(0);
  //   const now = Date.now();
  //   const HOUR = 60 * 60;
  //   const params = {
  //     Bucket: this.config.bucket, 
  //     Key: fileName, 
  //     Expires: Math.round(((now - (+thisHour))/1000 + 2 * HOUR )), // one hour
  //     ACL: "bucket-owner-full-control", 
  //     ContentType: "image/png",
  //   };
  //   return await this.s3Client.getSignedUrlPromise("putObject", params)
  // }
  
  private async upload(
    file: Buffer | String, 
    name: string,
    mime: string
  ): Promise<UploadedItem> {

    return new Promise(async (resolve, reject) => {
      if(!file){
        throw "No file. Expecting: Buffer | String";
      }
      if(!name){
        throw "No name. Expecting: String";
      }

      // let type = await this.getMIME(file, name, allowedExtensions);
      const url = `${this.fileRoute}/${name}`;
      if(!this.s3Client){
        const config = this.config as LocalConfig;
        try {
          await fs.promises.mkdir(config.localFolderPath, { recursive: true });

          fs.writeFileSync(`${config.localFolderPath}/${name}`, file as any);
          resolve({
            url,
            etag: `none`,
          })
        } catch(err){
          console.error("Error saving file locally", err);
          reject("Internal error")
        }
      } else {

        /* S3 Upload */
        // ACL: "public-read", 
        /* ACL needs this permission: 
            "s3:PutObject",
            "s3:PutObjectAcl",
            "s3:GetObject",
            "s3:GetObjectAcl",
          */
            const params = {
              Bucket: (this.config as S3Config).bucket, 
              Key: name,
              ContentType: mime,
              Body: file
            };
            this.s3Client.upload(params, (err: any, res: ManagedUpload.SendData) => {
              
              if(err){
                reject("Something went wrong");
                console.error(err)
              } else {
                // console.log("Uploaded file:", res)
                resolve({
                  url,
                  etag: res.ETag,
                  s3_url: res.Location,
                });
              }
            });
      }

    });
  }

  uploadAsMedia = async (params: {
    item: UploadItem;
    allowedExtensions?: Array<ALLOWED_EXTENSION>;
    dissallowedExtensions?: Array<ALLOWED_EXTENSION>;
    imageOptions?: ImageOptions;
  }): Promise<UploadedItem> => {
    const { item, imageOptions } = params;
    const { name, data, content_type } = item;
    if(!data) throw "No file provided";
    if(!name || typeof name !== "string") throw "Expecting a string name";
    
    // const type = await this.getMIME(data, name, allowedExtensions, dissallowedExtensions);

    let _data = data;
    
    if(content_type.startsWith("image")){

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
        _data = await sharp(data)
          .clone()
          .toBuffer()
      }
    }

    const res = await this.upload(_data, name, content_type);

    return res
  }

  private async getFileURL(fileName: string, expiresInSeconds: number = 30 * 60){
    const params = {
      Bucket: (this.config as S3Config).bucket, 
      Key: fileName,
      Expires: expiresInSeconds || 30 * 60
    };
    return await this.s3Client?.getSignedUrlPromise("getObject", params);
  }

  private parseSQLIdentifier = async (name: string ) => asSQLIdentifier(name, this.prostgles!.db!);//  this.prostgles.dbo.sql<"value">("select format('%I', $1)", [name], { returnType: "value" } )

  getColInfo = (args: { tableName: string; colName: string }): ValidatedColumnInfo["file"] | undefined => {
    const { colName, tableName } = args;
    const tableConfig = this.prostgles?.opts.fileTable?.referencedTables?.[tableName]
    if(tableConfig && typeof tableConfig !== "string"){
      return tableConfig.referenceColumns[colName];
    }
    return undefined;
  }

  init = async (prg: Prostgles) => {
    this.prostgles = prg;
    
    // const { dbo, db, opts } = prg;
    
    const { fileTable } = prg.opts;
    if(!fileTable) throw "fileTable missing";
    const { tableName = "media", referencedTables = {} } = fileTable;
    this.tableName = tableName;

    const maxBfSizeMB = (prg.opts.io?.engine?.opts?.maxHttpBufferSize || 1e6)/1e6;
    console.log(`Prostgles: Initiated file manager. Max allowed file size: ${maxBfSizeMB}MB (maxHttpBufferSize = 1e6). To increase this set maxHttpBufferSize in socket.io server init options`);

    // throw "Why are constraints dissapearing?"
    /**
     * 1. Create media table
     */
    if(!this.dbo[tableName]){
      console.log(`Creating fileTable ${asName(tableName)} ...`);
      await this.db.any(`CREATE EXTENSION IF NOT EXISTS pgcrypto `);
      await this.db.any(`CREATE TABLE IF NOT EXISTS ${asName(tableName)} (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name                  TEXT NOT NULL,
          extension             TEXT NOT NULL,
          content_type          TEXT NOT NULL,
          url                   TEXT NOT NULL,
          original_name         TEXT NOT NULL,

          description           TEXT,
          s3_url                TEXT,
          signed_url            TEXT,
          signed_url_expires    BIGINT,
          etag                  TEXT,
          deleted               BIGINT,
          deleted_from_storage  BIGINT,
          UNIQUE(name)
      )`);
      console.log(`Created fileTable ${asName(tableName)}`);
      await prg.refreshDBO();
    }

    /**
     * 2. Create media lookup tables 
     */
    await Promise.all(getKeys(referencedTables).map(async refTable => {
      if(!this.dbo[refTable]) throw `Referenced table (${refTable}) from fileTable.referencedTables prostgles init config is missing`;
      const cols = await (this.dbo[refTable] as unknown as TableHandler).getColumns();

      const tableConfig = referencedTables[refTable];
      if(typeof tableConfig !== "string"){
        
        for await (const colName of getKeys(tableConfig.referenceColumns)){
          
          const existingCol = cols.find(c => c.name === colName);
          if(existingCol){
            if(existingCol.references?.ftable === tableName){
              // All ok
            } else {
              if(existingCol.udt_name === "uuid"){
                try {
                  const query = `ALTER TABLE ${asName(tableName)} ADD CONSTRAINT FOREIGN KEY (${asName(colName)}) REFERENCES ${asName(tableName)} (id);`;
                  console.log(`Referenced file column ${refTable} (${colName}) exists but is not referencing file table. Trying to add REFERENCE constraing...\n${query}`);
                  await this.db.any(query);
                  console.log("SUCCESS: " + query);
                } catch(e){
                  throw new Error(`Could not add constraing. Err: ${e instanceof Error? e.message : JSON.stringify(e)}`)
                }
              } else {
                throw new Error(`Referenced file column ${refTable} (${colName}) exists but is not of required type (UUID). Choose a different column name or ALTER the existing column to match the type and the data found in file table ${tableName}(id)`);
              }
            }
          } else {
            try {
              const query = `ALTER TABLE ${asName(tableName)} ADD COLUMN ${asName(colName)} UUID REFERENCES ${asName(tableName)} (id);`
              console.log(`Creating referenced file column ${refTable} (${colName})...\n${query}`);
              await this.db.any(query);
              console.log("SUCCESS: " + query);
            } catch(e){
              throw new Error(`FAILED. Err: ${e instanceof Error? e.message : JSON.stringify(e)}`)
            }
          }
          
        }
      } else {

        const lookupTableName = await this.parseSQLIdentifier(`prostgles_lookup_${tableName}_${refTable}`);
        const pKeyFields = cols.filter(f => f.is_pkey);
  
        if(pKeyFields.length !== 1) throw `Could not make link table for ${refTable}. ${pKeyFields} must have exactly one primary key column. Current pkeys: ${pKeyFields.map(f => f.name)}`;
  
        const pkField = pKeyFields[0];
        const refType = referencedTables[refTable];
  
        if(!this.dbo[lookupTableName]){
          // if(!(await dbo[lookupTableName].count())) await db.any(`DROP TABLE IF EXISTS  ${lookupTableName};`);
          const action = ` (${tableName} <-> ${refTable}) join table ${lookupTableName}`; //  PRIMARY KEY
          const query = `        
          CREATE TABLE ${lookupTableName} (
            foreign_id  ${pkField.udt_name} ${refType === "one"? " PRIMARY KEY " : ""} REFERENCES ${asName(refTable)}(${asName(pkField.name)}),
            media_id    UUID NOT NULL REFERENCES ${asName(tableName)}(id)
          )
          `;
          console.log(`Creating ${action} ...`, lookupTableName);
          await this.db.any(query);
          console.log(`Created ${action}`);
  
        } else {
          const cols = await this.dbo[lookupTableName].getColumns!();
          const badCols = cols.filter(c => !c.references);
          await Promise.all(badCols.map(async badCol => {
            console.error(
              `Prostgles: media ${lookupTableName} joining table has lost a reference constraint for column ${badCol.name}.` + 
              ` This may have been caused by a DROP TABLE ... CASCADE.`
            );
            let q = `
              ALTER TABLE ${asName(lookupTableName)} 
              ADD CONSTRAINT ${(lookupTableName + "_" + badCol.name + "_r")} FOREIGN KEY (${badCol.name})
            `;
            console.log("Trying to add the missing constraint back");
            if(badCol.name === "foreign_id"){
              q += `REFERENCES ${asName(refTable)}(${asName(pkField.name)}) `;
            } else if(badCol.name === "media_id"){
              q += `REFERENCES ${asName(tableName)}(id) `;
            }
  
            if(q){
  
              try {
                await this.db.any(q)
                console.log("Added missing constraint back");
  
              } catch(e){
                console.error("Failed to add missing constraint", e)
              }
            }
  
          }));
        }
      }


      await prg.refreshDBO();
      return true;
    }));

    /**
     * 4. Serve media through express
     */
    const { 
      fileServeRoute = `/${tableName}`, 
      expressApp: app 
    } = fileTable;

    if(fileServeRoute.endsWith("/")){
      throw `fileServeRoute must not end with a '/'`
    }
    this.fileRoute = fileServeRoute;

    if(app){
      app.get(this.fileRoute + "/:name", async (req, res) => {
        if(!this.dbo[tableName]){
          res.status(500).json({ err: `Internal error: media table (${tableName}) not valid` });
          return false;
        }

        const mediaTable = this.dbo[tableName] as unknown as TableHandler;

        try {

          const { name } = req.params;
          if(typeof name !== "string" || !name) throw "Invalid media name";
    
          const media = await mediaTable.findOne({ name }, { select: { id: 1, name: 1, signed_url: 1, signed_url_expires: 1, content_type: 1 } }, { httpReq: req } as any);
    
          if(!media) {
            /**
             * Redirect to login !??
             */
            // const mediaExists = await mediaTable.count({ name });
            // if(mediaExists && this.prostgles.authHandler){

            // } else {
            //   throw "Invalid media";
            // }
            throw "Invalid media";
          }
          
          if(this.s3Client){
            let url = media.signed_url;
            const expires = +(media.signed_url_expires || 0);
            
            const EXPIRES = Date.now() + HOUR;
            if(!url || expires < EXPIRES){
              url = await this.getFileURL(media.name, 60 * 60);
              await mediaTable.update({ name }, { signed_url: url, signed_url_expires: EXPIRES });
            }
  
            res.redirect(url);

          } else {
            const pth = `${(this.config as LocalConfig).localFolderPath}/${media.name}`;

            res.contentType(media.content_type);
            res.sendFile(pth);
          }

        } catch(e){
          console.log(e)
          res.status(404).json({ err: "Invalid/missing media" });
        }
      });
    }
  }
}

export const getFileTypeFromFilename = (fileName: string): { mime: ALLOWED_CONTENT_TYPE; ext: ALLOWED_EXTENSION } | undefined => {

  const nameParts = fileName.split(".");

  if(!nameParts.length) return undefined;

  const nameExt = nameParts[nameParts.length - 1].toLowerCase(),
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
  if(!fileNameMime?.ext) throw new Error("File name must contain extenions")
  const res = await fileTypeFromBuffer(typeof file === "string"? Buffer.from(file, 'utf8') : file);
  
  if(!res) {

    /* Set correct/missing extension */
    const nameExt = fileNameMime?.ext;
    if(["xml", "txt", "csv", "tsv", "svg"].includes(nameExt)){
      return fileNameMime
    } 
    
    throw new Error("Could not get the file type from file buffer");
  } else {

    if(!res.ext || fileNameMime?.ext.toLowerCase() !== res.ext.toLowerCase()){
      throw new Error(`There is a mismatch between file name extension and actual buffer extension: ${fileNameMime?.ext } vs ${res.ext}`)
    }
  }
  return res as any;
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
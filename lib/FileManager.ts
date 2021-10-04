
import { S3 } from 'aws-sdk';
import { ManagedUpload } from 'aws-sdk/clients/s3';
import * as fs from 'fs';

import * as FileType from "file-type";
import * as sharp from "sharp";

import { Prostgles } from './Prostgles';
import { asName, AnyObject } from 'prostgles-types';
import { TableHandler } from './DboBuilder';

const HOUR = 3600 * 1000;

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
  
  s3Client: S3;

  config: S3Config | LocalConfig;
  imageOptions: ImageOptions;

  prostgles: Prostgles;
  tableName: string;

  private fileRoute: string;

  constructor(config: FileManager["config"], imageOptions?: ImageOptions){
    this.config = config;
    this.imageOptions = imageOptions;

    if("region" in config){
      const { region,accessKeyId, secretAccessKey } = config;
      this.s3Client = new S3({ 
        region, 
        credentials: { accessKeyId, secretAccessKey },
      });
    }
  }

  async getMIME(
    file: Buffer | String, 
    fileName: string, 
    allowedExtensions?: Array<ALLOWED_EXTENSION>,
    dissallowedExtensions?: Array<ALLOWED_EXTENSION>,
    onlyFromName = true
  ): Promise<{
    mime: string;
    ext: string;
    fileName: string;
  }> {

    const nameParts = fileName.split(".");
    
    const nameExt = nameParts[nameParts.length - 1].toLowerCase(),
      mime = Object.keys(CONTENT_TYPE_TO_EXT).find(k => CONTENT_TYPE_TO_EXT[k].includes(nameExt));

    let type = {
      fileName,
      mime,
      ext: nameExt,
    }

    if(onlyFromName && !mime) throw `Invalid file extension: content_type could not be found for extension(${nameExt})`;

    if(!mime){
      /* Set correct/missing extension */
      if(["xml", "txt", "csv", "tsv", "doc"].includes(nameExt)){
        type = { ...type, mime: "text/" + nameExt, ext: nameExt };
      } else if(["svg"].includes(nameExt)){
        type = { ...type, mime: "image/svg+xml", ext: nameExt };
      } else if(Buffer.isBuffer(file)){
        const res = await FileType.fromBuffer(file);
        type = {
          ...res,
          fileName,
        }
      } else if(typeof file === "string"){
        const res = await FileType.fromFile(file);
        type = {
          ...res,
          fileName,
        }
      } else {
        throw "Unexpected file. Expecting: Buffer | String";
      }
    }

    if(
      allowedExtensions &&
      !allowedExtensions.map(v => v.toLowerCase())?.includes(type.ext)
    ){
      throw fileName + " -> File type ( " + type.ext + " ) not allowed. Expecting one of: " + allowedExtensions.map(v => v.toLowerCase()).join(", ");

    } else if(
      dissallowedExtensions &&
      dissallowedExtensions.map(v => v.toLowerCase())?.includes(type.ext)
    ){
      throw fileName + " -> File type ( " + type.ext + " ) not allowed";

    }

    if(!onlyFromName){
      let { ext } = type;
      if(nameExt !== ext) fileName = nameParts.slice(0, -1).join('') + "." + ext;
    }

    return {
      ...type,
      fileName
    }
  }

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
            this.s3Client.upload(params, (err, res: ManagedUpload.SendData) => {
              
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
          .resize(opts)
          .withMetadata(Boolean(imageOptions.keepMetadata))
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
    return await this.s3Client.getSignedUrlPromise("getObject", params);
  }

  private parseSQLIdentifier = async (name: string ) => this.prostgles.dbo.sql<"value">("select format('%I', $1)", [name], { returnType: "value" } )

  init = async (prg: Prostgles) => {
    this.prostgles = prg;
    const { dbo, db, opts } = prg;
    const { fileTable } = opts;
    const { tableName = "media", referencedTables = {} } = fileTable;
    this.tableName = tableName;

    const maxBfSizeMB = prg.opts.io?.engine?.opts?.maxHttpBufferSize/1e6;
    console.log(`Prostgles: Initiated file manager. Max allowed file size: ${maxBfSizeMB}MB (maxHttpBufferSize = 1e6). To increase this set maxHttpBufferSize in socket.io server init options`);

    // throw "Why are constraints dissapearing?"
    /**
     * 1. Create media table
     */
    if(!dbo[tableName]){
        console.log(`Creating fileTable ${asName(tableName)} ...`);
        await db.any(`CREATE EXTENSION IF NOT EXISTS pgcrypto `);
        await db.any(`CREATE TABLE ${asName(tableName)} (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name                TEXT NOT NULL,
            extension           TEXT NOT NULL,
            content_type        TEXT NOT NULL,
            url                 TEXT NOT NULL,
            original_name       TEXT NOT NULL,

            description         TEXT,
            s3_url              TEXT,
            signed_url          TEXT,
            signed_url_expires  BIGINT,
            etag                TEXT,
            UNIQUE(name)
        )`);
        console.log(`Created fileTable ${asName(tableName)}`);
    }

    /**
     * 2. Create media lookup tables 
     */
    await Promise.all(Object.keys(referencedTables).map(async refTable => {
      if(!dbo[refTable]) throw `Referenced table (${refTable}) from fileTable.referencedTables is missing`;
      // const lookupTableName = asName(`lookup_${tableName}_${refTable}`);

      const lookupTableName = await this.parseSQLIdentifier(`prostgles_lookup_${tableName}_${refTable}`);
      const pKeyFields = (await (dbo[refTable] as unknown as TableHandler).getColumns()).filter(f => f.is_pkey);

      if(pKeyFields.length !== 1) throw `Could not make link table for ${refTable}. ${pKeyFields} must have exactly one primary key column. Current pkeys: ${pKeyFields.map(f => f.name)}`;

      const pkField = pKeyFields[0];
      const refType = referencedTables[refTable];
      if(!dbo[lookupTableName] || !(await dbo[lookupTableName].count())){
        const action = ` (${tableName} <-> ${refTable}) join table ${lookupTableName}`; //  PRIMARY KEY
        const query = `
        --DROP TABLE IF EXISTS  ${lookupTableName};
        CREATE TABLE ${lookupTableName} (
          foreign_id  ${pkField.udt_name} ${refType === "one"? " PRIMARY KEY " : ""} REFERENCES ${asName(refTable)}(${asName(pkField.name)}),
          media_id    UUID NOT NULL REFERENCES ${asName(tableName)}(id)
        )
      `
        // console.log(`Creating ${action} ...`, lookupTableName);
        await db.any(query);
        console.log(`Created ${action}`);
      } else {
        const cols = await dbo[lookupTableName].getColumns();
        const badCol = cols.find(c => !c.references);
        if(badCol){
          console.error(
            `Prostgles: media ${lookupTableName} joining table has lost a reference constraint for column ${badCol.name}.` + 
            ` This may have been caused by a DROP TABLE ... CASCADE.`
          );
          if(badCol.name === "foreign_id"){
            console.log("Trying to add the missing constraint back");
            try {
              await db.any(
              `
                
                ALTER TABLE ${asName(lookupTableName)} 
                ADD CONSTRAINT ${(lookupTableName+"_foreign_id_r")} FOREIGN KEY (foreign_id)
                REFERENCES ${asName(refTable)}(${asName(pkField.name)})
              `)
              console.log("Added missing constraint back");

            } catch(e){
              console.error("Failed to add missing constraint", e)
            }
          }

        }
      }

      return true;
    }));

    /**
     * 4. Serve media through express
     */
    const { 
      fileUrlPath = `/${tableName}`, 
      expressApp: app 
    } = fileTable;

    this.fileRoute = fileUrlPath;

    if(app){
      app.get(fileUrlPath + "/:name", async (req, res) => {
        if(!dbo[tableName]){
          res.status(500).json({ err: "Internal error: media table not valid" });
          return false;
        }

        const mediaTable = dbo[tableName] as unknown as TableHandler;

        try {

          const { name } = req.params;
          if(typeof name !== "string") throw "Invalid media name";
    
          const media = await mediaTable.findOne({ name }, { select: { id: 1, name: 1, signed_url: 1, signed_url_expires: 1, content_type: 1 } }, { httpReq: req });
    
          if(!media) throw "Invalid media";
          
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
          res.status(404).json({ err: "Invalid media" });
        }
      });
    }
  }
}

const CONTENT_TYPE_TO_EXT = {
  "text/html":                             ["html", "htm", "shtml"],
  "text/css":                              ["css"],
  "text/xml":                              ["xml"],
  "image/gif":                             ["gif"],
  "image/jpeg":                            ["jpeg", "jpg"], 
  "application/x-javascript":              ["js"],
  "application/atom+xml":                  ["atom"],
  "application/rss+xml":                   ["rss"],
  "text/mathml":                           ["mml"],
  "text/plain":                            ["txt"],
  "text/vnd.sun.j2me.app-descriptor":      ["jad"],
  "text/vnd.wap.wml":                      ["wml"],
  "text/x-component":                      ["htc"],
  "image/png":                             ["png"],
  "image/tiff":                            ["tif", "tiff"], 
  "image/vnd.wap.wbmp":                    ["wbmp"],
  "image/x-icon":                          ["ico"],
  "image/x-jng":                           ["jng"],
  "image/x-ms-bmp":                        ["bmp"],
  "image/svg+xml":                         ["svg"],
  "image/webp":                            ["webp"],
  "application/java-archive":              ["jar", "war", "ear"],
  "application/mac-binhex40":              ["hqx"],
  "application/msword":                    ["doc"],
  "application/pdf":                       ["pdf"],
  "application/postscript":                ["ps", "eps", "ai"],
  "application/rtf":                       ["rtf"],
  "application/vnd.ms-excel":              ["xls"],
  "application/vnd.ms-powerpoint":         ["ppt"],
  "application/vnd.wap.wmlc":              ["wmlc"],
  "application/vnd.google-earth.kml+xml":  ["kml"],
  "application/vnd.google-earth.kmz":      ["kmz"],
  "application/x-7z-compressed":           ["7z"],
  "application/x-cocoa":                   ["cco"],
  "application/x-java-archive-diff":       ["jardiff"],
  "application/x-java-jnlp-file":          ["jnlp"],
  "application/x-makeself":                ["run"],
  "application/x-perl":                    ["pl", "pm"], 
  "application/x-pilot":                   ["prc", "pdb"],
  "application/x-rar-compressed":          ["rar"],
  "application/x-redhat-package-manager":  ["rpm"],
  "application/x-sea":                     ["sea"],
  "application/x-shockwave-flash":         ["swf"],
  "application/x-stuffit":                 ["sit"],
  "application/x-tcl":                     ["tcl", "tk"], 
  "application/x-x509-ca-cert":            ["der", "pem", "crt"],
  "application/x-xpinstall":               ["xpi"],
  "application/xhtml+xml":                 ["xhtml"],
  "application/zip":                       ["zip"],
  "application/octet-stream":              ["bin", "exe", "dll", "deb", "dmg", "eot", "iso", "img", "msi", "msp", "msm"],
  "audio/midi":                            ["mid", "midi", "kar"],
  "audio/mpeg":                            ["mp3"],
  "audio/ogg":                             ["ogg"],
  "audio/x-realaudio":                     ["ra"],
  "video/3gpp":                            ["3gpp", "3gp"],
  "video/mpeg":                            ["mpeg", "mpg"], 
  "video/quicktime":                       ["mov"],
  "video/x-flv":                           ["flv"],
  "video/x-mng":                           ["mng"],
  "video/x-ms-asf":                        ["asx", "asf"],
  "video/x-ms-wmv":                        ["wmv"],
  "video/x-msvideo":                       ["avi"],
  "video/mp4":                             ["m4v", "mp4"],
} as const;

export type ALLOWED_CONTENT_TYPE = keyof typeof CONTENT_TYPE_TO_EXT;
export type ALLOWED_EXTENSION = (typeof CONTENT_TYPE_TO_EXT)[ALLOWED_CONTENT_TYPE][number];



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
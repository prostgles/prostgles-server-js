
import { S3 } from 'aws-sdk';
import { ManagedUpload } from 'aws-sdk/clients/s3';
import FileType from "file-type";
import { Prostgles } from './Prostgles';
import { asName, AnyObject } from 'prostgles-types';
import { TableHandler } from './DboBuilder';

const HOUR = 3600 * 60 * 1000;

export type S3Config = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  onUploaded?: () => any;
}

export default class FileManager {
  
  s3Client: S3;
  config: S3Config;

  constructor({ region, bucket, accessKeyId, secretAccessKey, onUploaded }: S3Config){
    this.config = { region, bucket, accessKeyId, secretAccessKey, onUploaded };
    this.s3Client = new S3({ 
      region, 
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  // getURL(fileName: string){
  //   return 'https://' + this.config.bucket + '.s3.' + this.config.region +'.amazonaws.com/' + fileName;
  // }

  async getMIME(file: Buffer | String, fileName: string, allowedExtensions?: string[], dissallowedExtensions?: string[]): Promise<{ mime: string, ext: string, fileName: string }>{
    let type;

    const fParts = fileName.split("."),
      fExt1 = fParts[fParts.length - 1].toLowerCase();

    /* Set correct/missing extension */
    if(["xml", "txt", "csv", "tsv", "doc"].includes(fExt1)){
      type = { mime: "text/" + fExt1, ext: fExt1 };
    } else if(["svg"].includes(fExt1)){
      type = { mime: "image/svg+xml", ext: fExt1 };
    } else if(Buffer.isBuffer(file)){
      type = await FileType.fromBuffer(file);
    } else if(typeof file === "string"){
      type = await FileType.fromFile(file);
    } else {
      throw "Unexpected file. Expecting: Buffer | String";
    }
    if(
      allowedExtensions && 
      allowedExtensions.length && 
      !allowedExtensions.includes(type.ext)
    ){
      throw fileName + " -> File type ( " + type.ext + " ) not allowed. Expecting one of: " + allowedExtensions.join(", ");
    }
    if(
      dissallowedExtensions && 
      dissallowedExtensions.length && 
      dissallowedExtensions.includes(type.ext)
    ){
      throw fileName + " -> File type ( " + type.ext + " ) not allowed";
    }

    
    let { ext } = type;
    if(fExt1 !== ext) fileName = fParts.slice(0, -1).join('') + "." + ext;

    return {
      ...type,
      fileName
    }
  }

  async getUploadURL(fileName: string): Promise<string> {
    const thisHour = new Date();
    thisHour.setMilliseconds(0);
    thisHour.setSeconds(0);
    thisHour.setMinutes(0);
    const now = Date.now();
    const HOUR = 60 * 60;
    const params = {
      Bucket: this.config.bucket, 
      Key: fileName, 
      Expires: Math.round(((now - (+thisHour))/1000 + 2 * HOUR )), // one hour
      ACL: "bucket-owner-full-control", 
      ContentType: "image/png",
    };
    return await this.s3Client.getSignedUrlPromise("putObject", params)
  }
  
  async upload(file: Buffer | String, fileName: string, allowedExtensions?: string[]): Promise<ManagedUpload.SendData> {
    return new Promise(async (resolve, reject) => {
      if(!file){
        throw "No file. Expecting: Buffer | String";
      }
      if(!fileName){
        throw "No fileName. Expecting: String";
      }

      let type = await this.getMIME(file, fileName, allowedExtensions);

      /* S3 Upload */
      const params = {
        Bucket: this.config.bucket, 
        Key: type.fileName,
        // ACL: "public-read", 
        /* ACL needs this permission: 
            "s3:PutObject",
            "s3:PutObjectAcl",
            "s3:GetObject",
            "s3:GetObjectAcl",
          */
        ContentType: type.mime,
        Body: file
      };
      this.s3Client.upload(params, (err, res) => {
        if(err){
          reject("Something went wrong");
          console.error(err)
        } else {
          resolve({ ...res });
        }
      });
    });
  }

  async getFileURL(fileName: string, expires: number = 30 * 60){
    const params = {
      Bucket: this.config.bucket, 
      Key: fileName,
      Expires: expires || 30 * 60
    };
    return await this.s3Client.getSignedUrlPromise("getObject", params);
  }

  init = async (prg: Prostgles) => {
    const { fileTable, dbo, db, auth } = prg;
    const { tableName = "media", referencedTables = {} } = fileTable;
    if(!dbo[tableName]){
        console.log(`Creating fileTable ${asName(tableName)}`);
        await db.any(`CREATE TABLE ${asName(tableName)} (
            id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
            -- user_id             TEXT REFERENCES users(id),
            title               TEXT,
            extension           TEXT NOT NULL,
            content_type        TEXT NOT NULL,
            local_url           TEXT,
            url                 TEXT,
            signed_url          TEXT,
            signed_url_expires  BIGINT,
            name                TEXT,
            original_name       TEXT,
            final_name          TEXT,
            etag                TEXT,
            is_public           BOOLEAN DEFAULT FALSE
        )`);
    }

    await Promise.all(Object.keys(referencedTables).map(async refTable => {
        if(!dbo[refTable]) throw `Referenced table (${refTable}) from fileTable.referencedTables is missing`;
        const lookupTableName = asName(`lookup_${tableName}_${refTable}`);
        const pKeyFields = (await (dbo[refTable] as TableHandler).getColumns()).filter(f => f.is_pkey);
        if(pKeyFields.length !== 1) throw `Could not make link table for ${refTable}. ${pKeyFields} must have exactly one primary key column. Current pkeys: ${pKeyFields.map(f => f.name)}`;
        const pkField = pKeyFields[0];
        const refType = referencedTables[refTable];
        if(!dbo[lookupTableName]){
          await db.any(`
            CREATE TABLE ${lookupTableName} (
              foreign_id  ${pkField.udt_name} ${refType === "one"? "PRIMARY KEY" : ""} REFERENCES ${asName(refTable)}(${asName(pkField.name)})
              media_id    TEXT REFERENCES ${asName(tableName)}(id)
            )
          `);
        }
    }));

    const { fileUrlPath, expressApp: app } = fileTable;
    if(app){
      app.get(fileUrlPath || `/${tableName}/:id`, async (req, res) => {
        if(!dbo[tableName]){
          res.status(403).json({ err: "Internal error: media table not valid" });
          return false;
        }

        const mediaTable = dbo[tableName] as TableHandler;

        try {

          const { id } = req.params;
          if(!id) throw "Invalid media id";
          let filter: AnyObject = { id };
          if(auth && auth.getUser){
            const sid = req?.cookies?.sid;

            /** 
             * Here we actually need to get the user published dbo and query the media table 
             * dbo.mediaTable.findOne({ id })
             * */
            const user: AnyObject = await auth.getUser({ sid }, dbo, db, { httpReq: req });
            const user_id = user?.id || "-1";
  
            filter = {
              $and: [
                // getMediaForcedFilter(user_id),
                { id },
              ]
            };

          }

    
          const media: any = await mediaTable.findOne(filter, { select: { id: 1, name: 1, signed_url: 1, signed_url_expires: 1 } });
    
          // console.log(id, media, JSON.stringify(getMediaForcedFilter(user_id)));
          if(!media) throw "Invalid media";
          
          let url = media.signed_url;
          const expires = media.signed_url_expires;
          const EXPIRES = Date.now() + HOUR;
          if(expires < Date.now() + 0.5 * HOUR){
            url = await this.getFileURL(media.name, 60 * 60);
            await mediaTable.update({ id }, { signed_url: url, signed_url_expires: EXPIRES });
          }

          res.redirect(url);

        } catch(e){
          console.log(e)
          res.status(404).json({ err: "Invalid media" });
        }
      });
    }
  }
}

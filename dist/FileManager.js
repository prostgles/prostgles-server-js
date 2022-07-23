"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileType = exports.getFileTypeFromFilename = exports.asSQLIdentifier = void 0;
const aws_sdk_1 = require("aws-sdk");
const fs = require("fs");
const stream = require("stream");
const sharp = require("sharp");
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("./DboBuilder");
const HOUR = 3600 * 1000;
const asSQLIdentifier = async (name, db) => {
    return (await db.one("select format('%I', $1) as name", [name]))?.name;
};
exports.asSQLIdentifier = asSQLIdentifier;
const aws_sdk_2 = require("aws-sdk");
class FileManager {
    constructor(config, imageOptions) {
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
        this.getFileUrl = (name) => `${this.fileRoute}/${name}`;
        this.uploadStream = (name, mime, onProgress, onError, onEnd) => {
            const passThrough = new stream.PassThrough();
            if (!this.s3Client && "localFolderPath" in this.config) {
                // throw new Error("S3 config missing. Can only upload streams to S3");
                try {
                    const url = this.getFileUrl(name);
                    fs.mkdirSync(this.config.localFolderPath, { recursive: true });
                    const filePath = `${this.config.localFolderPath}/${name}`;
                    const writeStream = fs.createWriteStream(filePath);
                    let errored = false;
                    let loaded = 0;
                    writeStream.on('error', err => {
                        errored = true;
                        onError?.(err);
                    });
                    let lastProgress = Date.now();
                    const throttle = 1000;
                    if (onProgress) {
                        passThrough.on('data', function (chunk) {
                            loaded += chunk.length;
                            const now = Date.now();
                            if (now - lastProgress > throttle) {
                                lastProgress = now;
                                onProgress?.({ loaded, total: 0 });
                            }
                        });
                    }
                    if (onEnd)
                        writeStream.on('finish', () => {
                            if (errored)
                                return;
                            let content_length = 0;
                            try {
                                content_length = fs.statSync(filePath).size;
                                onEnd?.({
                                    url,
                                    etag: `none`,
                                    content_length
                                });
                            }
                            catch (err) {
                                onError?.(err);
                            }
                        });
                    passThrough.pipe(writeStream);
                }
                catch (err) {
                    onError?.(err);
                }
            }
            else {
                this.upload(passThrough, name, mime, onProgress).then(onEnd)
                    .catch(onError);
            }
            return passThrough;
        };
        this.uploadAsMedia = async (params) => {
            const { item, imageOptions } = params;
            const { name, data, content_type } = item;
            if (!data)
                throw "No file provided";
            if (!name || typeof name !== "string")
                throw "Expecting a string name";
            // const type = await this.getMIME(data, name, allowedExtensions, dissallowedExtensions);
            let _data = data;
            if (content_type.startsWith("image")) {
                const compression = imageOptions?.compression;
                if (compression) {
                    console.log("Resizing image");
                    let opts;
                    if ("contain" in compression) {
                        opts = {
                            fit: sharp.fit.contain,
                            ...compression.contain
                        };
                    }
                    else if ("inside" in compression) {
                        opts = {
                            fit: sharp.fit.inside,
                            ...compression.inside
                        };
                    }
                    _data = await sharp(data)
                        .resize(opts)
                        .withMetadata(Boolean(imageOptions?.keepMetadata))
                        // .jpeg({ quality: 80 })
                        .toBuffer();
                }
                else if (!imageOptions?.keepMetadata) {
                    /**
                     * Remove exif
                     */
                    _data = await sharp(data)
                        .clone()
                        .toBuffer();
                }
            }
            const res = await this.upload(_data, name, content_type);
            return res;
        };
        this.parseSQLIdentifier = async (name) => (0, exports.asSQLIdentifier)(name, this.prostgles.db); //  this.prostgles.dbo.sql<"value">("select format('%I', $1)", [name], { returnType: "value" } )
        this.getColInfo = (args) => {
            const { colName, tableName } = args;
            const tableConfig = this.prostgles?.opts.fileTable?.referencedTables?.[tableName];
            const isReferencingFileTable = this.dbo[tableName]?.columns?.some(c => c.name === colName && c.references && c.references?.ftable === this.tableName);
            if (isReferencingFileTable) {
                if (tableConfig && typeof tableConfig !== "string") {
                    return tableConfig.referenceColumns[colName];
                }
                return { acceptedContent: "*" };
            }
            return undefined;
        };
        this.init = async (prg) => {
            this.prostgles = prg;
            // const { dbo, db, opts } = prg;
            const { fileTable } = prg.opts;
            if (!fileTable)
                throw "fileTable missing";
            const { tableName = "media", referencedTables = {} } = fileTable;
            this.tableName = tableName;
            const maxBfSizeMB = (prg.opts.io?.engine?.opts?.maxHttpBufferSize || 1e6) / 1e6;
            console.log(`Prostgles: Initiated file manager. Max allowed file size: ${maxBfSizeMB}MB (maxHttpBufferSize = 1e6). To increase this set maxHttpBufferSize in socket.io server init options`);
            // throw `this.db.tx(d => do everything in a transaction pls!!!!`;
            // throw "Why are constraints dissapearing?"
            /**
             * 1. Create media table
             */
            if (!this.dbo[tableName]) {
                console.log(`Creating fileTable ${(0, prostgles_types_1.asName)(tableName)} ...`);
                await this.db.any(`CREATE EXTENSION IF NOT EXISTS pgcrypto `);
                await this.db.any(`CREATE TABLE IF NOT EXISTS ${(0, prostgles_types_1.asName)(tableName)} (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name                  TEXT NOT NULL,
          extension             TEXT NOT NULL,
          content_type          TEXT NOT NULL,
          content_length        BIGINT NOT NULL DEFAULT 0,
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
                console.log(`Created fileTable ${(0, prostgles_types_1.asName)(tableName)}`);
                await prg.refreshDBO();
            }
            /**
             * 2. Create media lookup tables
             */
            await Promise.all((0, prostgles_types_1.getKeys)(referencedTables).map(async (refTable) => {
                if (!this.dbo[refTable])
                    throw `Referenced table (${refTable}) from fileTable.referencedTables prostgles init config does not exist`;
                const cols = await this.dbo[refTable].getColumns();
                const tableConfig = referencedTables[refTable];
                if (typeof tableConfig !== "string") {
                    for await (const colName of (0, prostgles_types_1.getKeys)(tableConfig.referenceColumns)) {
                        const existingCol = cols.find(c => c.name === colName);
                        if (existingCol) {
                            if (existingCol.references?.ftable === tableName) {
                                // All ok
                            }
                            else {
                                if (existingCol.udt_name === "uuid") {
                                    try {
                                        const query = `ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD CONSTRAINT FOREIGN KEY (${(0, prostgles_types_1.asName)(colName)}) REFERENCES ${(0, prostgles_types_1.asName)(tableName)} (id);`;
                                        console.log(`Referenced file column ${refTable} (${colName}) exists but is not referencing file table. Trying to add REFERENCE constraing...\n${query}`);
                                        await this.db.any(query);
                                        console.log("SUCCESS: " + query);
                                    }
                                    catch (e) {
                                        throw new Error(`Could not add constraing. Err: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
                                    }
                                }
                                else {
                                    throw new Error(`Referenced file column ${refTable} (${colName}) exists but is not of required type (UUID). Choose a different column name or ALTER the existing column to match the type and the data found in file table ${tableName}(id)`);
                                }
                            }
                        }
                        else {
                            try {
                                const query = `ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD COLUMN ${(0, prostgles_types_1.asName)(colName)} UUID REFERENCES ${(0, prostgles_types_1.asName)(tableName)} (id);`;
                                console.log(`Creating referenced file column ${refTable} (${colName})...\n${query}`);
                                await this.db.any(query);
                                console.log("SUCCESS: " + query);
                            }
                            catch (e) {
                                throw new Error(`FAILED. Err: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
                            }
                        }
                    }
                }
                else {
                    const lookupTableName = await this.parseSQLIdentifier(`prostgles_lookup_${tableName}_${refTable}`);
                    const pKeyFields = cols.filter(f => f.is_pkey);
                    if (pKeyFields.length !== 1)
                        throw `Could not make link table for ${refTable}. ${pKeyFields} must have exactly one primary key column. Current pkeys: ${pKeyFields.map(f => f.name)}`;
                    const pkField = pKeyFields[0];
                    const refType = referencedTables[refTable];
                    if (!this.dbo[lookupTableName]) {
                        // if(!(await dbo[lookupTableName].count())) await db.any(`DROP TABLE IF EXISTS  ${lookupTableName};`);
                        const action = ` (${tableName} <-> ${refTable}) join table ${lookupTableName}`; //  PRIMARY KEY
                        const query = `        
          CREATE TABLE ${lookupTableName} (
            foreign_id  ${pkField.udt_name} ${refType === "one" ? " PRIMARY KEY " : ""} REFERENCES ${(0, prostgles_types_1.asName)(refTable)}(${(0, prostgles_types_1.asName)(pkField.name)}),
            media_id    UUID NOT NULL REFERENCES ${(0, prostgles_types_1.asName)(tableName)}(id)
          )
          `;
                        console.log(`Creating ${action} ...`, lookupTableName);
                        await this.db.any(query);
                        console.log(`Created ${action}`);
                    }
                    else {
                        const cols = await this.dbo[lookupTableName].getColumns();
                        const badCols = cols.filter(c => !c.references);
                        await Promise.all(badCols.map(async (badCol) => {
                            console.error(`Prostgles: media ${lookupTableName} joining table has lost a reference constraint for column ${badCol.name}.` +
                                ` This may have been caused by a DROP TABLE ... CASCADE.`);
                            let q = `
              ALTER TABLE ${(0, prostgles_types_1.asName)(lookupTableName)} 
              ADD CONSTRAINT ${(lookupTableName + "_" + badCol.name + "_r")} FOREIGN KEY (${badCol.name})
            `;
                            console.log("Trying to add the missing constraint back");
                            if (badCol.name === "foreign_id") {
                                q += `REFERENCES ${(0, prostgles_types_1.asName)(refTable)}(${(0, prostgles_types_1.asName)(pkField.name)}) `;
                            }
                            else if (badCol.name === "media_id") {
                                q += `REFERENCES ${(0, prostgles_types_1.asName)(tableName)}(id) `;
                            }
                            if (q) {
                                try {
                                    await this.db.any(q);
                                    console.log("Added missing constraint back");
                                }
                                catch (e) {
                                    console.error("Failed to add missing constraint", e);
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
            const { fileServeRoute = `/${tableName}`, expressApp: app } = fileTable;
            if (fileServeRoute.endsWith("/")) {
                throw `fileServeRoute must not end with a '/'`;
            }
            this.fileRoute = fileServeRoute;
            if (app) {
                app.get(this.fileRoute + "/:name", async (req, res) => {
                    if (!this.dbo[tableName]) {
                        res.status(500).json({ err: `Internal error: media table (${tableName}) not valid` });
                        return false;
                    }
                    const mediaTable = this.dbo[tableName];
                    try {
                        const { name } = req.params;
                        if (typeof name !== "string" || !name)
                            throw "Invalid media name";
                        const media = await mediaTable.findOne({ name }, { select: { id: 1, name: 1, signed_url: 1, signed_url_expires: 1, content_type: 1 } }, { httpReq: req });
                        if (!media) {
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
                        if (this.s3Client) {
                            let url = media.signed_url;
                            const expires = +(media.signed_url_expires || 0);
                            const EXPIRES = Date.now() + HOUR;
                            if (!url || expires < EXPIRES) {
                                url = await this.getFileS3URL(media.name, 60 * 60);
                                await mediaTable.update({ name }, { signed_url: url, signed_url_expires: EXPIRES });
                            }
                            res.redirect(url);
                        }
                        else {
                            const pth = `${this.config.localFolderPath}/${media.name}`;
                            if (!fs.existsSync(pth)) {
                                throw new Error("File not found");
                            }
                            res.contentType(media.content_type);
                            res.sendFile(pth);
                        }
                    }
                    catch (e) {
                        console.log(e);
                        res.status(404).json({ err: "Invalid/missing media" });
                    }
                });
            }
        };
        this.config = config;
        this.imageOptions = imageOptions;
        if ("region" in config) {
            const { region, accessKeyId, secretAccessKey } = config;
            this.s3Client = new aws_sdk_1.S3({
                region,
                credentials: { accessKeyId, secretAccessKey },
            });
        }
        const fullConfig = this.prostgles?.opts.fileTable;
        if (fullConfig?.delayedDelete) {
            this.checkInterval = setInterval(async () => {
                const fileTable = fullConfig.tableName;
                const daysDelay = fullConfig.delayedDelete?.deleteAfterNDays ?? 0;
                if (fileTable && this.dbo[fileTable]?.delete && daysDelay) {
                    const filesToDelete = await this.dbo[fileTable]?.find?.({ deleted_from_storage: null, deleted: { ">": Date.now() - (daysDelay * HOUR * 24) } }) ?? [];
                    for await (const file of filesToDelete) {
                        await this.deleteFile(file.name);
                    }
                }
                else {
                    console.error("FileManager checkInterval delayedDelete FAIL: Could not access file table tableHandler.delete()");
                }
            }, Math.max(10000, (fullConfig.delayedDelete.checkIntervalHours || 0) * HOUR));
        }
    }
    get dbo() {
        if (!this.prostgles?.dbo)
            throw "this.prostgles.dbo missing";
        return this.prostgles.dbo;
    }
    ;
    get db() {
        if (!this.prostgles?.db)
            throw "this.prostgles.db missing";
        return this.prostgles.db;
    }
    ;
    async getFileStream(name) {
        if ("bucket" in this.config && this.s3Client) {
            return this.s3Client.getObject({ Key: name, Bucket: this.config.bucket }).createReadStream();
        }
        else if ("localFolderPath" in this.config) {
            const path = `${this.config.localFolderPath}/${name}`;
            if (!fs.existsSync(path)) {
                throw `File ${path} could not be found`;
            }
            return fs.createReadStream(path);
        }
        else
            throw new Error("Not expected");
    }
    async deleteFile(name) {
        if ("bucket" in this.config && this.s3Client) {
            const res = await this.s3Client?.deleteObject({ Bucket: this.config.bucket, Key: name }).promise();
            return res;
        }
        else if ("localFolderPath" in this.config) {
            const path = `${this.config.localFolderPath}/${name}`;
            if (!fs.existsSync(path)) {
                throw `File ${path} could not be found`;
            }
            fs.unlinkSync(path);
            if (fs.existsSync(path))
                throw new Error("Could not delete file");
        }
        return true;
    }
    async parseFile(args) {
        const { file, fileName, tableName, colName } = args;
        const config = this.prostgles?.opts.fileTable;
        if (!config)
            throw new Error("File table config missing");
        const buffer = typeof file === "string" ? Buffer.from(file, 'utf8') : file;
        let result = await (0, exports.getFileTypeFromFilename)(fileName);
        if (tableName && colName) {
            const tableConfig = config.referencedTables?.[tableName];
            if (tableConfig && (0, prostgles_types_1.isObject)(tableConfig) && tableConfig.referenceColumns[colName]) {
                const colConfig = tableConfig.referenceColumns[colName];
                if (colConfig.maxFileSizeMB) {
                    const actualBufferSize = Buffer.byteLength(buffer);
                    if ((actualBufferSize / 1e6) > colConfig.maxFileSizeMB) {
                        throw new Error(`Provided file is larger than the ${colConfig.maxFileSizeMB}MB limit`);
                    }
                }
                if ("acceptedContent" in colConfig && colConfig.acceptedContent && colConfig.acceptedContent !== "*") {
                    const mime = await (0, exports.getFileType)(buffer, fileName);
                    const CONTENTS = [
                        "image",
                        "audio",
                        "video",
                        "text",
                        "application",
                    ];
                    const allowedContent = DboBuilder_1.ViewHandler._parseFieldFilter(colConfig.acceptedContent, false, CONTENTS);
                    if (!allowedContent.some(c => mime.mime.startsWith(c))) {
                        throw new Error(`Dissallowed content type provided: ${mime.mime.split("/")[0]}. Allowed content types: ${allowedContent} `);
                    }
                }
                else if ("acceptedContentType" in colConfig && colConfig.acceptedContentType && colConfig.acceptedContentType !== "*") {
                    const mime = await (0, exports.getFileType)(buffer, fileName);
                    const allowedContentTypes = DboBuilder_1.ViewHandler._parseFieldFilter(colConfig.acceptedContentType, false, (0, prostgles_types_1.getKeys)(prostgles_types_1.CONTENT_TYPE_TO_EXT));
                    if (!allowedContentTypes.some(c => c === mime.mime)) {
                        throw new Error(`Dissallowed MIME provided: ${mime.mime}. Allowed MIME values: ${allowedContentTypes} `);
                    }
                }
                else if ("acceptedFileTypes" in colConfig && colConfig.acceptedFileTypes && colConfig.acceptedFileTypes !== "*") {
                    const mime = await (0, exports.getFileType)(buffer, fileName);
                    const allowedExtensions = DboBuilder_1.ViewHandler._parseFieldFilter(colConfig.acceptedFileTypes, false, Object.values(prostgles_types_1.CONTENT_TYPE_TO_EXT).flat());
                    if (!allowedExtensions.some(c => c === mime.ext)) {
                        throw new Error(`Dissallowed extension provided: ${mime.ext}. Allowed extension values: ${allowedExtensions} `);
                    }
                }
            }
        }
        if (!result?.mime)
            throw `File MIME type not found for the provided extension: ${result?.ext}`;
        return result;
    }
    async upload(file, name, mime, onProgress) {
        return new Promise(async (resolve, reject) => {
            if (!file) {
                throw "No file. Expecting: Buffer | String | stream";
            }
            if (!name) {
                throw "No name. Expecting: String";
            }
            // let type = await this.getMIME(file, name, allowedExtensions);
            const url = this.getFileUrl(name);
            if (!this.s3Client) {
                if (file instanceof stream.PassThrough) {
                    throw new Error("S3 config missing. Can only upload streams to S3");
                }
                const config = this.config;
                try {
                    await fs.promises.mkdir(config.localFolderPath, { recursive: true });
                    const filePath = `${config.localFolderPath}/${name}`;
                    fs.writeFileSync(filePath, file);
                    resolve({
                        url,
                        etag: `none`,
                        content_length: fs.statSync(filePath).size
                    });
                }
                catch (err) {
                    console.error("Error saving file locally", err);
                    reject("Internal error");
                }
            }
            else {
                /* S3 Upload */
                // ACL: "public-read", 
                /* ACL needs this permission:
                    "s3:PutObject",
                    "s3:PutObjectAcl",
                    "s3:GetObject",
                    "s3:GetObjectAcl",
                  */
                const params = {
                    Bucket: this.config.bucket,
                    Key: name,
                    ContentType: mime,
                    Body: file
                };
                let content_length = 0;
                const manager = this.s3Client.upload(params, (err, res) => {
                    if (err) {
                        reject(err.toString());
                        console.error(err);
                    }
                    else {
                        // console.log("Uploaded file:", res)
                        resolve({
                            url,
                            etag: res.ETag,
                            s3_url: res.Location,
                            content_length // await fileMgr.s3Client?.headObject({ Bucket: ..., Key: ... }).promise() ).ContentLength;
                        });
                    }
                });
                manager.on('httpUploadProgress', prog => {
                    content_length = prog.total;
                    onProgress?.(prog);
                });
            }
        });
    }
    async getFileS3URL(fileName, expiresInSeconds = 30 * 60) {
        const params = {
            Bucket: this.config.bucket,
            Key: fileName,
            Expires: expiresInSeconds || 30 * 60
        };
        return await this.s3Client?.getSignedUrlPromise("getObject", params);
    }
}
exports.default = FileManager;
_a = FileManager;
FileManager.testCredentials = async (accessKeyId, secretAccessKey) => {
    const sts = new aws_sdk_2.default.STS();
    aws_sdk_2.default.config.credentials = {
        accessKeyId,
        secretAccessKey
    };
    const ident = await sts.getCallerIdentity({}).promise();
    return ident;
};
const getFileTypeFromFilename = (fileName) => {
    const nameParts = fileName.split(".");
    if (nameParts.length < 2)
        return undefined;
    const nameExt = nameParts[nameParts.length - 1].toLowerCase(), mime = (0, prostgles_types_1.getKeys)(prostgles_types_1.CONTENT_TYPE_TO_EXT).find(k => prostgles_types_1.CONTENT_TYPE_TO_EXT[k].includes(nameExt));
    if (!mime)
        return undefined;
    return {
        mime,
        ext: nameExt,
    };
};
exports.getFileTypeFromFilename = getFileTypeFromFilename;
// const fileType = require("file-type");
// const res = await fileType.fromBuffer(typeof file === "string"? Buffer.from(file, 'utf8') : file);
const getFileType = async (file, fileName) => {
    const { fileTypeFromBuffer } = await eval('import("file-type")');
    const fileNameMime = (0, exports.getFileTypeFromFilename)(fileName);
    if (!fileNameMime?.ext)
        throw new Error("File name must contain extenion");
    const res = await fileTypeFromBuffer(typeof file === "string" ? Buffer.from(file, 'utf8') : file);
    if (!res) {
        /* Set correct/missing extension */
        const nameExt = fileNameMime?.ext;
        if (["xml", "txt", "csv", "tsv", "svg", "sql"].includes(nameExt) && fileNameMime.mime) {
            return fileNameMime;
        }
        throw new Error("Could not get the file type from file buffer");
    }
    else {
        if (!res.ext || fileNameMime?.ext.toLowerCase() !== res.ext.toLowerCase()) {
            throw new Error(`There is a mismatch between file name extension and actual buffer extension: ${fileNameMime?.ext} vs ${res.ext}`);
        }
    }
    return res;
};
exports.getFileType = getFileType;
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
//# sourceMappingURL=FileManager.js.map
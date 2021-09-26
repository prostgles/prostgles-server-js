"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const aws_sdk_1 = require("aws-sdk");
const file_type_1 = require("file-type");
const prostgles_types_1 = require("prostgles-types");
const HOUR = 3600 * 60 * 1000;
class FileManager {
    constructor({ region, bucket, accessKeyId, secretAccessKey, onUploaded }) {
        this.init = (prg) => __awaiter(this, void 0, void 0, function* () {
            this.prostgles = prg;
            const { dbo, db, opts } = prg;
            const { fileTable, auth } = opts;
            const { tableName = "media", referencedTables = {} } = fileTable;
            /**
             * 1. Create media table
             */
            if (!dbo[tableName]) {
                console.log(`Creating fileTable ${prostgles_types_1.asName(tableName)} ...`);
                yield db.any(`CREATE EXTENSION IF NOT EXISTS pgcrypto `);
                yield db.any(`CREATE TABLE ${prostgles_types_1.asName(tableName)} (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
                console.log(`Created fileTable ${prostgles_types_1.asName(tableName)}`);
            }
            /**
             * 2. Create media lookup tables
             */
            yield Promise.all(Object.keys(referencedTables).map((refTable) => __awaiter(this, void 0, void 0, function* () {
                if (!dbo[refTable])
                    throw `Referenced table (${refTable}) from fileTable.referencedTables is missing`;
                // const lookupTableName = asName(`lookup_${tableName}_${refTable}`);
                const lookupTableName = yield dbo.sql("select format('%I', $1)", [`prostgles_lookup_${tableName}_${refTable}`], { returnType: "value" });
                const pKeyFields = (yield dbo[refTable].getColumns()).filter(f => f.is_pkey);
                if (pKeyFields.length !== 1)
                    throw `Could not make link table for ${refTable}. ${pKeyFields} must have exactly one primary key column. Current pkeys: ${pKeyFields.map(f => f.name)}`;
                const pkField = pKeyFields[0];
                const refType = referencedTables[refTable];
                if (!dbo[lookupTableName]) {
                    const action = ` (${tableName} <-> ${refTable}) join table ${lookupTableName}`;
                    const query = `
          CREATE TABLE ${lookupTableName} (
            foreign_id  ${pkField.udt_name} ${refType === "one" ? "PRIMARY KEY" : ""} REFERENCES ${prostgles_types_1.asName(refTable)}(${prostgles_types_1.asName(pkField.name)}),
            media_id    UUID REFERENCES ${prostgles_types_1.asName(tableName)}(id)
          )
        `;
                    console.log(`Creating ${action} ...`, lookupTableName, Object.keys(dbo));
                    yield db.any(query);
                    console.log(`Created ${action}`);
                }
            })));
            /**
             * 4. Serve media through express
             */
            const { fileUrlPath, expressApp: app } = fileTable;
            if (app) {
                app.get(fileUrlPath || `/${tableName}/:id`, (req, res) => __awaiter(this, void 0, void 0, function* () {
                    if (!dbo[tableName]) {
                        res.status(500).json({ err: "Internal error: media table not valid" });
                        return false;
                    }
                    const mediaTable = dbo[tableName];
                    try {
                        const { id } = req.params;
                        if (!id)
                            throw "Invalid media id";
                        // let filter: AnyObject = { id };
                        // if(auth && auth.getUser){
                        //   const sid = req?.cookies?.[auth.sidKeyName];
                        //   /** 
                        //    * get user DBO to validate/auth request
                        //    * */
                        //   const user: AnyObject = await auth.getUser(sid, dbo, db);
                        //   const user_id = user?.id || "-1";
                        //   filter = {
                        //     $and: [
                        //       // getMediaForcedFilter(user_id),
                        //       { id },
                        //     ]
                        //   };
                        // }
                        const media = yield mediaTable.findOne({ id }, { select: { id: 1, name: 1, signed_url: 1, signed_url_expires: 1 } }, { httpReq: req });
                        // console.log(id, media, JSON.stringify(getMediaForcedFilter(user_id)));
                        if (!media)
                            throw "Invalid media";
                        let url = media.signed_url;
                        const expires = media.signed_url_expires;
                        const EXPIRES = Date.now() + HOUR;
                        if (expires < Date.now() + 0.5 * HOUR) {
                            url = yield this.getFileURL(media.name, 60 * 60);
                            yield mediaTable.update({ id }, { signed_url: url, signed_url_expires: EXPIRES });
                        }
                        res.redirect(url);
                    }
                    catch (e) {
                        console.log(e);
                        res.status(404).json({ err: "Invalid media" });
                    }
                }));
            }
        });
        this.config = { region, bucket, accessKeyId, secretAccessKey, onUploaded };
        this.s3Client = new aws_sdk_1.S3({
            region,
            credentials: { accessKeyId, secretAccessKey },
        });
    }
    // getURL(fileName: string){
    //   return 'https://' + this.config.bucket + '.s3.' + this.config.region +'.amazonaws.com/' + fileName;
    // }
    getMIME(file, fileName, allowedExtensions, dissallowedExtensions) {
        return __awaiter(this, void 0, void 0, function* () {
            let type;
            const fParts = fileName.split("."), fExt1 = fParts[fParts.length - 1].toLowerCase();
            /* Set correct/missing extension */
            if (["xml", "txt", "csv", "tsv", "doc"].includes(fExt1)) {
                type = { mime: "text/" + fExt1, ext: fExt1 };
            }
            else if (["svg"].includes(fExt1)) {
                type = { mime: "image/svg+xml", ext: fExt1 };
            }
            else if (Buffer.isBuffer(file)) {
                type = yield file_type_1.default.fromBuffer(file);
            }
            else if (typeof file === "string") {
                type = yield file_type_1.default.fromFile(file);
            }
            else {
                throw "Unexpected file. Expecting: Buffer | String";
            }
            if (allowedExtensions &&
                allowedExtensions.length &&
                !allowedExtensions.includes(type.ext)) {
                throw fileName + " -> File type ( " + type.ext + " ) not allowed. Expecting one of: " + allowedExtensions.join(", ");
            }
            if (dissallowedExtensions &&
                dissallowedExtensions.length &&
                dissallowedExtensions.includes(type.ext)) {
                throw fileName + " -> File type ( " + type.ext + " ) not allowed";
            }
            let { ext } = type;
            if (fExt1 !== ext)
                fileName = fParts.slice(0, -1).join('') + "." + ext;
            return Object.assign(Object.assign({}, type), { fileName });
        });
    }
    getUploadURL(fileName) {
        return __awaiter(this, void 0, void 0, function* () {
            const thisHour = new Date();
            thisHour.setMilliseconds(0);
            thisHour.setSeconds(0);
            thisHour.setMinutes(0);
            const now = Date.now();
            const HOUR = 60 * 60;
            const params = {
                Bucket: this.config.bucket,
                Key: fileName,
                Expires: Math.round(((now - (+thisHour)) / 1000 + 2 * HOUR)),
                ACL: "bucket-owner-full-control",
                ContentType: "image/png",
            };
            return yield this.s3Client.getSignedUrlPromise("putObject", params);
        });
    }
    upload(file, fileName, allowedExtensions) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                if (!file) {
                    throw "No file. Expecting: Buffer | String";
                }
                if (!fileName) {
                    throw "No fileName. Expecting: String";
                }
                let type = yield this.getMIME(file, fileName, allowedExtensions);
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
                    if (err) {
                        reject("Something went wrong");
                        console.error(err);
                    }
                    else {
                        resolve(Object.assign({}, res));
                    }
                });
            }));
        });
    }
    getFileURL(fileName, expires = 30 * 60) {
        return __awaiter(this, void 0, void 0, function* () {
            const params = {
                Bucket: this.config.bucket,
                Key: fileName,
                Expires: expires || 30 * 60
            };
            return yield this.s3Client.getSignedUrlPromise("getObject", params);
        });
    }
}
exports.default = FileManager;
//# sourceMappingURL=FileManager.js.map
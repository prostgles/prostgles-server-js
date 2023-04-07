"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bytesToSize = exports.getFileType = exports.getFileTypeFromFilename = exports.removeExpressRoute = exports.FileManager = exports.asSQLIdentifier = exports.HOUR = void 0;
const aws_sdk_1 = require("aws-sdk");
// import { PutObjectCommand, S3 } from "@aws-sdk/client-s3";
const fs = require("fs");
const sharp = require("sharp");
const check_disk_space_1 = require("check-disk-space");
const prostgles_types_1 = require("prostgles-types");
const aws_sdk_2 = require("aws-sdk");
const path = require("path");
const initFileManager_1 = require("./initFileManager");
const parseFile_1 = require("./parseFile");
const upload_1 = require("./upload");
const uploadStream_1 = require("./uploadStream");
exports.HOUR = 3600 * 1000;
const asSQLIdentifier = async (name, db) => {
    return (await db.one("select format('%I', $1) as name", [name]))?.name;
};
exports.asSQLIdentifier = asSQLIdentifier;
class FileManager {
    static testCredentials = async (accessKeyId, secretAccessKey) => {
        const sts = new aws_sdk_2.default.STS();
        aws_sdk_2.default.config.credentials = {
            accessKeyId,
            secretAccessKey
        };
        const ident = await sts.getCallerIdentity({}).promise();
        return ident;
    };
    s3Client;
    config;
    imageOptions;
    prostgles;
    get dbo() {
        if (!this.prostgles?.dbo) {
            // this.prostgles?.refreshDBO();
            throw "this.prostgles.dbo missing";
        }
        return this.prostgles.dbo;
    }
    get db() {
        if (!this.prostgles?.db)
            throw "this.prostgles.db missing";
        return this.prostgles.db;
    }
    tableName;
    fileRoute;
    get fileRouteExpress() {
        return this.fileRoute + "/:name";
    }
    checkInterval;
    constructor(config, imageOptions) {
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
                    const filesToDelete = await this.dbo[fileTable]?.find?.({ deleted_from_storage: null, deleted: { ">": Date.now() - (daysDelay * exports.HOUR * 24) } }) ?? [];
                    for await (const file of filesToDelete) {
                        await this.deleteFile(file.name);
                    }
                }
                else {
                    console.error("FileManager checkInterval delayedDelete FAIL: Could not access file table tableHandler.delete()");
                }
            }, Math.max(10000, (fullConfig.delayedDelete.checkIntervalHours || 0) * exports.HOUR));
        }
    }
    async getFileStream(name) {
        if ("bucket" in this.config && this.s3Client) {
            return this.s3Client.getObject({ Key: name, Bucket: this.config.bucket }).createReadStream();
        }
        else if ("localFolderPath" in this.config) {
            const filePath = path.resolve(`${this.config.localFolderPath}/${name}`);
            if (!fs.existsSync(filePath)) {
                throw `File ${filePath} could not be found`;
            }
            return fs.createReadStream(filePath, { encoding: undefined });
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
    parseFile = parseFile_1.parseFile.bind(this);
    getLocalFileUrl = (name) => this.fileRoute ? `${this.fileRoute}/${name}` : "";
    checkFreeSpace = async (folderPath, fileSize = 0) => {
        if (!this.s3Client && "localFolderPath" in this.config) {
            const { minFreeBytes = 1.048e6 } = this.config;
            const required = Math.max(fileSize, minFreeBytes);
            if (required) {
                const diskSpace = await (0, check_disk_space_1.default)(folderPath);
                if (diskSpace.free < required) {
                    const err = `There is not enough space on the server to save files.\nTotal: ${bytesToSize(diskSpace.size)} \nRemaning: ${bytesToSize(diskSpace.free)} \nRequired: ${bytesToSize(required)}`;
                    throw new Error(err);
                }
            }
        }
    };
    uploadStream = uploadStream_1.uploadStream.bind(this);
    upload = upload_1.upload.bind(this);
    uploadAsMedia = async (params) => {
        const { item, imageOptions } = params;
        const { name, data, content_type, extension } = item;
        if (!data)
            throw "No file provided";
        if (!name || typeof name !== "string")
            throw "Expecting a string name";
        // const type = await this.getMIME(data, name, allowedExtensions, dissallowedExtensions);
        let _data = data;
        /** Resize/compress/remove exif from photos */
        if (content_type.startsWith("image") && extension.toLowerCase() !== "gif") {
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
                // const metadata = await simg.metadata();
                // const simg = await sharp(data);
                _data = await sharp(data).clone().withMetadata({
                    exif: {}
                })
                    .toBuffer();
            }
        }
        const res = await this.upload(_data, name, content_type);
        return res;
    };
    async getFileS3URL(fileName, expiresInSeconds = 30 * 60) {
        const params = {
            Bucket: this.config.bucket,
            Key: fileName,
            Expires: Math.round(expiresInSeconds || 30 * 60) // Error if float
        };
        return await this.s3Client?.getSignedUrlPromise("getObject", params);
    }
    parseSQLIdentifier = async (name) => (0, exports.asSQLIdentifier)(name, this.prostgles.db); //  this.prostgles.dbo.sql<"value">("select format('%I', $1)", [name], { returnType: "value" } )
    getColInfo = (args) => {
        const { colName, tableName } = args;
        const tableConfig = this.prostgles?.opts.fileTable?.referencedTables?.[tableName];
        const isReferencingFileTable = this.dbo[tableName]?.columns?.some(c => c.name === colName && c.references && c.references?.some(({ ftable }) => ftable === this.tableName));
        if (isReferencingFileTable) {
            if (tableConfig && typeof tableConfig !== "string") {
                return tableConfig.referenceColumns[colName];
            }
            return { acceptedContent: "*" };
        }
        return undefined;
    };
    init = initFileManager_1.initFileManager.bind(this);
    destroy = () => {
        (0, exports.removeExpressRoute)(this.prostgles?.opts.fileTable?.expressApp, [this.fileRouteExpress]);
    };
}
exports.FileManager = FileManager;
const removeExpressRoute = (app, routePaths) => {
    const routes = app?._router?.stack;
    if (routes) {
        routes.forEach((route, i) => {
            if (routePaths.filter(prostgles_types_1.isDefined).includes(route.route?.path)) {
                routes.splice(i, 1);
            }
        });
    }
};
exports.removeExpressRoute = removeExpressRoute;
const getFileTypeFromFilename = (fileName) => {
    const nameParts = fileName.split(".");
    if (nameParts.length < 2)
        return undefined;
    const nameExt = nameParts.at(-1).toLowerCase(), mime = (0, prostgles_types_1.getKeys)(prostgles_types_1.CONTENT_TYPE_TO_EXT).find(k => prostgles_types_1.CONTENT_TYPE_TO_EXT[k].includes(nameExt));
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
function bytesToSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes == 0)
        return '0 Byte';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)) + "");
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}
exports.bytesToSize = bytesToSize;
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
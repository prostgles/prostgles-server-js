"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const stream = require("stream");
const fs = require("fs");
async function upload(file, name, mime, onProgress) {
    return new Promise(async (resolve, reject) => {
        if (!file) {
            throw "No file. Expecting: Buffer | String | stream";
        }
        if (!name) {
            throw "No name. Expecting: String";
        }
        // let type = await this.getMIME(file, name, allowedExtensions);
        const url = this.getLocalFileUrl(name);
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
                // const manager = this.s3Client.send(new PutObjectCommand(params), (err: Error, res) => {
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
exports.upload = upload;
//# sourceMappingURL=upload.js.map
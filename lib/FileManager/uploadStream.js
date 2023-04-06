"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadStream = void 0;
const fs = __importStar(require("fs"));
const stream = __importStar(require("stream"));
const path = __importStar(require("path"));
function uploadStream(name, mime, onProgress, onError, onEnd, expectedSizeBytes) {
    const passThrough = new stream.PassThrough();
    if (!this.s3Client && "localFolderPath" in this.config) {
        // throw new Error("S3 config missing. Can only upload streams to S3");
        try {
            this.checkFreeSpace(this.config.localFolderPath, expectedSizeBytes).catch(err => {
                onError?.(err);
                passThrough.end();
            });
            const url = this.getLocalFileUrl(name);
            fs.mkdirSync(this.config.localFolderPath, { recursive: true });
            const filePath = path.resolve(`${this.config.localFolderPath}/${name}`);
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
            if (onEnd) {
                writeStream.on('finish', () => {
                    if (errored)
                        return;
                    let content_length = 0;
                    try {
                        content_length = fs.statSync(filePath).size;
                        onEnd?.({
                            url,
                            filePath,
                            etag: `none`,
                            content_length
                        });
                    }
                    catch (err) {
                        onError?.(err);
                    }
                });
            }
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
}
exports.uploadStream = uploadStream;

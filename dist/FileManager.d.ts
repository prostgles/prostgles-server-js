/// <reference types="node" />
/// <reference types="node" />
import { S3 } from 'aws-sdk';
import * as stream from 'stream';
import { DB, DBHandlerServer, ExpressApp, Prostgles } from './Prostgles';
import { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION, ValidatedColumnInfo } from 'prostgles-types';
export declare const asSQLIdentifier: (name: string, db: DB) => Promise<string>;
declare type OnProgress = (progress: S3.ManagedUpload.Progress) => void;
export declare type ImageOptions = {
    keepMetadata?: boolean;
    compression?: 
    /**
     * Will resize image maintaing scale ratio
     */
    {
        inside: {
            width: number;
            height: number;
        };
    } | {
        contain: {
            width: number;
        } | {
            height: number;
        };
    };
};
export declare type S3Config = {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
};
export declare type LocalConfig = {
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
};
export declare type UploadItem = {
    name: string;
    content_type: string;
    data: Buffer;
    extension: string;
};
export declare type UploadedItem = {
    /**
     * Url that is passed to client
     */
    url: string;
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
import AWS from 'aws-sdk';
export default class FileManager {
    static testCredentials: (accessKeyId: string, secretAccessKey: string) => Promise<import("aws-sdk/lib/request").PromiseResult<AWS.STS.GetCallerIdentityResponse, AWS.AWSError>>;
    s3Client?: S3;
    config: S3Config | LocalConfig;
    imageOptions?: ImageOptions;
    prostgles?: Prostgles;
    get dbo(): DBHandlerServer;
    get db(): DB;
    tableName?: string;
    private fileRoute?;
    get fileRouteExpress(): string;
    private checkInterval?;
    constructor(config: FileManager["config"], imageOptions?: ImageOptions);
    getFileStream(name: string): Promise<stream.Readable>;
    deleteFile(name: string): Promise<true | import("aws-sdk/lib/request").PromiseResult<S3.DeleteObjectOutput, AWS.AWSError>>;
    parseFile(args: {
        file: Buffer | string;
        fileName: string;
        colName?: string;
        tableName?: string;
    }): Promise<{
        mime: string | ALLOWED_CONTENT_TYPE;
        ext: string | ALLOWED_EXTENSION;
    }>;
    getFileUrl: (name: string) => string;
    checkFreeSpace: (fileSize?: number) => Promise<void>;
    uploadStream: (name: string, mime: string, onProgress?: OnProgress, onError?: ((error: any) => void) | undefined, onEnd?: ((item: UploadedItem) => void) | undefined, expectedSizeBytes?: number) => stream.PassThrough;
    private upload;
    uploadAsMedia: (params: {
        item: UploadItem;
        allowedExtensions?: Array<ALLOWED_EXTENSION>;
        dissallowedExtensions?: Array<ALLOWED_EXTENSION>;
        imageOptions?: ImageOptions;
    }) => Promise<UploadedItem>;
    getFileS3URL(fileName: string, expiresInSeconds?: number): Promise<string | undefined>;
    private parseSQLIdentifier;
    getColInfo: (args: {
        tableName: string;
        colName: string;
    }) => ValidatedColumnInfo["file"] | undefined;
    init: (prg: Prostgles) => Promise<void>;
    destroy: () => void;
}
export declare const removeExpressRoute: (app: ExpressApp | undefined, routePaths: (string | undefined)[]) => void;
export declare const getFileTypeFromFilename: (fileName: string) => {
    mime: ALLOWED_CONTENT_TYPE;
    ext: ALLOWED_EXTENSION | string;
} | undefined;
export declare const getFileType: (file: Buffer | string, fileName: string) => Promise<{
    mime: ALLOWED_CONTENT_TYPE;
    ext: ALLOWED_EXTENSION;
}>;
export declare function bytesToSize(bytes: number): string;
export {};
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
//# sourceMappingURL=FileManager.d.ts.map
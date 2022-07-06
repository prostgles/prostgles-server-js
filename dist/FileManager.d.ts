/// <reference types="node" />
import { S3 } from 'aws-sdk';
import { DB, DBHandlerServer, Prostgles } from './Prostgles';
import { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION, ValidatedColumnInfo } from 'prostgles-types';
export declare const asSQLIdentifier: (name: string, db: DB) => Promise<string>;
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
};
export declare type UploadItem = {
    name: string;
    content_type: string;
    data: Buffer;
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
    constructor(config: FileManager["config"], imageOptions?: ImageOptions);
    parseFile(args: {
        file: Buffer | string;
        fileName: string;
        colName?: string;
        tableName?: string;
    }): Promise<{
        mime: string | ALLOWED_CONTENT_TYPE;
        ext: string | ALLOWED_EXTENSION;
    }>;
    private upload;
    uploadAsMedia: (params: {
        item: UploadItem;
        allowedExtensions?: Array<ALLOWED_EXTENSION>;
        dissallowedExtensions?: Array<ALLOWED_EXTENSION>;
        imageOptions?: ImageOptions;
    }) => Promise<UploadedItem>;
    private getFileURL;
    private parseSQLIdentifier;
    getColInfo: (args: {
        tableName: string;
        colName: string;
    }) => ValidatedColumnInfo["file"] | undefined;
    init: (prg: Prostgles) => Promise<void>;
}
export declare const getFileTypeFromFilename: (fileName: string) => {
    mime: ALLOWED_CONTENT_TYPE;
    ext: ALLOWED_EXTENSION | string;
} | undefined;
export declare const getFileType: (file: Buffer | string, fileName: string) => Promise<{
    mime: ALLOWED_CONTENT_TYPE;
    ext: ALLOWED_EXTENSION;
}>;
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
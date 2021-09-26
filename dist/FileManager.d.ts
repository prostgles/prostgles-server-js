/// <reference types="node" />
import { S3 } from 'aws-sdk';
import { ManagedUpload } from 'aws-sdk/clients/s3';
import { Prostgles } from './Prostgles';
export declare type S3Config = {
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    onUploaded?: () => any;
};
export default class FileManager {
    s3Client: S3;
    config: S3Config;
    prostgles: Prostgles;
    constructor({ region, bucket, accessKeyId, secretAccessKey, onUploaded }: S3Config);
    getMIME(file: Buffer | String, fileName: string, allowedExtensions?: string[], dissallowedExtensions?: string[]): Promise<{
        mime: string;
        ext: string;
        fileName: string;
    }>;
    getUploadURL(fileName: string): Promise<string>;
    upload(file: Buffer | String, fileName: string, allowedExtensions?: string[]): Promise<ManagedUpload.SendData>;
    getFileURL(fileName: string, expires?: number): Promise<string>;
    init: (prg: Prostgles) => Promise<void>;
}
//# sourceMappingURL=FileManager.d.ts.map
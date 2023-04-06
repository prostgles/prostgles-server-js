/// <reference types="node" />
/// <reference types="node" />
import { FileManager, OnProgress, UploadedItem } from "./FileManager";
import * as stream from 'stream';
export declare function upload(this: FileManager, file: Buffer | string | stream.PassThrough, name: string, mime: string, onProgress?: OnProgress): Promise<UploadedItem>;
//# sourceMappingURL=upload.d.ts.map
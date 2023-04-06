/// <reference types="node" />
import { FileManager, OnProgress, UploadedItem } from "./FileManager";
import * as stream from 'stream';
export declare function uploadStream(this: FileManager, name: string, mime: string, onProgress?: OnProgress, onError?: (error: any) => void, onEnd?: (item: UploadedItem) => void, expectedSizeBytes?: number): stream.PassThrough;
//# sourceMappingURL=uploadStream.d.ts.map
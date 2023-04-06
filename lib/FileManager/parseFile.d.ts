/// <reference types="node" />
import { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION } from "prostgles-types";
import { FileManager } from "./FileManager";
type Args = {
    file: Buffer | string;
    fileName: string;
    colName?: string;
    tableName?: string;
};
export declare function parseFile(this: FileManager, args: Args): Promise<{
    mime: string | ALLOWED_CONTENT_TYPE;
    ext: string | ALLOWED_EXTENSION;
}>;
export {};
//# sourceMappingURL=parseFile.d.ts.map
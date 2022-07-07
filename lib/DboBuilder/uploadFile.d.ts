import { AnyObject } from "prostgles-types";
import { LocalParams, Media, TableHandler } from "../DboBuilder";
import { ValidateRow } from "../PublishParser";
export declare const isFile: (row: AnyObject) => boolean;
export declare function uploadFile(this: TableHandler, row: AnyObject, validate: ValidateRow | undefined, localParams: LocalParams | undefined, mediaId?: string): Promise<Media>;
//# sourceMappingURL=uploadFile.d.ts.map
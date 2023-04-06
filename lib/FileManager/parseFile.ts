import { ALLOWED_CONTENT_TYPE, ALLOWED_EXTENSION, CONTENT_TYPE_TO_EXT, getKeys, isObject } from "prostgles-types";
import { ViewHandler } from "../DboBuilder/ViewHandler";
import { FileManager, getFileType, getFileTypeFromFilename } from "./FileManager";

type Args = {
  file: Buffer | string;
  fileName: string;
  colName?: string;
  tableName?: string;
};
export async function parseFile(this: FileManager, args: Args): Promise<{
  mime: string | ALLOWED_CONTENT_TYPE;
  ext: string | ALLOWED_EXTENSION;

  /** File name is not returned because we fail if the extensions do not match */
  // fileName: string;
}> {
  const { file, fileName, tableName, colName } = args;
  const config = this.prostgles?.opts.fileTable;
  if(!config) throw new Error("File table config missing");

  const buffer = typeof file === "string"? Buffer.from(file, 'utf8') : file;

  const result = await getFileTypeFromFilename(fileName);
  if(tableName && colName){
    const tableConfig = config.referencedTables?.[tableName];

    if(tableConfig && isObject(tableConfig) && tableConfig.referenceColumns[colName]){
      const colConfig = tableConfig.referenceColumns[colName]!;
      if(colConfig.maxFileSizeMB){
        const actualBufferSize = Buffer.byteLength(buffer);
        if((actualBufferSize/1e6) > colConfig.maxFileSizeMB){
          throw new Error(`Provided file is larger than the ${colConfig.maxFileSizeMB}MB limit`);
        }
      }
      
      if("acceptedContent" in colConfig && colConfig.acceptedContent && colConfig.acceptedContent !== "*"){
        const mime = await getFileType(buffer, fileName);
        const CONTENTS = [ 
          "image",
          "audio",
          "video",
          "text",
          "application",
        ];
        const allowedContent = ViewHandler._parseFieldFilter(colConfig.acceptedContent, false, CONTENTS);
        if(!allowedContent.some(c => mime.mime.startsWith(c))){
          throw new Error(`Dissallowed content type provided: ${mime.mime.split("/")[0]}. Allowed content types: ${allowedContent} `)
        }
      } else if("acceptedContentType" in colConfig && colConfig.acceptedContentType && colConfig.acceptedContentType !== "*"){
        const mime = await getFileType(buffer, fileName);
        const allowedContentTypes = ViewHandler._parseFieldFilter(colConfig.acceptedContentType, false, getKeys(CONTENT_TYPE_TO_EXT));
        
        if(!allowedContentTypes.some(c => c === mime.mime)){
          throw new Error(`Dissallowed MIME provided: ${mime.mime}. Allowed MIME values: ${allowedContentTypes} `)
        }
      } else if("acceptedFileTypes" in colConfig && colConfig.acceptedFileTypes && colConfig.acceptedFileTypes !== "*"){
        const mime = await getFileType(buffer, fileName);
        const allowedExtensions = ViewHandler._parseFieldFilter(colConfig.acceptedFileTypes, false, Object.values(CONTENT_TYPE_TO_EXT).flat());
        
        if(!allowedExtensions.some(c => c === mime.ext)){
          throw new Error(`Dissallowed extension provided: ${mime.ext}. Allowed extension values: ${allowedExtensions} `)
        }
      }
    } 
  }
  if(!result?.mime) throw `File MIME type not found for the provided extension: ${result?.ext}`;
  return result;
}
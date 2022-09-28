import { AnyObject, getKeys, isObject } from "prostgles-types"
import { LocalParams, Media, TableHandler } from "../DboBuilder";
import { ValidateRow, ValidateUpdateRow } from "../PublishParser";

export const isFile = (row: AnyObject) => {
  return Boolean(row && isObject(row) && getKeys(row).sort().join() === ["name", "data"].sort().join() && row.data && (typeof row.data === "string" || Buffer.isBuffer(row.data)) && typeof row.name === "string")
}

export async function uploadFile(this: TableHandler, row: AnyObject, validate: ValidateRow | undefined, localParams: LocalParams | undefined, mediaId?: string): Promise<Media> {
  if (!this.dboBuilder.prostgles?.fileManager) throw "fileManager not set up";

  if (!isFile(row)) throw "Expecting only two properties for file upload: { name: string; data: File | string | Buffer }; but got: " + getKeys(row).map(k => `${k}: ${typeof data[k]}`).join(", ");
  const { data, name } = row;

  const media_id = mediaId ?? (await this.db.oneOrNone("SELECT gen_random_uuid() as name")).name;
  const nestedInsert = localParams?.nestedInsert;
  const type = await this.dboBuilder.prostgles.fileManager.parseFile({  file: data, fileName: name, tableName: nestedInsert?.previousTable, colName: nestedInsert?.referencingColumn });
  const media_name = `${media_id}.${type.ext}`;
  const parsedMediaKeys = ["id", "name", "original_name", "extension", "content_type"] as const
  let media: Required<Pick<Media, typeof parsedMediaKeys[number]>> = {
    id: media_id,
    name: media_name,
    original_name: name,
    extension: type.ext,
    content_type: type.mime
  }

  if (validate) {
    const parsedMedia = await validate(media, this.dbTX || this.dboBuilder.dbo);
    const missingKeys = parsedMediaKeys.filter(k => !parsedMedia[k])
    if(missingKeys.length){
      throw `Some keys are missing from file insert validation: ${missingKeys}`;
    }
  }

  const _media: Media = await this.dboBuilder.prostgles.fileManager.uploadAsMedia({
    item: {
      data,
      name: media.name ?? "????",
      content_type: media.content_type as any,
      extension: media.extension
    },
    // imageCompression: {
    //     inside: {
    //         width: 1100,
    //         height: 630
    //     }
    // }
  });

  return {
    ...media,
    ..._media,
  };

}
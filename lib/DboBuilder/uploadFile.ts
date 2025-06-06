import { AnyObject, getKeys, isObject } from "prostgles-types";
import { LocalParams, Media } from "./DboBuilder";
import { ValidateRowBasic } from "../PublishParser/PublishParser";
import { TableHandler } from "./TableHandler/TableHandler";

export const isFile = (row: any): row is { data: Buffer; name: string } => {
  return Boolean(
    row &&
      isObject(row) &&
      getKeys(row).sort().join() === ["name", "data"].sort().join() &&
      row.data &&
      (typeof row.data === "string" || Buffer.isBuffer(row.data)) &&
      typeof row.name === "string"
  );
};

type UploadFileArgs = {
  row: AnyObject;
  validate: ValidateRowBasic | undefined;
  localParams: LocalParams | undefined;
  /**
   * Used to update an existing file
   */
  mediaId?: string;
};

export async function uploadFile(
  this: TableHandler,
  { row, localParams, validate, mediaId }: UploadFileArgs
): Promise<Media> {
  if (!this.dboBuilder.prostgles.fileManager) throw "fileManager not set up";

  if (!isFile(row))
    throw (
      "Expecting only two properties for file upload: { name: string; data: File | string | Buffer }; but got: " +
      Object.entries(row)
        .map(([k, v]) => `${k}: ${typeof v}`)
        .join(", ")
    );
  const { data, name } = row;

  const media_id =
    mediaId ?? (await this.db.one<{ name: string }>("SELECT gen_random_uuid() as name")).name;
  const nestedInsert = localParams?.nestedInsert;
  const type = await this.dboBuilder.prostgles.fileManager.getValidatedFileType({
    file: data,
    fileName: name,
    tableName: nestedInsert?.previousTable,
    colName: nestedInsert?.referencingColumn,
  });
  const media_name = `${media_id}.${type.ext}`;
  const parsedMediaKeys = ["id", "name", "original_name", "extension", "content_type"] as const;
  const media: Required<Pick<Media, (typeof parsedMediaKeys)[number]>> = {
    id: media_id,
    name: media_name,
    original_name: name,
    extension: type.ext,
    content_type: type.mime,
  };

  if (validate) {
    if (!localParams) throw "localParams missing";
    const parsedMedia = await validate({
      row: media,
      dbx: this.getFinalDbo(localParams),
      localParams,
    });
    const missingKeys = parsedMediaKeys.filter((k) => !parsedMedia[k]);
    if (missingKeys.length) {
      throw `Some keys are missing from file insert validation: ${missingKeys.join(", ")}`;
    }
  }

  const _media: Media = await this.dboBuilder.prostgles.fileManager.uploadAsMedia({
    item: {
      data,
      name: media.name,
      content_type: media.content_type,
      extension: media.extension,
    },
    // imageCompression: {
    //     inside: {
    //         width: 1100,
    //         height: 630
    //     }
    // }
  });

  const mediaRow = {
    ...media,
    ..._media,
  };

  return mediaRow;
}

import { randomUUID } from "crypto";
import type { AnyObject } from "prostgles-types";
import { getKeys, isObject } from "prostgles-types";
import type { FileTableRow } from "../FileManager/getFileTableConfig";
import { getValidatedFileType } from "../FileManager/getValidatedFileType";
import type { FileTableConfig } from "../ProstglesTypes";
import type { LocalParams } from "./DboBuilder";

export const isFile = (row: any): row is { data: Buffer; name: string } => {
  return Boolean(
    row &&
    isObject(row) &&
    getKeys(row).sort().join() === ["name", "data"].sort().join() &&
    row.data &&
    (typeof row.data === "string" || Buffer.isBuffer(row.data)) &&
    typeof row.name === "string",
  );
};

type UploadFileArgs = {
  row: AnyObject;
  localParams: LocalParams | undefined;
  /**
   * Used to update an existing file
   */
  mediaId: string | undefined;
};

export const uploadFile = async (
  config: FileTableConfig,
  { row, localParams, mediaId }: UploadFileArgs,
): Promise<FileTableRow> => {
  if (!isFile(row)) {
    throw (
      "Expecting only two properties for file upload: { name: string; data: File | string | Buffer }; but got: " +
      Object.entries(row)
        .map(([k, v]) => `${k}: ${typeof v}`)
        .join(", ")
    );
  }
  const storageClient = config.storageClient;
  const { data, name } = row;

  const media_id = mediaId ?? randomUUID();
  const nestedInsert = localParams?.nestedInsert;
  const type = await getValidatedFileType(config, {
    file: data,
    fileName: name,
    tableName: nestedInsert?.previousTable,
    colName: nestedInsert?.referencingColumn,
  });
  const media_name = `${media_id}.${type.ext}`;
  const _parsedMediaKeys = ["id", "name", "original_name", "extension", "content_type"] as const;
  const coreInfo: Required<Pick<FileTableRow, (typeof _parsedMediaKeys)[number]>> = {
    id: media_id,
    name: media_name,
    original_name: name,
    extension: type.ext,
    content_type: type.mime,
  };

  const uploadedInfo = await storageClient.upload({
    file: data,
    fileName: coreInfo.name,
    contentType: coreInfo.content_type,
  });

  const mediaRow: FileTableRow = {
    signed_url: null,
    signed_url_expires: null,
    added: new Date().toISOString(),
    deleted: null,
    deleted_from_storage: null,
    description: "",
    ...coreInfo,
    ...uploadedInfo,
    extension: type.ext,
    url: uploadedInfo.cloud_url,
    content_length: String(uploadedInfo.content_length),
  };

  return mediaRow;
};

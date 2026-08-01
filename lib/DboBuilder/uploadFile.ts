import { randomUUID } from "crypto";
import { assertJSONBObjectAgainstSchema, type JSONB } from "prostgles-types";
import type { FileTableConfig } from "../ProstglesTypes";
import type { FileTableRow } from "../StorageClient/getFileTableConfig";
import { getValidatedFileType } from "../StorageClient/getValidatedFileType";
import { getFileServeRoute } from "../StorageClient/setupFileServeHandler";
import type { LocalParams } from "./DboBuilder";

const FILE_SCHEMA = {
  id: { type: "string", optional: true },
  name: "string",
  data: "Blob",
} as const;

type AssertFileObjectValid = (row: any) => asserts row is JSONB.GetObjectType<typeof FILE_SCHEMA>;

export const assertFileObjectValid: AssertFileObjectValid = (row) => {
  assertJSONBObjectAgainstSchema(FILE_SCHEMA, row, "file insert");
};

type UploadFileArgs = {
  data: Buffer<ArrayBufferLike>;
  name: string;
  localParams: LocalParams | undefined;
  /**
   * Used to update an existing file
   */
  mediaId: string | undefined;
};

export const uploadFile = async (
  config: FileTableConfig,
  { data, name, localParams, mediaId }: UploadFileArgs,
): Promise<FileTableRow> => {
  const storageClient = config.storageClient;

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

  const { contentLength, contentHash } = uploadedInfo;
  const { filePath } = uploadedInfo.type === "local" ? uploadedInfo : {};
  const { url } = uploadedInfo.type === "cloud" ? uploadedInfo : {};

  const fileServeRoute = getFileServeRoute(config);
  const mediaRow: FileTableRow = {
    signed_url: null,
    signed_url_expires: null,
    added: new Date().toISOString(),
    deleted: null,
    deleted_from_storage: null,
    description: "",
    ...coreInfo,
    cloud_url: url ?? "",
    etag: contentHash,
    extension: type.ext,
    url: [fileServeRoute, coreInfo.name].join("/"),
    content_length: String(contentLength),
  };

  return mediaRow;
};

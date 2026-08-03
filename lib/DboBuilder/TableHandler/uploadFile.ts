import { randomUUID } from "crypto";
import { getJSONBObjectSchemaValidationError, type JSONB } from "prostgles-types";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { FileTableRow } from "../../StorageClient/getFileTableConfig";
import { getValidatedFileType } from "../../StorageClient/getValidatedFileType";
import { getFileServeRoute } from "../../StorageClient/setupFileServeHandler";
import type { LocalParams } from "../DboBuilder";

const FILE_SCHEMA = {
  id: { type: "string", optional: true },
  original_name: "string",
  original_last_modified: { type: "string", optional: true },
  data: "Blob",
} as const;

type AssertFileObjectValid = (row: any) => asserts row is JSONB.GetObjectType<typeof FILE_SCHEMA>;

export const assertFileObjectValid: AssertFileObjectValid = (row) => {
  const validation = getJSONBObjectSchemaValidationError(
    FILE_SCHEMA,
    row,
    "file insert",
    undefined,
    {
      allowExtraProperties: false,
    },
  );
  if (validation.error) {
    throw new Error(validation.error);
  }
};

export type UploadFileArgs = {
  data: Buffer<ArrayBufferLike>;
  original_name: string;
  original_last_modified: string | null;
  localParams: LocalParams | undefined;
  /**
   * Used to update an existing file
   */
  mediaId: string | undefined;
};

export const uploadFile = async (
  config: FileTableConfig,
  { data, original_name, original_last_modified, localParams, mediaId }: UploadFileArgs,
): Promise<Omit<FileTableRow, "added"> & Partial<Pick<FileTableRow, "added">>> => {
  const storageClient = config.storageClient;

  const media_id = mediaId ?? randomUUID();
  const nestedInsert = localParams?.nestedInsert;
  const type = await getValidatedFileType(config, {
    file: data,
    fileName: original_name,
    tableName: nestedInsert?.previousTable,
    colName: nestedInsert?.referencingColumn,
  });

  const _parsedMediaKeys = ["id", "original_name", "extension", "content_type"] as const;
  const coreInfo: Required<Pick<FileTableRow, (typeof _parsedMediaKeys)[number]>> = {
    id: media_id,
    original_name,
    extension: type.ext,
    content_type: type.mime,
  };

  const uploadedInfo = await storageClient.upload({
    file: data,
    fileName: coreInfo.id,
    contentType: coreInfo.content_type,
  });

  const { contentLength, contentHash } = uploadedInfo;
  const { filePath } = uploadedInfo.type === "local" ? uploadedInfo : {};
  const { url } = uploadedInfo.type === "cloud" ? uploadedInfo : {};

  const fileServeRoute = getFileServeRoute(config);
  const mediaRow: Omit<FileTableRow, "added"> = {
    signed_url: null,
    signed_url_expires: null,
    updated: new Date().toISOString(),
    deleted: null,
    deleted_from_storage: null,
    description: "",
    ...coreInfo,
    original_last_modified,
    cloud_url: url ?? "",
    etag: contentHash,
    extension: type.ext,
    url: [fileServeRoute, coreInfo.id].join("/"),
    content_length: String(contentLength),
    data: Buffer.from([0x01]),
  };

  const isInsert = !mediaId;

  return isInsert ?
      {
        ...mediaRow,
        added: new Date().toISOString(),
      }
    : mediaRow;
};

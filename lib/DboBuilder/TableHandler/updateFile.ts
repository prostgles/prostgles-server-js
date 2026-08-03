import type { AnyObject } from "prostgles-types";
import { getJSONBObjectSchemaValidationError, omitKeys } from "prostgles-types";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { FileTableRow } from "../../StorageClient/getFileTableConfig";
import type { TableHandler } from "./TableHandler";
import { uploadFile, type UploadFileArgs } from "./uploadFile";

type Args = Pick<
  UploadFileArgs,
  "localParams" | "data" | "original_name" | "original_last_modified"
> & {
  filter: AnyObject;
};
export const updateFile = async (
  tableHandler: TableHandler,
  config: FileTableConfig,
  { filter, data, original_name, original_last_modified, localParams }: Args,
) => {
  const { data: validFilter } = getJSONBObjectSchemaValidationError(
    { id: { optional: true, type: "string" } },
    filter,
    "filter",
    undefined,
    { allowExtraProperties: false },
  );
  const existingMediaId = validFilter?.id;
  if (!existingMediaId) {
    throw new Error(
      `Updating the file table with file data can only be done by providing a single id filter. E.g. { id: "9ea4e23c-2b1a-4e33-8ec0-c15919bb45ec" } `,
    );
  }

  const existingFile = (await tableHandler.findOne({
    id: existingMediaId,
  })) as FileTableRow | undefined;

  if (!existingFile?.id) {
    throw new Error("Existing file record not found");
  }

  await config.storageClient.delete(existingFile.id);
  const newFile = await uploadFile(config, {
    original_name,
    data,
    localParams,
    mediaId: existingFile.id,
    original_last_modified,
  });
  return { newData: omitKeys(newFile, ["id"]) };
};

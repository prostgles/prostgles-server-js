import type { AnyObject } from "prostgles-types";
import { getJSONBObjectSchemaValidationError, omitKeys } from "prostgles-types";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { FileTableRow } from "../../StorageClient/getFileTableConfig";
import type { LocalParams } from "../DboBuilder";
import { uploadFile } from "../uploadFile";
import type { TableHandler } from "./TableHandler";

type Args = {
  data: Buffer<ArrayBufferLike>;
  name: string;
  filter: AnyObject;
  localParams: LocalParams | undefined;
};
export const updateFile = async (
  tableHandler: TableHandler,
  config: FileTableConfig,
  { filter, data, name, localParams }: Args,
) => {
  const { data: validFilter } = getJSONBObjectSchemaValidationError(
    { id: { optional: true, type: "string" } },
    filter,
    "filter",
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

  if (!existingFile?.name) {
    throw new Error("Existing file record not found");
  }

  await config.storageClient.delete(existingFile.name);
  const newFile = await uploadFile(config, {
    name: name,
    data,
    localParams,
    mediaId: existingFile.id,
  });
  return { newData: omitKeys(newFile, ["id"]) };
};

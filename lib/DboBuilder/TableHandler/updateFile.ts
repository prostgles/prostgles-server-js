import type { AnyObject } from "prostgles-types";
import { getJSONBObjectSchemaValidationError, omitKeys } from "prostgles-types";
import type { FileTableRow } from "../../StorageClient/getFileTableConfig";
import type { FileTableConfig } from "../../ProstglesTypes";
import type { LocalParams } from "../DboBuilder";
import { isFile, uploadFile } from "../uploadFile";
import type { TableHandler } from "./TableHandler";

type Args = {
  newData: AnyObject;
  filter: AnyObject;
  localParams: LocalParams | undefined;
};
export const updateFile = async (
  tableHandler: TableHandler,
  config: FileTableConfig,
  { filter, newData, localParams }: Args,
): Promise<{ newData: AnyObject }> => {
  const { data } = getJSONBObjectSchemaValidationError(
    { id: { optional: true, type: "string" } },
    filter,
    "filter",
  );
  const existingMediaId = data?.id;
  if (!existingMediaId) {
    throw new Error(
      `Updating the file table with file data can only be done by providing a single id filter. E.g. { id: "9ea4e23c-2b1a-4e33-8ec0-c15919bb45ec" } `,
    );
  }
  if (!isFile(newData)) {
    throw new Error(
      "Expecting { data: Buffer, name: string } but received " + JSON.stringify(newData),
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
    row: newData,
    localParams,
    mediaId: existingFile.id,
  });
  return { newData: omitKeys(newFile, ["id"]) };
};

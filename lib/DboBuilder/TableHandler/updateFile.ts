import { AnyObject, getJSONBObjectSchemaValidationError, omitKeys } from "prostgles-types";
import { ParsedTableRule, ValidateRowBasic } from "../../PublishParser/PublishParser";
import { LocalParams, Media } from "../DboBuilder";
import { isFile, uploadFile } from "../uploadFile";
import { TableHandler } from "./TableHandler";

type Args = {
  newData: AnyObject;
  filter: AnyObject;
  tableRules: ParsedTableRule | undefined;
  localParams: LocalParams | undefined;
};
export const updateFile = async function (
  this: TableHandler,
  { filter, newData, tableRules, localParams }: Args
): Promise<{ newData: AnyObject }> {
  const rule = tableRules?.update;

  if (tableRules && !tableRules.update) {
    throw "Not allowed";
  }
  if (localParams?.testRule) {
    return { newData: {} };
  }

  const { data } = getJSONBObjectSchemaValidationError(
    { id: { optional: true, type: "string" } },
    filter,
    "filter"
  );
  const existingMediaId = data?.id;
  if (!existingMediaId) {
    throw new Error(
      `Updating the file table with file data can only be done by providing a single id filter. E.g. { id: "9ea4e23c-2b1a-4e33-8ec0-c15919bb45ec" } `
    );
  }
  if (!isFile(newData)) {
    throw new Error(
      "Expecting { data: Buffer, name: string } but received " + JSON.stringify(newData)
    );
  }

  const fileManager = this.dboBuilder.prostgles.fileManager;
  if (!fileManager) throw new Error("fileManager missing");
  if (rule?.validate && !localParams) throw new Error("localParams missing");
  const validate: ValidateRowBasic | undefined =
    rule?.validate ?
      async (row) => {
        return rule.validate!({
          update: row,
          filter,
          dbx: this.tx?.dbTX || this.dboBuilder.dbo,
          localParams: localParams!,
        });
      }
    : undefined;

  const existingFile: Media | undefined = await (
    (localParams?.tx?.dbTX[this.name] as TableHandler | undefined) || this
  ).findOne({ id: existingMediaId });

  if (!existingFile?.name) throw new Error("Existing file record not found");

  await fileManager.deleteFile(existingFile.name);
  const newFile = await uploadFile.bind(this)({
    row: newData,
    validate,
    localParams,
    mediaId: existingFile.id,
  });
  return { newData: omitKeys(newFile, ["id"]) };
};

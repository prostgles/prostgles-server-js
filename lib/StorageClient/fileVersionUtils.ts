import type { TableHandler, TableHandlerForColumns } from "prostgles-types";
import type { TableHandlers } from "../DboBuilder/DboBuilder";
import type { FileTableConfig } from "../ProstglesTypes";
import type {
  FileTableRow,
  FileVersionTableInsertRow,
  FileVersionTableRow,
} from "./fileTableDefinitions";

type FileVersionTableSchema = {
  fileVersions: {
    columns: FileVersionTableRow;
    insertColumns: FileVersionTableInsertRow;
  };
};

export const getFileVersionTableName = (config: FileTableConfig) =>
  config.versioning?.tableName ?? `${config.tableName}_versions`;

export const isFileVersionTable = (
  config: FileTableConfig | undefined,
  tableName: string,
): config is FileTableConfig & { versioning: NonNullable<FileTableConfig["versioning"]> } =>
  Boolean(config?.versioning && getFileVersionTableName(config) === tableName);

export const getFileTableHandler = (dbo: TableHandlers, config: FileTableConfig) => {
  const handler = dbo[config.tableName] as TableHandlerForColumns<FileTableRow> | undefined;
  if (!handler) throw new Error(`File table not found: ${config.tableName}`);
  return handler;
};

export const getFileRevisionsTableHandler = (dbo: TableHandlers, config: FileTableConfig) => {
  const handler = dbo[getFileVersionTableName(config)] as
    TableHandler<FileVersionTableSchema, "fileVersions"> | undefined;
  if (!handler) throw new Error(`File table not found: ${config.tableName}`);
  return handler;
};

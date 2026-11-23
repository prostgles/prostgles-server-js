import type { RawJoinPath } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import { getFileVersionTableName } from "../StorageClient/fileVersionUtils";
import { getJoinsBetween, resolveJoinPath } from "../DboBuilder/ViewHandler/parseJoinPath";
import type { ViewHandler } from "../DboBuilder/ViewHandler/ViewHandler";

export const getFileDerivedTables = (prostgles: Prostgles): FileDerivedTable[] => {
  const config = prostgles.opts.fileTable;
  if (!config || prostgles.preparingTableConfig) return [];
  const versionTableName = config.versioning ? getFileVersionTableName(config) : undefined;
  const sourceTables = [config.tableName, ...(versionTableName ? [versionTableName] : [])];
  const derivedTables: FileDerivedTable[] =
    versionTableName ?
      [
        {
          tableName: versionTableName,
          sourceTableName: config.tableName,
          joinPath: [{ table: config.tableName, on: [{ file_id: "id" }] }],
          isVersion: true,
        },
      ]
    : [];

  for (const entry of config.derivedTables ?? []) {
    const tableName = typeof entry === "string" ? entry : entry.tableName;
    if (
      sourceTables.includes(tableName) ||
      derivedTables.some((table) => table.tableName === tableName)
    ) {
      throw new Error(`Duplicate or reserved file derived table: ${tableName}`);
    }
    const viewHandler = prostgles.dbo?.[tableName];
    if (!viewHandler) {
      throw new Error(`File derived table not found: ${tableName}`);
    }
    const rawPath =
      typeof entry === "string" ? getSourceJoin(viewHandler, sourceTables) : entry.joinPath;
    const joinPath = typeof rawPath === "string" ? [rawPath] : structuredClone(rawPath);
    const resolvedPath = resolveJoinPath({
      rawPath: joinPath,
      rootTable: tableName,
      viewHandler,
      allowMultiOrJoin: "explicit",
    });
    const sourceTableName = resolvedPath.at(-1)?.table;
    if (!sourceTableName || !sourceTables.includes(sourceTableName)) {
      throw new Error(`File derived table ${tableName} must join to a file or revision table`);
    }
    if (resolvedPath.some((part) => part.table === tableName)) {
      throw new Error(`File derived table ${tableName} cannot join to itself`);
    }
    derivedTables.push({
      tableName,
      sourceTableName,
      joinPath,
      isVersion: false,
    });
  }
  return derivedTables;
};

export type FileDerivedTable = {
  tableName: string;
  sourceTableName: string;
  joinPath: Exclude<RawJoinPath, string>;
  isVersion: boolean;
};

const getSourceJoin = (viewHandler: ViewHandler, sourceTables: string[]) => {
  const sources = sourceTables.filter(
    (source) => getJoinsBetween(viewHandler, viewHandler.name, source).length,
  );
  const [source] = sources;
  if (sources.length !== 1 || !source) {
    throw new Error(
      `File derived table ${viewHandler.name} requires an explicit joinPath: source join is missing or ambiguous`,
    );
  }
  return source;
};

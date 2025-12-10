import { getSerialisableError, tryCatchV2 } from "prostgles-types";
import { getFileText, type Prostgles } from "../Prostgles";

export const runSQLFile = async (prostgles: Prostgles) => {
  const {
    db,
    opts: { sqlFilePath, onLog },
  } = prostgles;
  if (!sqlFilePath) return;
  if (!db) throw "db missing";
  const res = await tryCatchV2(async () => {
    const fileContent = await getFileText(sqlFilePath);

    const result = await db.multi(fileContent).catch((err) => {
      const posInfo = getQueryErrorPositionInfo(err, fileContent);
      console.error("Prostgles: Error running SQL file ", sqlFilePath, posInfo);
      return Promise.reject(err);
    });
    return { success: result.length };
  });

  await onLog?.({ type: "debug", command: "runSQLFile", ...res });
  if (res.error !== undefined) {
    throw res.error;
  } else {
    console.log("Prostgles: SQL file executed successfuly ", sqlFilePath);
  }
  return res.data?.success;
};

/**
 * Given an sql error, return the lines of the query that caused the error.
 */
export const getQueryErrorPositionInfo = (err: any, _fileContent?: string): string | undefined => {
  const { position, length, query, internalPosition, internalQuery } = err as {
      position: number;
      length: number;
      query: string;
      internalPosition?: string;
      internalQuery?: string;
    },
    fileContent = _fileContent || query,
    lines = fileContent.split("\n");

  if (position && length && fileContent) {
    const startLine = Math.max(0, fileContent.substring(0, position).split("\n").length - 2),
      endLine = startLine + 3;

    return lines
      .slice(startLine, endLine)
      .map((txt, i) => `${startLine + i + 1} ${i === 1 ? "->" : "  "} ${txt}`)
      .join("\n");
  }

  if (internalPosition && internalQuery) {
    return getQueryErrorPositionInfo({
      query: internalQuery,
      position: parseInt(internalPosition),
      length: internalQuery.length,
    });
  }

  try {
    return JSON.stringify(getSerialisableError(err));
  } catch {}
};

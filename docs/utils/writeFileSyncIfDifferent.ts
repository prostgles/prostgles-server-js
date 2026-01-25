import { readFileSync, writeFileSync } from "fs";

export const writeFileSyncIfDifferent = (filePath: string, content: string) => {
  let existingContent: string | null = null;
  try {
    existingContent = readFileSync(filePath, { encoding: "utf-8" });
  } catch (err) {
    // File does not exist
  }
  if (existingContent !== content) {
    writeFileSync(filePath, content, { encoding: "utf-8" });
  }
};

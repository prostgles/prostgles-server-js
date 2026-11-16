import { createHash } from "node:crypto";
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isObject } from "prostgles-types";
import type { TableConfigMigration } from "../ProstglesTypes";
import { getNumberedMigrations } from "./getNumberedMigrations";

/**
 * Load compiled .js/.cjs/.mjs migration files exporting a default OnMigrate callback.
 * Example: tableConfigMigrations: { migrations: await loadTableConfigMigrations(path.join(__dirname, "migrations")) }.
 * Fresh databases baseline all files. Existing databases without numbered history require baseline.
 * Keep applied files and their imported migration helpers immutable across builds.
 * Restart the process before reloading changed files.
 */
export const loadTableConfigMigrations = async (
  directory: string,
): Promise<TableConfigMigration[]> => {
  const files = await readdir(directory, { withFileTypes: true });
  const migrations = await Promise.all(
    files
      .filter((file) => file.isFile() && [".js", ".cjs", ".mjs"].includes(path.extname(file.name)))
      .map(async ({ name }) => {
        const filename = await realpath(path.resolve(directory, name));
        const checksum = createHash("sha256")
          .update(await readFile(filename))
          .digest("hex");
        const importedChecksum = importedMigrationChecksums.get(filename);
        if (importedChecksum && importedChecksum !== checksum) {
          throw new Error(
            `Migration ${name} changed after loading; restart the process to reload it`,
          );
        }
        importedMigrationChecksums.set(filename, checksum);
        const imported: unknown = await import(pathToFileURL(filename).href);
        const exported: unknown = isObject(imported) ? imported.default : undefined;
        const run: unknown = isObject(exported) ? exported.default : exported;
        if (typeof run !== "function") {
          throw new Error(`Migration ${name} must export a default callback`);
        }
        return { name, checksum, run: run as TableConfigMigration["run"] };
      }),
  );
  return getNumberedMigrations(migrations).map(({ migration }) => migration);
};

const importedMigrationChecksums = new Map<string, string>();

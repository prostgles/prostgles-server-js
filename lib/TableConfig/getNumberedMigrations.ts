import type { TableConfigMigration } from "../ProstglesTypes";

export const getNumberedMigrations = (migrations: readonly TableConfigMigration[]) => {
  const versions = new Set<number>();
  return migrations
    .map((migration) => {
      const prefix = migration.name.split("_")[0] ?? "";
      const version = Number(prefix);
      if (
        !/^\d+$/.test(prefix) ||
        !migration.name.includes("_") ||
        !Number.isSafeInteger(version) ||
        version < 1
      ) {
        throw new Error(`Invalid numbered migration filename: ${migration.name}`);
      }
      if (versions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
      if (!migration.checksum || typeof migration.run !== "function") {
        throw new Error(`Migration ${migration.name} requires a checksum and callback`);
      }
      versions.add(version);
      return { version, migration };
    })
    .sort((a, b) => a.version - b.version);
};

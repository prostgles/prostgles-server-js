import type { DB } from "../Prostgles";
import type { FileTableConfig } from "../ProstglesTypes";

export const deleteUnreferencedFile = async (
  db: DB,
  config: FileTableConfig,
  storageKey: string,
) => {
  // A failed COMMIT response does not prove rollback. Check committed state first.
  // Fail closed if RLS would hide a reference or the database is unavailable.
  const referenced = await db.tx(async (tx) => {
    await tx.none("SET LOCAL row_security = off");
    return tx.oneOrNone<{ found: number }>(
      "SELECT 1 FROM ${table:name} WHERE storage_key = ${key}::uuid OR (storage_key IS NULL AND id = ${key}::uuid) LIMIT 1",
      { table: config.tableName, key: storageKey },
    );
  });
  if (!referenced) await config.storageClient.delete(storageKey);
};

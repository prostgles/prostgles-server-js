import type { DB } from "../Prostgles";
import type { FileTableConfig } from "../ProstglesTypes";
import { getFileVersionTableName } from "./fileVersionUtils";

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
      `SELECT 1 AS found
       WHERE EXISTS (
         SELECT 1 FROM \${fileTable:name}
         WHERE storage_key = \${key}::uuid OR (storage_key IS NULL AND id = \${key}::uuid)
       )
       ${
         config.versioning ?
           `OR EXISTS (
             SELECT 1 FROM \${versionTable:name}
             WHERE storage_key = \${key}::uuid
           )`
         : ""
       }
       LIMIT 1`,
      {
        fileTable: config.tableName,
        versionTable: getFileVersionTableName(config),
        key: storageKey,
      },
    );
  });
  if (!referenced) await config.storageClient.delete(storageKey);
};

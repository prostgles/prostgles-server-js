import type { PubSubManager } from "./PubSubManager";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "./PubSubManagerUtils";

export async function deleteOrphanedTriggers(this: PubSubManager, tableNames: string[]) {
  const activeListeners = this.getActiveListeners();
  /* Disabling triggers locks the table. Commit each deletion before locking another table. */
  for (const tableName of tableNames) {
    const activeConditions = activeListeners
      .filter((listener) => listener.table_name === tableName)
      .map((listener) => listener.condition);
    try {
      await this.db.none(
        `
        /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        DELETE FROM prostgles.app_triggers
        WHERE app_id = $1 AND table_name = $2 AND condition <> ALL($3::text[])
        `,
        [this.appId, tableName, activeConditions],
      );
    } catch (error) {
      console.error("Error deleting orphaned triggers", tableName, error);
    }
  }
  await this.refreshTriggers().catch((error) => console.error("Error refreshing triggers", error));
}

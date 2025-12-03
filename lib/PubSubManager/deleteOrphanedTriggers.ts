import type { PubSubManager } from "./PubSubManager";
import { asValue, EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID, log } from "./PubSubManagerUtils";

export function deleteOrphanedTriggers(this: PubSubManager, tableNames: string[]) {
  const conditions = tableNames.map((tableName) => {
    const activeTriggers = this.getActiveTriggers(tableName);
    const activeConditionHashes = activeTriggers.map((c) => c.hash);
    return `(at.table_name = ${asValue(tableName)} ${activeConditionHashes.length ? `AND at.condition_hash NOT IN (${asValue(activeConditionHashes, ":csv")})` : ""})`;
  });

  // log("deleteOrphanedTriggers", { appId: this.appId, conditions });
  return this.db
    .any(
      `
        /* Delete removed subscriptions */
        /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        DELETE FROM prostgles.app_triggers at
        WHERE at.app_id = \${appId}
        AND ( ${conditions.join(" OR ")} )
        --RETURNING *
        `,
      { appId: this.appId }
    )
    .then(async (_rows) => {
      // log("Orphaned triggers deleted", _rows.length);
      // const wtf = await this.db.any(
      //   `SELECT * FROM prostgles.app_triggers WHERE app_id = \${appId}`,
      //   { appId: this.appId }
      // );
      // log("Current app_triggers", wtf);
      return this.refreshTriggers();
    })
    .catch((e) => {
      console.error("Error deleting orphaned triggers", e);
    });
}

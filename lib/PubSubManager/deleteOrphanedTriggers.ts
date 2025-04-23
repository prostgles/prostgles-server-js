import { PubSubManager } from "./PubSubManager";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "./PubSubManagerUtils";

export function deleteOrphanedTriggers(this: PubSubManager, tableName: string) {
  const activeConditions = (this.getTriggerInfo(tableName) ?? []).filter(
    (c) => c.subs.length || c.syncs.length
  );

  const activeConditionHashes = activeConditions.map((c) => c.hash);
  this.db
    .any(
      `
        /* Delete removed subscriptions */
        /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        DELETE FROM prostgles.app_triggers at
        WHERE EXISTS (
          SELECT 1
          FROM prostgles.v_triggers t
          WHERE t.table_name = $1  
          ${activeConditionHashes.length ? "AND t.condition_hash NOT IN ($2:csv)" : ""}
          AND t.app_id = $3
          AND at.app_id = t.app_id
          AND at.table_name = t.table_name
          AND at.condition = t.condition
        ) 
        `,
      [tableName, activeConditionHashes, this.appId]
    )
    .then(() => {
      return this.refreshTriggers();
    })
    .catch((e) => {
      console.error("Error deleting orphaned triggers", e);
    });
}

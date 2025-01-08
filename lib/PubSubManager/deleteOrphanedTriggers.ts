import { PubSubManager } from "./PubSubManager";

export async function deleteOrphanedTriggers(this: PubSubManager, tableName: string) {
  const activeConditions = (this.getTriggerInfo(tableName) ?? []).filter(
    (c) => c.subs.length || c.syncs.length
  );

  this.db
    .any(
      `
        /* Delete removed subscriptions */
        /* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
        DELETE FROM prostgles.app_triggers at
        WHERE EXISTS (
          SELECT 1
          FROM prostgles.v_triggers t
          WHERE t.table_name = $1  
          AND t.condition_hash NOT IN ($2:csv)
          AND t.app_id = $3
          AND at.app_id = t.app_id
          AND at.table_name = t.table_name
          AND at.condition = t.condition
        ) 
        `,
      [tableName, activeConditions.map((c) => c.hash), this.appId]
    )
    .then(() => {
      return this.refreshTriggers();
    })
    .catch((e) => {
      console.error("Error deleting orphaned triggers", e);
    });
}

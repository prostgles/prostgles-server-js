import { PubSubManager } from "./PubSubManager";

export async function deleteOrphanedTriggers(this: PubSubManager, tableName: string) {
  const activeConditions = (this._triggers?.[tableName] ?? []).map((t) => t.hash);
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
         --AND t.c_id IN ($2:csv) 
          AND t.app_id = $3
          AND at.app_id = t.app_id
          AND at.table_name = t.table_name
          --AND at.condition = t.condition
          AND at.condition_hash NOT IN ($2:csv) 
        ) 
        `,
      [tableName, activeConditions, this.appId]
    )
    .then(() => {
      return this.refreshTriggers();
    })
    .catch((e) => {
      console.error("Error deleting orphaned triggers", e);
    });
}

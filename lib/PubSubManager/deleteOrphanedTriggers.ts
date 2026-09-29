import type { PubSubManager } from "./PubSubManager";
import { asValue, EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "./PubSubManagerUtils";

export function deleteOrphanedTriggers(this: PubSubManager, tableNames: string[]) {
  const activeListeners = this.getActiveListeners();
  const conditions = tableNames.map((tableName) => {
    const activeConditions = activeListeners
      .filter((listener) => listener.table_name === tableName)
      .map((listener) => listener.condition);
    return `(at.table_name = ${asValue(tableName)} ${activeConditions.length ? `AND at.condition NOT IN (${asValue(activeConditions, ":csv")})` : ""})`;
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
      { appId: this.appId },
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

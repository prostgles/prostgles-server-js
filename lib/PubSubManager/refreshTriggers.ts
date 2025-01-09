import type { PubSubManager } from "./PubSubManager";

export async function refreshTriggers(this: PubSubManager) {
  const start = Date.now();
  const triggers: {
    table_name: string;
    condition: string;
    condition_hash: string;
  }[] = await this.db.any(
    `
        SELECT *
        FROM prostgles.v_triggers
        WHERE app_id = $1
        ORDER BY table_name, condition
      `,
    [this.dboBuilder.prostgles.appId]
  );

  const oldTriggers = { ...this._triggers };

  this._triggers = {};
  triggers.map((t) => {
    this._triggers[t.table_name] ??= [];
    if (!this._triggers[t.table_name]?.map((t) => t.condition).includes(t.condition)) {
      this._triggers[t.table_name]?.push({ condition: t.condition, hash: t.condition_hash });
    }
  });

  await this._log({
    type: "syncOrSub",
    command: "refreshTriggers",
    duration: Date.now() - start,
    connectedSocketIds: this.connectedSocketIds,
    triggers: this._triggers,
    oldTriggers,
  });
}

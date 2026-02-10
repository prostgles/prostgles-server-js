import type { PubSubManager } from "./PubSubManager";

export async function refreshTriggers(this: PubSubManager) {
  const start = Date.now();
  const triggers = await this.db.any<{
    table_name: string;
    condition: string;
    condition_hash: string;
  }>(
    `
        SELECT *
        FROM prostgles.v_triggers
        WHERE app_id = $1
        ORDER BY table_name, condition
      `,
    [this.dboBuilder.prostgles.appId],
  );

  const oldTriggers = new Map(this._triggers);

  this._triggers = new Map();
  triggers.map((t) => {
    this._triggers.set(t.table_name, this._triggers.get(t.table_name) ?? []);
    const tableTriggers = this._triggers.get(t.table_name)!;
    if (!tableTriggers.map((t) => t.condition).includes(t.condition)) {
      tableTriggers.push({ condition: t.condition, hash: t.condition_hash });
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

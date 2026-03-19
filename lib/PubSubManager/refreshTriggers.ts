import type { PubSubManager, TableTriggerInfo } from "./PubSubManager";

export async function refreshTriggers(this: PubSubManager) {
  const start = Date.now();
  const triggers = await this.db.any<{
    table_name: string;
    table_condition_id: string;
    condition: string;
    condition_hash: string;
    columns_info: TableTriggerInfo["columnInfo"];
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

  triggers.forEach((t) => {
    this._triggers.set(
      t.table_name,
      this._triggers.get(t.table_name) ?? new Map<number, TableTriggerInfo>(),
    );
    const tableTriggers = this._triggers.get(t.table_name)!;
    const table_condition_id = Number(t.table_condition_id);
    tableTriggers.set(table_condition_id, {
      condition: t.condition,
      hash: t.condition_hash,
      columnInfo: t.columns_info,
      table_condition_id,
    });
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

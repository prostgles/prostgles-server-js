import { tryCatchV2 } from "prostgles-types";
import { type PubSubManager, ViewSubscriptionOptions } from "./PubSubManager";
import * as crypto from "crypto";
import { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import { asValue, EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "./PubSubManagerUtils";

export async function addTrigger(
  this: PubSubManager,
  params: { table_name: string; condition: string },
  viewOptions: ViewSubscriptionOptions | undefined,
  socket: PRGLIOSocket | undefined
) {
  const addedTrigger = await tryCatchV2(async () => {
    const { table_name } = { ...params };
    let { condition } = { ...params };
    if (!table_name) throw "MISSING table_name";

    if (!condition || !condition.trim().length) {
      condition = "TRUE";
    }

    if (this.dbo[table_name]?.tableOrViewInfo?.isHyperTable) {
      throw "Triggers do not work on timescaledb hypertables due to bug:\nhttps://github.com/timescale/timescaledb/issues/1084";
    }

    const trgVals = {
      tbl: asValue(table_name),
      cond: asValue(condition),
      condHash: asValue(crypto.createHash("md5").update(condition).digest("hex")),
    };

    await this.db.tx((t) =>
      t.any(`
      BEGIN WORK;
      /* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
      /* why is this lock level needed? */
      --LOCK TABLE prostgles.app_triggers IN ACCESS EXCLUSIVE MODE;

      /** app_triggers is not refreshed when tables are dropped */
      DELETE FROM prostgles.app_triggers at
      WHERE app_id = ${asValue(this.appId)} 
      AND NOT EXISTS (
        SELECT 1  
        FROM pg_catalog.pg_trigger t
        WHERE tgname like format('prostgles_triggers_%s_', at.table_name) || '%'
        AND tgenabled = 'O'
      );

      INSERT INTO prostgles.app_triggers (
        table_name, 
        condition, 
        condition_hash, 
        app_id, 
        related_view_name, 
        related_view_def
      ) 
      VALUES (
        ${trgVals.tbl}, 
        ${trgVals.cond},
        ${trgVals.condHash},
        ${asValue(this.appId)}, 
        ${asValue(viewOptions?.viewName ?? null)}, 
        ${asValue(viewOptions?.definition ?? null)}
      )
      ON CONFLICT DO NOTHING;

      COMMIT WORK;
    `)
    );

    /** This might be redundant due to trigger on app_triggers */
    await this.refreshTriggers();

    return trgVals;
  });

  await this._log({
    type: "syncOrSub",
    command: "addTrigger",
    condition: addedTrigger.data?.cond ?? params.condition,
    duration: addedTrigger.duration,
    socketId: socket?.id,
    state: !addedTrigger.data?.tbl ? "fail" : "ok",
    error: addedTrigger.error,
    sid: socket && this.dboBuilder.prostgles.authHandler?.getSIDNoError({ socket }),
    tableName: addedTrigger.data?.tbl ?? params.table_name,
    connectedSocketIds: this.dboBuilder.prostgles.connectedSockets.map((s) => s.id),
    localParams: socket && { clientReq: { socket } },
    triggers: this._triggers,
  });

  if (addedTrigger.error) throw addedTrigger.error;

  return addedTrigger;
}

import { asName, pickKeys, tryCatchV2 } from "prostgles-types";
import type { ViewSubscriptionOptions } from "./PubSubManager";
import { type PubSubManager } from "./PubSubManager";
import * as crypto from "crypto";
import type { PRGLIOSocket } from "../DboBuilder/DboBuilderTypes";
import { asValue, EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID } from "./PubSubManagerUtils";
import { udtNamesWithoutEqualityComparison } from "./init/getDataWatchFunctionQuery";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";

export type AddTriggerParams = {
  table_name: string;
  condition: string;
  tracked_columns: string[] | undefined;
};
export async function addTrigger(
  this: PubSubManager,
  params: AddTriggerParams,
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

    const tableHandler = this.dbo[table_name];
    if (!tableHandler) {
      throw `Cannot add trigger. Tablehandler for ${table_name} not found`;
    }

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
        related_view_def,
        columns_info
      ) 
      VALUES (
        ${trgVals.tbl}, 
        ${trgVals.cond},
        ${trgVals.condHash},
        ${asValue(this.appId)}, 
        ${asValue(viewOptions?.viewName ?? null)}, 
        ${asValue(viewOptions?.definition ?? null)},
        ${asValue(getColumnsInfo(params, tableHandler))}
      )
      ON CONFLICT (app_id, table_name, condition_hash)
      DO UPDATE  /* upsert tracked_columns where necessary */
        SET columns_info = CASE WHEN EXCLUDED.columns_info IS NOT NULL THEN 
          jsonb_set(
            prostgles.app_triggers.columns_info, 
            '{tracked_columns}', 
            prostgles.app_triggers.columns_info->'tracked_columns' || EXCLUDED.columns_info->'tracked_columns'
          ) 
        END 
      WHERE prostgles.app_triggers.columns_info IS NOT NULL
      ;

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
    sid: socket && this.dboBuilder.prostgles.authHandler.getSIDNoError({ socket }),
    tableName: addedTrigger.data?.tbl ?? params.table_name,
    connectedSocketIds: this.dboBuilder.prostgles.connectedSockets.map((s) => s.id),
    localParams: socket && { clientReq: { socket } },
    triggers: this._triggers,
  });

  if (addedTrigger.error) throw addedTrigger.error;

  return addedTrigger;
}

const getColumnsInfo = (
  { tracked_columns, table_name }: AddTriggerParams,
  tableHandler: Partial<TableHandler>
) => {
  let hasPkey = false as boolean;
  const cols = tableHandler.columns?.map((c) => {
    hasPkey = hasPkey || c.is_pkey;
    return {
      ...pickKeys(c, ["name", "is_pkey"]),
      cast_to: udtNamesWithoutEqualityComparison.includes(c.udt_name) ? "::TEXT" : "",
    };
  });
  tracked_columns?.forEach((colName) => {
    if (!cols?.some((c) => c.name === colName)) {
      throw `tracked_columns ${colName} not found in table ${table_name}`;
    }
  });
  /**
   * TODO: finish tracked_columns by trigger condition
   */
  const columns_info =
    !hasPkey || !cols || !tracked_columns?.length || tracked_columns.length === cols.length ?
      null
    : {
        join_condition: cols
          .filter((c) => c.is_pkey)
          .map((c) => `n.${asName(c.name)} = o.${asName(c.name)}`)
          .join(" AND "),
        tracked_columns: cols.reduce(
          (acc, { name }) => ({
            ...acc,
            [name]: 1,
          }),
          {} as Record<string, number>
        ),
        where_statement: cols
          // .filter((c) => !c.is_pkey && tracked_columns.includes(c.name))
          .map(
            (c) =>
              `column_name = ${asValue(c.name)} AND (ROW(n.*) IS NULL OR n.${asName(c.name)}${c.cast_to} IS DISTINCT FROM o.${asName(c.name)}${c.cast_to})`
          )
          .join(" OR \n"),
      };

  return columns_info;
};

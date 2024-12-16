import { log, NOTIF_TYPE, pickKeys, PubSubManager } from "./PubSubManager";

/* Relay relevant data to relevant subscriptions */
export async function notifListener(
  this: PubSubManager,
  data: { payload: string },
) {
  const str = data.payload;

  if (!str) {
    console.error("Unexpected Empty notif");
    return;
  }

  const dataArr = str.split(PubSubManager.DELIMITER);
  const notifType = dataArr[0];

  log(str);

  if (notifType === NOTIF_TYPE.schema) {
    if (this.dboBuilder.prostgles.schemaWatch?.onSchemaChange) {
      const [_, command, _event_type, query] = dataArr;
      await this.dboBuilder.prostgles.opts.onLog?.({
        type: "debug",
        command: "schemaChangeNotif",
        duration: 0,
        data: { command, query },
      });

      if (query && command) {
        this.dboBuilder.prostgles.schemaWatch.onSchemaChange({
          command,
          query,
        });
      }
    }

    return;
  } else if (notifType === NOTIF_TYPE.data_trigger_change) {
    await this.refreshTriggers();
    return;
  }

  if (notifType !== NOTIF_TYPE.data) {
    console.error("Unexpected notif type: ", notifType);
    return;
  }

  if (dataArr.length < 3) {
    throw "notifListener: dataArr length < 3";
  }

  const [_, table_name, op_name, condition_ids_str] = dataArr;
  const condition_ids = condition_ids_str?.split(",").map((v) => +v);

  if (!table_name) {
    throw "table_name undef";
  }

  const tableTriggerConditions = this._triggers?.[table_name]?.map(
    (condition, idx) => ({
      idx,
      condition,
      subs: this.getTriggerSubs(table_name, condition),
      syncs: this.getSyncs(table_name, condition),
    }),
  );
  let state: "error" | "no-triggers" | "ok" | "invalid_condition_ids" = "ok";

  // const triggers = await this.db.any("SELECT * FROM prostgles.triggers WHERE table_name = $1 AND id IN ($2:csv)", [table_name, condition_ids_str.split(",").map(v => +v)]);
  // const conditions: string[] = triggers.map(t => t.condition);

  if (!tableTriggerConditions?.length) {
    state = "no-triggers";

    /* Trigger error */
  } else if (condition_ids_str?.startsWith("error")) {
    state = "error";
    const pref = "INTERNAL ERROR";
    console.error(`${pref}: condition_ids_str: ${condition_ids_str}`);
    tableTriggerConditions.map(({ condition }) => {
      const subs = this.getTriggerSubs(table_name, condition);
      subs.map((s) => {
        this.pushSubData(
          s,
          pref + ". Check server logs. Schema might have changed",
        );
      });
    });

    /* Trigger ok */
  } else if (condition_ids?.every((id) => Number.isInteger(id))) {
    state = "ok";
    const firedTableConditions = tableTriggerConditions.filter(({ idx }) =>
      condition_ids.includes(idx),
    );
    const orphanedTableConditions = condition_ids.filter((condId) => {
      const tc = tableTriggerConditions.at(condId);
      return !tc || (tc.subs.length === 0 && tc.syncs.length === 0);
    });
    if (orphanedTableConditions.length) {
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
            AND t.c_id IN ($2:csv) 
            AND t.app_id = $3
            AND at.app_id = t.app_id
            AND at.table_name = t.table_name
            AND at.condition = t.condition
          ) 
          `,
          [table_name, orphanedTableConditions, this.appId],
        )
        .then(() => {
          this.refreshTriggers();
        })
        .catch((e) => {
          console.error("Error deleting orphaned triggers", e);
        });
    }

    firedTableConditions.map(({ subs, syncs }) => {
      log(
        "notifListener",
        subs.map((s) => s.channel_name),
        syncs.map((s) => s.channel_name),
      );

      syncs.map((s) => {
        this.syncData(s, undefined, "trigger");
      });

      /* Throttle the subscriptions */
      const activeAndReadySubs = subs.filter((sub) =>
        sub.triggers.some(
          (trg) =>
            this.dbo[trg.table_name] &&
            sub.is_ready &&
            ((sub.socket_id && this.sockets[sub.socket_id]) || sub.localFuncs),
        ),
      );
      activeAndReadySubs.forEach((sub) => {
        const { throttle = 0, throttleOpts } = sub;
        if (
          !throttleOpts?.skipFirst &&
          sub.last_throttled <= Date.now() - throttle
        ) {
          sub.last_throttled = Date.now();

          /* It is assumed the policy was checked before this point */
          this.pushSubData(sub);
        } else if (!sub.is_throttling) {
          log("throttling sub");
          sub.is_throttling = setTimeout(() => {
            log("throttling finished. pushSubData...");
            sub.is_throttling = null;
            sub.last_throttled = Date.now();
            this.pushSubData(sub);
          }, throttle);
        }
      });
    });

    /* Trigger unknown issue */
  } else {
    state = "invalid_condition_ids";
  }

  await this._log({
    type: "sync",
    command: "notifListener",
    state,
    tableName: table_name,
    op_name,
    condition_ids_str,
    tableTriggers: this._triggers?.[table_name],
    tableSyncs: JSON.stringify(
      this.syncs
        .filter((s) => s.table_name === table_name)
        .map((s) => pickKeys(s, ["condition", "socket_id"])),
    ),
    connectedSocketIds: this.connectedSocketIds,
  });
}

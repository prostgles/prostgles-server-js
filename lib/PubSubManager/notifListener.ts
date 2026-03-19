import { includes, pickKeys } from "prostgles-types";
import { parseFieldFilter } from "../DboBuilder/ViewHandler/parseFieldFilter";
import type { PubSubManager, Subscription } from "./PubSubManager";
import { DELIMITER, log, NOTIF_TYPE, type NotifTypeName } from "./PubSubManagerUtils";

/* Relay relevant data to relevant subscriptions */
export async function notifListener(this: PubSubManager, data: { payload: string }) {
  const str = data.payload;

  if (!str) {
    console.error("Unexpected Empty notif");
    return;
  }

  const dataArr = str.split(DELIMITER);
  const notifType = dataArr[0] as NotifTypeName;

  log(str);

  const commonLog = {
    triggers: this._triggers,
    sid: undefined,
    connectedSocketIds: this.connectedSocketIds,
    socketId: undefined,
    duration: 0,
    tableName: dataArr[1] ?? "",
    dataArr,
    notifType,
  };

  await this._log({
    type: "syncOrSub",
    command: "notifListener",
    ...commonLog,
  });

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

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (notifType !== NOTIF_TYPE.data) {
    console.error("Unexpected notif type: ", notifType);
    return;
  }

  if (dataArr.length < 3) {
    throw "notifListener: dataArr length < 3";
  }

  const [_, table_name, op_name, condition_ids_str, raw_changed_columns_str = ""] = dataArr;
  const changedColumnsByTriggerId =
    !raw_changed_columns_str ? undefined : (
      (JSON.parse(raw_changed_columns_str) as Record<string, string[]>)
    );
  const conditionIds = condition_ids_str?.split(",").map((v) => +v);

  if (!table_name) {
    throw "table_name undef";
  }

  const tableTriggerConditions = this.getTriggerInfo(table_name);
  let state: "error" | "no-triggers" | "ok" | "invalid_condition_ids" = "ok";

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
        void this.pushSubData(s, pref + ". Check server logs. Schema might have changed");
      });
    });

    /* Trigger ok */
  } else if (conditionIds?.every((id) => Number.isInteger(id))) {
    state = "ok";
    const firedTableConditions = tableTriggerConditions.filter(({ table_condition_id }) =>
      conditionIds.includes(table_condition_id),
    );
    const orphanedTableConditions = conditionIds.filter((condId) => {
      const tc = tableTriggerConditions.at(condId);
      return !tc || (tc.subs.length === 0 && tc.syncs.length === 0);
    });
    if (orphanedTableConditions.length) {
      void this.deleteOrphanedTriggers(new Set(table_name));
    }

    const triggeredSubs = new Set<Subscription>();
    firedTableConditions.map(({ table_condition_id, condition, subs, syncs }) => {
      const changedColumns =
        !changedColumnsByTriggerId ? "*" : (changedColumnsByTriggerId[table_condition_id] ?? []);
      log(
        "notifListener",
        subs.map((s) => s.channel_name),
        syncs.map((s) => s.channel_name),
      );

      syncs.map((s) => {
        void this.syncData(s, undefined, "trigger");
      });

      const operation = (op_name?.toLowerCase() || "insert") as "insert" | "delete" | "update";

      subs.forEach((sub) => {
        const { triggers, subscribeOptions } = sub;
        const { actions, skipChangedColumnsCheck } = subscribeOptions;

        const subIsActive =
          sub.is_ready && ((sub.socket_id && this.sockets[sub.socket_id]) || sub.onData);
        if (!subIsActive) return;

        const didTrigger = triggers.find((subTrigger) => {
          const matchesTableCondition =
            subTrigger.table_name === table_name && subTrigger.condition === condition;
          if (!matchesTableCondition) return false;
          const matchesAction =
            !actions ||
            includes(parseFieldFilter(actions, false, ["insert", "update", "delete"]), operation);
          if (!matchesAction) return false;

          const subTrackedColumns = subTrigger.tracked_columns;
          const matchesChangedColumns =
            skipChangedColumnsCheck ||
            operation !== "update" ||
            changedColumns === "*" ||
            !subTrackedColumns ||
            changedColumns.some((changedColumn) => subTrackedColumns.includes(changedColumn));
          return matchesChangedColumns;
        });
        if (!didTrigger) {
          return;
        }
        triggeredSubs.add(sub);
      });
    });

    triggeredSubs.forEach((sub) => {
      const {
        subscribeOptions: { throttle = 0, throttleOpts },
      } = sub;
      if (!throttleOpts?.skipFirst && sub.lastPushed <= Date.now() - throttle) {
        /* It is assumed the policy was checked before this point */
        void this.pushSubData(sub);
      } else if (!sub.is_throttling) {
        log("throttling sub for", throttle, "ms");
        sub.is_throttling = setTimeout(() => {
          log("throttling finished. pushSubData...");
          sub.is_throttling = null;
          void this.pushSubData(sub);
        }, throttle);
      }
    });
  } else {
    state = "invalid_condition_ids";
  }

  await this._log({
    ...commonLog,
    type: "syncOrSub",
    command: "notifListener.Finished",
    state,
    op_name,
    condition_ids_str,
    tableTriggers: this._triggers.get(table_name),
    tableSyncs: JSON.stringify(
      this.syncs
        .filter((s) => s.table_name === table_name)
        .map((s) => pickKeys(s, ["condition", "socket_id"])),
    ),
    connectedSocketIds: this.connectedSocketIds,
  });
}

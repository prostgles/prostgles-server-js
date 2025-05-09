import { includes, pickKeys } from "prostgles-types";
import { parseFieldFilter } from "../DboBuilder/ViewHandler/parseFieldFilter";
import { PubSubManager } from "./PubSubManager";
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
  const changedColumns =
    !raw_changed_columns_str ? undefined
    : raw_changed_columns_str === "{}" ? []
    : raw_changed_columns_str.slice(1, -1).split(",");
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
    const firedTableConditions = tableTriggerConditions.filter(({ idx }) =>
      conditionIds.includes(idx)
    );
    const orphanedTableConditions = conditionIds.filter((condId) => {
      const tc = tableTriggerConditions.at(condId);
      return !tc || (tc.subs.length === 0 && tc.syncs.length === 0);
    });
    if (orphanedTableConditions.length) {
      void this.deleteOrphanedTriggers.bind(this)(table_name);
    }

    firedTableConditions.map(({ subs, syncs }) => {
      log(
        "notifListener",
        subs.map((s) => s.channel_name),
        syncs.map((s) => s.channel_name)
      );

      syncs.map((s) => {
        void this.syncData(s, undefined, "trigger");
      });

      /* Throttle the subscriptions */
      const activeAndReadySubs = subs.filter((sub) =>
        sub.triggers.some(
          (trg) =>
            this.dbo[trg.table_name] &&
            sub.is_ready &&
            ((sub.socket_id && this.sockets[sub.socket_id]) || sub.localFuncs)
        )
      );

      activeAndReadySubs.forEach((sub) => {
        const operation = (op_name?.toLowerCase() || "insert") as keyof NonNullable<typeof actions>;
        const { tracked_columns, subscribeOptions } = sub;
        const { throttle = 0, throttleOpts, actions, skipChangedColumnsCheck } = subscribeOptions;
        if (
          !skipChangedColumnsCheck &&
          changedColumns &&
          operation === "update" &&
          tracked_columns
        ) {
          const subFieldsHaveChanged = changedColumns.some((changedColumn) =>
            tracked_columns.includes(changedColumn)
          );
          if (!subFieldsHaveChanged) return;
        }

        const actionIsIgnored =
          actions &&
          !includes(parseFieldFilter(actions, false, ["insert", "update", "delete"]), operation);
        if (actionIsIgnored) {
          return;
        }

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
    });

    /* Trigger unknown issue */
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
    tableTriggers: this._triggers[table_name],
    tableSyncs: JSON.stringify(
      this.syncs
        .filter((s) => s.table_name === table_name)
        .map((s) => pickKeys(s, ["condition", "socket_id"]))
    ),
    connectedSocketIds: this.connectedSocketIds,
  });
}

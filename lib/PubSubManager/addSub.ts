import { SubscriptionChannels } from "prostgles-types";
import { VoidFunction } from "../SchemaWatch/SchemaWatch";
import { tout } from "./init/initPubSubManager";
import { BasicCallback, PubSubManager, Subscription, SubscriptionParams } from "./PubSubManager";
import { parseCondition } from "./PubSubManagerUtils";
import type { AddTriggerParams } from "./addTrigger";

type AddSubscriptionParams = SubscriptionParams & {
  condition: string;
};

type AddSubResult = SubscriptionChannels & {
  sendFirstData: VoidFunction | undefined;
};

/* Must return a channel for socket */
/* The distinct list of {table_name, condition} must have a corresponding trigger in the database */
export async function addSub(
  this: PubSubManager,
  subscriptionParams: Omit<AddSubscriptionParams, "channel_name" | "parentSubParams">
): Promise<AddSubResult> {
  const {
    socket,
    localFuncs,
    table_rules,
    filter = {},
    selectParams = {},
    condition = "",
    viewOptions,
    table_info,
    subscribeOptions,
    tracked_columns,
  } = subscriptionParams;
  const table_name = table_info.name;

  if (!socket && !localFuncs) {
    throw "socket AND func missing";
  }
  if (socket && localFuncs) {
    throw "addSub: cannot have socket AND func";
  }

  const channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.${JSON.stringify(selectParams)}.m.sub`;
  const mainTrigger = {
    table_name: table_name,
    condition: parseCondition(condition),
    tracked_columns,
  } satisfies AddTriggerParams;

  const newSub: Subscription = {
    channel_name,
    filter,
    localFuncs,
    selectParams: selectParams,
    lastPushed: 0,
    socket,
    subscribeOptions,
    table_info,
    is_ready: true,
    is_throttling: false,
    socket_id: socket?.id,
    table_rules,
    tracked_columns,
    triggers: [mainTrigger],
  };

  const result: AddSubResult = {
    channelName: channel_name,
    channelNameReady: channel_name + ".ready",
    channelNameUnsubscribe: channel_name + ".unsubscribe",
    sendFirstData: undefined,
  };

  const [matchingSub] = this.getClientSubs(newSub);
  if (matchingSub) {
    console.error(
      `Trying to add a duplicate ${localFuncs ? "local" : "socket"} sub for: ${channel_name}`
    );
    return result;
  }

  this.upsertSocket(socket);

  if (viewOptions) {
    for (const relatedTable of viewOptions.relatedTables) {
      const relatedSub = {
        table_name: relatedTable.tableName,
        condition: parseCondition(relatedTable.condition),
        tracked_columns: undefined,
      } satisfies AddTriggerParams;

      newSub.triggers.push(relatedSub);

      await this.addTrigger(relatedSub, viewOptions, socket);
    }
  }

  const { skipFirst, throttleOpts, throttle } = subscribeOptions;
  const sendFirstData = async () => {
    if (skipFirst) return;
    if (throttleOpts?.skipFirst && throttle) {
      await tout(throttle);
    }
    void this.pushSubData(newSub);
  };

  if (localFuncs) {
    /**
     * Must ensure sub will start sending data after all triggers are set up.
     * Socket clients are not affected as they need to confirm they are ready to receive data
     */
    result.sendFirstData = sendFirstData;
  } else if (socket) {
    const removeListeners = () => {
      socket.removeAllListeners(channel_name);
      socket.removeAllListeners(result.channelNameReady);
      socket.removeAllListeners(result.channelNameUnsubscribe);
    };
    removeListeners();

    socket.once(result.channelNameReady, sendFirstData);
    socket.once(result.channelNameUnsubscribe, (_data: any, cb: BasicCallback) => {
      const res = "ok";
      this.removeSubscription(channel_name, { type: "ws", socket });
      void this._log({
        type: "syncOrSub",
        command: "unsubscribe",
        channel_name,
        socketId: socket.id,
        duration: 0,
        triggers: this._triggers,
        connectedSocketIds: this.connectedSocketIds,
        sid: socket.id,
        tableName: table_name,
      });
      removeListeners();
      cb(null, { res });
    });
  }

  this.subs.push(newSub);

  /** A view will not have triggers. Related tables are added triggers instead */
  if (table_info.is_view) {
    if (!viewOptions?.relatedTables.length) {
      throw "PubSubManager: view parent_tables missing";
    }
  } else {
    await this.addTrigger(mainTrigger, undefined, socket);
  }

  return result;
}

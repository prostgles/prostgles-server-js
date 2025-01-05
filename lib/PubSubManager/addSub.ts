import { SubscriptionChannels } from "prostgles-types";
import {
  BasicCallback,
  parseCondition,
  PubSubManager,
  Subscription,
  SubscriptionParams,
} from "./PubSubManager";
import { VoidFunction } from "../SchemaWatch/SchemaWatch";

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
    params = {},
    condition = "",
    throttle = 0, //subOne = false,
    viewOptions,
    table_info,
    throttleOpts,
  } = subscriptionParams;
  const table_name = table_info.name;

  if (!socket && !localFuncs) {
    throw "socket AND func missing";
  }
  if (socket && localFuncs) {
    throw "addSub: cannot have socket AND func";
  }

  let validated_throttle = subscriptionParams.throttle || 10;
  const pubThrottle = table_rules?.subscribe?.throttle || 0;
  if (pubThrottle && Number.isInteger(pubThrottle) && pubThrottle > 0) {
    validated_throttle = pubThrottle;
  }
  if (throttle && Number.isInteger(throttle) && throttle >= pubThrottle) {
    validated_throttle = throttle;
  }

  const channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.${JSON.stringify(params)}.${"m"}.sub`;
  const mainTrigger = {
    table_name: table_name,
    condition: parseCondition(condition),
    is_related: false,
  } as const;

  const newSub: Subscription = {
    channel_name,
    filter,
    localFuncs,
    params,
    last_throttled: 0,
    socket,
    throttleOpts,
    table_info,
    is_ready: true,
    is_throttling: false,
    socket_id: socket?.id,
    table_rules,
    throttle: validated_throttle,
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
    console.error("Trying to add a duplicate sub for: ", channel_name);
    return result;
  }

  this.upsertSocket(socket);

  if (viewOptions) {
    for await (const relatedTable of viewOptions.relatedTables) {
      const relatedSub = {
        table_name: relatedTable.tableName,
        condition: parseCondition(relatedTable.condition),
        is_related: true,
      } as const;

      newSub.triggers.push(relatedSub);

      await this.addTrigger(relatedSub, viewOptions, socket);
    }
  }

  if (localFuncs) {
    /**
     * Must ensure sub will start sending data after all triggers are set up.
     * Socket clients are not affected as they need to confirm they are ready to receive data
     */
    result.sendFirstData = () => {
      void this.pushSubData(newSub);
    };
  } else if (socket) {
    const removeListeners = () => {
      socket.removeAllListeners(channel_name);
      socket.removeAllListeners(result.channelNameReady);
      socket.removeAllListeners(result.channelNameUnsubscribe);
    };
    removeListeners();

    socket.once(result.channelNameReady, () => {
      void this.pushSubData(newSub);
    });
    socket.once(result.channelNameUnsubscribe, (_data: any, cb: BasicCallback) => {
      const res = "ok";
      this.subs = this.subs.filter((s) => {
        const isMatch = s.socket?.id === socket.id && s.channel_name === channel_name;
        return !isMatch;
      });
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

  /** A view does not have triggers. Only related triggers */
  if (table_info.is_view) {
    if (!viewOptions?.relatedTables.length) {
      throw "PubSubManager: view parent_tables missing";
    }
  } else {
    await this.addTrigger(mainTrigger, undefined, socket);
  }

  return result;
}

import type { AnyObject, SubscribeParams, SubscriptionChannels } from "prostgles-types";
import type { AddSubscriptionParams } from "../../PubSubManager/addSub";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Filter, LocalParams } from "../DboBuilder";
import { getErrorAsObject, getSerializedClientErrorFromPGError } from "../DboBuilder";
import type { NewQuery } from "../QueryBuilder/QueryBuilder";
import { getSubscribeRelatedTables } from "../getSubscribeRelatedTables";
import type { ViewHandler } from "./ViewHandler";
import { getValidatedSubscribeOptions } from "./getValidatedSubscribeOptions";

export type OnData = (items: AnyObject[], error?: unknown) => any;

export const matchesLocalFuncs = (
  localFuncs1: OnData | undefined,
  localFuncs2: OnData | undefined,
) => {
  return localFuncs1 && localFuncs2 && localFuncs1 === localFuncs2;
};

async function subscribe(
  this: ViewHandler,
  filter: Filter,
  params: SubscribeParams,
  onData: OnData,
): Promise<{ unsubscribe: () => any }>;
async function subscribe(
  this: ViewHandler,
  filter: Filter,
  params: SubscribeParams,
  onData: undefined,
  table_rules: ParsedTableRule | undefined,
  localParams: LocalParams,
): Promise<SubscriptionChannels>;
async function subscribe(
  this: ViewHandler,
  filter: Filter,
  params: SubscribeParams,
  onData?: OnData,
  table_rules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<{ unsubscribe: () => any } | SubscriptionChannels> {
  const start = Date.now();
  try {
    if (!this.dboBuilder.canSubscribe) {
      throw "Cannot subscribe. PubSubManager not initiated";
    }

    if (this.tx) {
      throw "subscribe not allowed within transactions";
    }
    const clientReq = localParams?.clientReq;
    if (!clientReq && !onData) {
      throw " missing data. expecting onData | localParams { socket } ";
    }
    if (clientReq?.socket && onData) {
      throw " Cannot have onData and socket ";
    }

    const { throttle, throttleOpts, skipFirst, actions, skipChangedColumnsCheck, ...selectParams } =
      params;

    /** Ensure request is valid */
    await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams);

    const newQuery = (await this.find(
      filter,
      { ...selectParams, limit: 0 },
      undefined,
      table_rules,
      { ...localParams, returnNewQuery: true },
    )) as unknown as NewQuery;
    const viewOptions = await getSubscribeRelatedTables.bind(this)({
      filter,
      selectParams,
      table_rules,
      localParams,
      newQuery,
    });

    const [firstField, ...otherFields] = newQuery.select
      .filter((s) => s.selected)
      .flatMap((c) => c.fields);
    if (!firstField) {
      throw "Cannot subscribe to no columns. Use limit 0 if you don't want any data but want to listen to changes";
    }

    const commonSubOpts = {
      table_info: this.tableOrViewInfo,
      viewOptions,
      table_rules,
      condition: newQuery.whereOpts.condition,
      filter: { ...filter },
      selectParams: { ...selectParams },
      subscribeOptions: getValidatedSubscribeOptions(
        { actions, skipFirst, throttle, throttleOpts, skipChangedColumnsCheck },
        table_rules?.subscribe,
      ),
      lastPushed: 0,
      tracked_columns: !firstField ? undefined : [firstField, ...otherFields],
      pushRequestedVersion: 0,
    } as const satisfies Partial<AddSubscriptionParams>;

    const pubSubManager = await this.dboBuilder.getPubSubManager();

    if (!onData) {
      const { socket } = clientReq ?? {};
      const result = await pubSubManager.addSub({
        ...commonSubOpts,
        socket,
        onData: undefined,
        socket_id: socket?.id,
      });

      await this._log({
        command: "subscribe",
        localParams,
        data: { filter, params },
        duration: Date.now() - start,
      });
      return result;
    } else {
      const { channelName, sendFirstData } = await pubSubManager.addSub({
        ...commonSubOpts,
        socket: undefined,
        onData,
        socket_id: undefined,
      });

      const unsubscribe = async () => {
        const pubSubManager = await this.dboBuilder.getPubSubManager();
        pubSubManager.removeSubscription(channelName, { type: "local", onData });
      };
      await this._log({
        command: "subscribe",
        localParams,
        data: { filter, params },
        duration: Date.now() - start,
      });
      const res: { unsubscribe: () => any } = Object.freeze({ unsubscribe });
      /** Send first data after subscription is initialised to prevent race conditions */
      setTimeout(() => {
        sendFirstData?.();
      }, 0);
      return res;
    }
  } catch (e) {
    await this._log({
      command: "subscribe",
      localParams,
      data: { filter, params },
      duration: Date.now() - start,
      error: getErrorAsObject(e),
    });
    throw getSerializedClientErrorFromPGError(e, {
      type: "tableMethod",
      localParams,
      view: this,
    });
  }
}

export { subscribe };

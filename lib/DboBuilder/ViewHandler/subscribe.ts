import { AnyObject, SubscribeParams, SubscriptionChannels } from "prostgles-types";
import { TableRule } from "../../PublishParser/PublishParser";
import {
  Filter,
  LocalParams,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
} from "../DboBuilder";
import { getSubscribeRelatedTables } from "../getSubscribeRelatedTables";
import { NewQuery } from "../QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler";

type OnData = (items: AnyObject[]) => any;
export type LocalFuncs =
  | {
      onData: OnData;
      onError?: (error: any) => void;
    }
  | OnData;

export const getOnDataFunc = (localFuncs: LocalFuncs | undefined): OnData | undefined => {
  return typeof localFuncs === "function" ? localFuncs : localFuncs?.onData;
};
export const matchesLocalFuncs = (
  localFuncs1: LocalFuncs | undefined,
  localFuncs2: LocalFuncs | undefined
) => {
  return localFuncs1 && localFuncs2 && getOnDataFunc(localFuncs1) === getOnDataFunc(localFuncs2);
};
export const parseLocalFuncs = (
  localFuncs1: LocalFuncs | undefined
): Extract<LocalFuncs, { onData: OnData }> | undefined => {
  return (
    !localFuncs1 ? undefined
    : typeof localFuncs1 === "function" ?
      {
        onData: localFuncs1,
      }
    : localFuncs1
  );
};

async function subscribe(
  this: ViewHandler,
  filter: Filter,
  params: SubscribeParams,
  localFuncs: LocalFuncs
): Promise<{ unsubscribe: () => any }>;
async function subscribe(
  this: ViewHandler,
  filter: Filter,
  params: SubscribeParams,
  localFuncs: undefined,
  table_rules: TableRule | undefined,
  localParams: LocalParams
): Promise<SubscriptionChannels>;
async function subscribe(
  this: ViewHandler,
  filter: Filter,
  params: SubscribeParams,
  localFuncs?: LocalFuncs,
  table_rules?: TableRule,
  localParams?: LocalParams
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
    if (!clientReq && !localFuncs) {
      throw " missing data. provide -> localFunc | localParams { socket } ";
    }
    if (clientReq?.socket && localFuncs) {
      console.error({ localParams, localFuncs });
      throw " Cannot have localFunc AND socket ";
    }

    const { throttle = 0, throttleOpts, ...selectParams } = params;

    /** Ensure request is valid */
    await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams);

    const newQuery: NewQuery = (await this.find(
      filter,
      { ...selectParams, limit: 0 },
      undefined,
      table_rules,
      { ...localParams, returnNewQuery: true }
    )) as any;
    const viewOptions = await getSubscribeRelatedTables.bind(this)({
      filter,
      selectParams,
      table_rules,
      localParams,
      newQuery,
    });

    const commonSubOpts = {
      table_info: this.tableOrViewInfo,
      viewOptions,
      table_rules,
      condition: newQuery.whereOpts.condition,
      table_name: this.name,
      filter: { ...filter },
      params: { ...selectParams },
      throttle,
      throttleOpts,
      last_throttled: 0,
    } as const;

    const pubSubManager = await this.dboBuilder.getPubSubManager();
    if (!localFuncs) {
      const { socket } = clientReq ?? {};
      const result = await pubSubManager.addSub({
        ...commonSubOpts,
        socket,
        localFuncs: undefined,
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
        localFuncs,
        socket_id: undefined,
      });

      const unsubscribe = async () => {
        const pubSubManager = await this.dboBuilder.getPubSubManager();
        pubSubManager.removeLocalSub(channelName, localFuncs);
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

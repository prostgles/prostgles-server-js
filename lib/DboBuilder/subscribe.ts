import { AnyObject, SubscribeParams, SubscriptionChannels } from "prostgles-types";
import { Filter, LocalParams, parseError } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { omitKeys } from "../PubSubManager/PubSubManager"; 
import { ViewHandler } from "./ViewHandler";
import { getSubscribeRelatedTables } from "./getSubscribeRelatedTables";

type OnData = (items: AnyObject[]) => any; 
export type LocalFuncs = {
  onData: OnData
  onError?: (error: any) => void;
} | OnData;

export const getOnDataFunc = (localFuncs: LocalFuncs | undefined): Function | undefined => {
  return typeof localFuncs === "function"? localFuncs : localFuncs?.onData;
}
export const matchesLocalFuncs = (localFuncs1: LocalFuncs | undefined, localFuncs2: LocalFuncs | undefined) => {
  return localFuncs1 && localFuncs2 && getOnDataFunc(localFuncs1) === getOnDataFunc(localFuncs2);
}
export const parseLocalFuncs = (localFuncs1: LocalFuncs | undefined): Extract<LocalFuncs, { onData: OnData }> | undefined=> {
  return !localFuncs1? undefined : typeof localFuncs1 === "function"? {
    onData: localFuncs1
  } : localFuncs1;
}

async function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs: LocalFuncs): Promise<{ unsubscribe: () => any }> 
async function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<SubscriptionChannels>
async function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs?: LocalFuncs, table_rules?: TableRule, localParams?: LocalParams): Promise<{ unsubscribe: () => any } | SubscriptionChannels> 
{

  try {
    // if (this.is_view) throw "Cannot subscribe to a view";

    if (this.t) {
      throw "subscribe not allowed within transactions";
    }
    if (!localParams && !localFuncs) {
      throw " missing data. provide -> localFunc | localParams { socket } ";
    }
    if (localParams?.socket && localFuncs) {
      console.error({ localParams, localFuncs })
      throw " Cannot have localFunc AND socket ";
    }

    const { filterFields, forcedFilter } = table_rules?.select || {},
      filterOpts = await this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: undefined, localParams, tableRule: table_rules }),
      condition = filterOpts.where,
      { throttle = 0, throttleOpts, ...selectParams } = params;

    /** app_triggers condition field has an index which limits it's value. 
     * TODO: use condition md5 hash 
     * */
    const filterSize = JSON.stringify(filter || {}).length;
    if (filterSize * 4 > 2704) {
      throw "filter too big. Might exceed the btree version 4 maximum 2704. Use a primary key or a $rowhash filter instead"
    }
    if (!this.dboBuilder.prostgles.isSuperUser) {
      throw "Subscribe not possible. Must be superuser to add triggers 1856";
    }

    /** Ensure request is valid */
    await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams);

    const viewOptions = await getSubscribeRelatedTables.bind(this)({ filter, selectParams, table_rules, localParams, condition, filterOpts })

    const commonSubOpts = {
      table_info: this.tableOrViewInfo,
      viewOptions,
      table_rules,
      condition,
      table_name: this.name,
      filter: { ...filter },
      params: { ...selectParams },
      throttle,
      throttleOpts,
      last_throttled: 0,
    } as const;

    const pubSubManager = await this.dboBuilder.getPubSubManager();
    if (!localFuncs) {    

      const { socket } = localParams ?? {};
      return pubSubManager.addSub({
        ...commonSubOpts,
        socket, 
        localFuncs: undefined,
        socket_id: socket?.id, 
      });

    } else {

      const { channelName } = await pubSubManager.addSub({ 
        ...commonSubOpts,
        socket: undefined,  
        localFuncs, 
        socket_id: undefined, 
      });
      
      const unsubscribe = async () => {
        const pubSubManager = await this.dboBuilder.getPubSubManager();
        pubSubManager.removeLocalSub(channelName, localFuncs)
      };
      const res: { unsubscribe: () => any } = Object.freeze({ unsubscribe })
      return res;
    }
  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.subscribe()`);
  }
}

export { subscribe }
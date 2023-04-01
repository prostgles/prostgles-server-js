import { AnyObject, SubscribeParams, SubscriptionChannels } from "prostgles-types";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { ViewHandler } from "./ViewHandler";
type OnData = (items: AnyObject[]) => any;
export type LocalFuncs = {
    onData: OnData;
    onError?: (error: any) => void;
} | OnData;
export declare const getOnDataFunc: (localFuncs: LocalFuncs | undefined) => Function | undefined;
export declare const matchesLocalFuncs: (localFuncs1: LocalFuncs | undefined, localFuncs2: LocalFuncs | undefined) => boolean | undefined;
export declare const parseLocalFuncs: (localFuncs1: LocalFuncs | undefined) => Extract<LocalFuncs, {
    onData: OnData;
}> | undefined;
declare function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs: LocalFuncs): Promise<{
    unsubscribe: () => any;
}>;
declare function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<SubscriptionChannels>;
export { subscribe };
//# sourceMappingURL=subscribe.d.ts.map
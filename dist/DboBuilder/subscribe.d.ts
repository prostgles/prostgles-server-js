import { AnyObject, SubscribeParams, SubscriptionChannels } from "prostgles-types";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { ViewHandler } from "./ViewHandler";
export type LocalFuncs = {
    onData: (items: AnyObject[]) => any;
    onError?: (error: any) => void;
};
declare function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs: LocalFuncs): Promise<{
    unsubscribe: () => any;
}>;
declare function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFuncs: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<SubscriptionChannels>;
export { subscribe };
//# sourceMappingURL=subscribe.d.ts.map
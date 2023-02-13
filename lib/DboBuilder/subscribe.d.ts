import { AnyObject, SubscribeParams } from "prostgles-types";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { ViewHandler } from "./ViewHandler";
export declare type LocalFunc = (items: AnyObject[]) => any;
declare function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFunc: LocalFunc): Promise<{
    unsubscribe: () => any;
}>;
declare function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFunc: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<string>;
export { subscribe };
//# sourceMappingURL=subscribe.d.ts.map
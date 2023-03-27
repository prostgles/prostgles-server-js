import { AnyObject, SubscribeParams } from "prostgles-types";
import { ExistsFilterConfig, Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { ViewSubscriptionOptions } from "../PubSubManager/PubSubManager";
import { ViewHandler } from "./ViewHandler";
type Args = {
    selectParams: Omit<SubscribeParams<any>, "throttle">;
    filter: Filter;
    table_rules: TableRule<AnyObject, void> | undefined;
    localParams: LocalParams | undefined;
    condition: string;
    filterOpts: {
        where: string;
        filter: AnyObject;
        exists: ExistsFilterConfig[];
    };
};
export declare function getSubscribeRelatedTables(this: ViewHandler, { selectParams, filter, localParams, table_rules, condition, filterOpts }: Args): Promise<ViewSubscriptionOptions>;
export {};
//# sourceMappingURL=getSubscribeRelatedTables.d.ts.map
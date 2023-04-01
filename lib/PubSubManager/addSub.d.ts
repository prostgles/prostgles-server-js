import { SubscriptionChannels } from "prostgles-types";
import { PubSubManager, SubscriptionParams } from "./PubSubManager";
type AddSubscriptionParams = SubscriptionParams & {
    condition: string;
};
export declare function addSub(this: PubSubManager, subscriptionParams: Omit<AddSubscriptionParams, "channel_name" | "parentSubParams">): Promise<SubscriptionChannels>;
export {};
//# sourceMappingURL=addSub.d.ts.map
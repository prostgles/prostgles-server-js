import { PubSubManager, SubscriptionParams } from "./PubSubManager";
type AddSubscriptionParams = SubscriptionParams & {
    condition: string;
};
export declare function addSub(this: PubSubManager, subscriptionParams: Omit<AddSubscriptionParams, "channel_name" | "parentSubParams">): Promise<string>;
export {};
//# sourceMappingURL=addSub.d.ts.map
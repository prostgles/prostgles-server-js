import { PubSubManager, SyncParams } from "./PubSubManager";
import { AnyObject } from "prostgles-types";
export type ClientSyncInfo = Partial<{
    c_fr: AnyObject;
    c_lr: AnyObject;
    /**
     * PG count is ussually string due to bigint
     */
    c_count: number | string;
}>;
export type ServerSyncInfo = Partial<{
    s_fr: AnyObject;
    s_lr: AnyObject;
    /**
     * PG count is ussually string due to bigint
     */
    s_count: number | string;
}>;
export type SyncBatchInfo = Partial<{
    from_synced: number | null;
    to_synced: number | null;
    end_offset: number | null;
}>;
export type onSyncRequestResponse = {
    onSyncRequest?: ClientSyncInfo;
} | {
    err: AnyObject | string;
};
export type ClientExpressData = ClientSyncInfo & {
    data?: AnyObject[];
    deleted?: AnyObject[];
};
export declare const syncData: (_this: PubSubManager, sync: SyncParams, clientData: ClientExpressData | undefined, source: "trigger" | "client") => Promise<void>;
//# sourceMappingURL=SyncReplication.d.ts.map
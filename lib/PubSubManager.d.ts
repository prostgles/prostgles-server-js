import { PostgresNotifListenManager } from "./PostgresNotifListenManager";
import { TableOrViewInfo, TableInfo, DbHandler } from "./DboBuilder";
import { TableRule, DB } from "./Prostgles";
import { SelectParams, FieldFilter } from "prostgles-types";
export declare const DEFAULT_SYNC_BATCH_SIZE = 50;
declare type SyncParams = {
    socket_id: string;
    channel_name: string;
    table_name: string;
    table_rules: TableRule;
    synced_field: string;
    allow_delete: boolean;
    id_fields: string[];
    batch_size: number;
    filter: object;
    params: {
        select: FieldFilter;
    };
    condition: string;
    is_syncing: boolean;
    throttle?: number;
    lr: object;
    last_synced: number;
};
declare type AddSyncParams = {
    socket: any;
    table_info: TableInfo;
    table_rules: TableRule;
    synced_field: string;
    allow_delete: boolean;
    id_fields: string[];
    filter: object;
    params: {
        select: FieldFilter;
    };
    condition: string;
    throttle?: number;
};
declare type SubscriptionParams = {
    socket_id: string;
    channel_name: string;
    table_name: string;
    socket: any;
    table_info: TableOrViewInfo;
    table_rules: TableRule;
    filter: object;
    params: SelectParams;
    func: (data: any) => any;
    throttle?: number;
    last_throttled: number;
    is_throttling?: any;
    is_ready?: boolean;
    subOne?: boolean;
};
declare type AddSubscriptionParams = SubscriptionParams & {
    condition: string;
};
export declare type PubSubManagerOptions = {
    db: DB;
    dbo: DbHandler;
    wsChannelNamePrefix?: string;
    pgChannelName?: string;
    onSchemaChange?: () => void;
};
export declare class PubSubManager {
    static DELIMITER: string;
    db: DB;
    dbo: DbHandler;
    triggers: any;
    sockets: any;
    subs: {
        [ke: string]: {
            [ke: string]: {
                subs: SubscriptionParams[];
            };
        };
    };
    syncs: SyncParams[];
    socketChannelPreffix: string;
    onSchemaChange?: () => void;
    postgresNotifListenManager: PostgresNotifListenManager;
    postgresNotifChannelName: string;
    schemaChangedNotifPayloadStr: string;
    constructor(options: PubSubManagerOptions);
    startWatchingSchema(): Promise<void>;
    isReady(): any;
    getSubs(table_name: string, condition: string): SubscriptionParams[];
    getSyncs(table_name: string, condition: string): SyncParams[];
    notifListener: (data: any) => void;
    pushSubData(sub: SubscriptionParams): Promise<unknown>;
    upsertSocket(socket: any, channel_name: string): void;
    syncData(sync: SyncParams, clientData: any): Promise<void>;
    addSync(syncParams: AddSyncParams): Promise<string>;
    parseCondition: (condition: string) => string;
    addSub(subscriptionParams: AddSubscriptionParams): Promise<string>;
    removeLocalSub(table_name: string, condition: string, func: (items: object[]) => any): void;
    onSocketDisconnected(socket: any, channel_name: any): void;
    dropTrigger(table_name: any): void;
    getTriggerName(table_name: any, suffix: any): string;
    addTrigger({ table_name, condition }: {
        table_name: any;
        condition: any;
    }): Promise<any>;
    addingTrigger: any;
    addTriggerPool: any;
    pushSyncInfo({ table_name, id_key, info_level }: {
        table_name: any;
        id_key?: string;
        info_level?: number;
    }): Promise<any[]>;
}
export declare function filterObj(obj: object, keys?: string[]): object;
export {};
//# sourceMappingURL=PubSubManager.d.ts.map
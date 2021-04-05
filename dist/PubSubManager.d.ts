import { PostgresNotifListenManager } from "./PostgresNotifListenManager";
import { TableOrViewInfo, TableInfo, DbHandler, DboBuilder } from "./DboBuilder";
import { TableRule, DB } from "./Prostgles";
import { SelectParamsBasic as SelectParams, FieldFilter, WAL } from "prostgles-types";
export declare const asValue: (v: any) => string;
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
    isSyncingTimeout: number;
    wal: WAL;
    throttle?: number;
    lr: object;
    last_synced: number;
    is_syncing: boolean;
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
    dboBuilder: DboBuilder;
    db: DB;
    dbo: DbHandler;
    wsChannelNamePrefix?: string;
    pgChannelName?: string;
    onSchemaChange?: (event: {
        command: string;
        query: string;
    }) => void;
};
export declare class PubSubManager {
    static DELIMITER: string;
    dboBuilder: DboBuilder;
    db: DB;
    dbo: DbHandler;
    _triggers: {
        [key: string]: string[];
    };
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
    onSchemaChange?: (event: {
        command: string;
        query: string;
    }) => void;
    postgresNotifListenManager: PostgresNotifListenManager;
    private constructor();
    NOTIF_TYPE: {
        data: string;
        schema: string;
    };
    NOTIF_CHANNEL: {
        preffix: string;
        getFull: (appID?: string) => string;
    };
    private appID;
    appCheckFrequencyMS: number;
    appCheck: any;
    static create: (options: PubSubManagerOptions) => Promise<PubSubManager>;
    init: () => Promise<PubSubManager>;
    DB_OBJ_NAMES: {
        trigger_add_remove_func: string;
        data_watch_func: string;
        schema_watch_func: string;
        schema_watch_trigger: string;
    };
    prepareTriggers: () => Promise<boolean>;
    isReady(): any;
    getSubs(table_name: string, condition: string): SubscriptionParams[];
    getSyncs(table_name: string, condition: string): SyncParams[];
    notifListener: (data: {
        payload: string;
    }) => Promise<void>;
    pushSubData(sub: SubscriptionParams): Promise<unknown>;
    upsertSocket(socket: any, channel_name: string): void;
    syncTimeout: any;
    syncData(sync: SyncParams, clientData: any): Promise<void>;
    addSync(syncParams: AddSyncParams): Promise<string>;
    parseCondition: (condition: string) => string;
    addSub(subscriptionParams: AddSubscriptionParams): Promise<string>;
    removeLocalSub(table_name: string, condition: string, func: (items: object[]) => any): void;
    onSocketDisconnected(socket: any, channel_name: any): void;
    checkIfTimescaleBug: (table_name: string) => Promise<boolean>;
    getMyTriggerQuery: () => Promise<string>;
    addingTrigger: any;
    addTriggerPool: {
        [key: string]: string[];
    };
    addTrigger(params: {
        table_name: string;
        condition: string;
    }): Promise<void>;
    pushSyncInfo({ table_name, id_key, info_level }: {
        table_name: any;
        id_key?: string;
        info_level?: number;
    }): Promise<any[]>;
}
export declare function filterObj(obj: object, keys?: string[], exclude?: string[]): object;
export {};
//# sourceMappingURL=PubSubManager.d.ts.map
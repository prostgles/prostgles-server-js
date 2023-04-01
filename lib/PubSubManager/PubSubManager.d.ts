/// <reference types="node" />
import { PostgresNotifListenManager } from "../PostgresNotifListenManager";
import { TableOrViewInfo, TableInfo, DBHandlerServer, DboBuilder, PRGLIOSocket } from "../DboBuilder";
import { DB } from "../Prostgles";
import { SelectParams, FieldFilter, WAL, AnyObject } from "prostgles-types";
import { ClientExpressData } from "../SyncReplication";
import { TableRule } from "../PublishParser";
import { LocalFuncs } from "../DboBuilder/subscribe";
export declare const asValue: (v: any) => string;
export declare const DEFAULT_SYNC_BATCH_SIZE = 50;
export declare const log: (...args: any[]) => void;
export type BasicCallback = (err?: any, res?: any) => void;
export type SyncParams = {
    socket_id: string;
    channel_name: string;
    table_name: string;
    table_rules?: TableRule;
    synced_field: string;
    allow_delete: boolean;
    id_fields: string[];
    batch_size: number;
    filter: object;
    params: {
        select: FieldFilter;
    };
    condition: string;
    wal?: WAL;
    throttle?: number;
    lr?: AnyObject;
    last_synced: number;
    is_syncing: boolean;
};
export type AddSyncParams = {
    socket: any;
    table_info: TableInfo;
    table_rules: TableRule;
    synced_field: string;
    allow_delete?: boolean;
    id_fields: string[];
    filter: object;
    params: {
        select: FieldFilter;
    };
    condition: string;
    throttle?: number;
};
export type ViewSubscriptionOptions = ({
    type: "view";
    viewName: string;
    definition: string;
} | {
    type: "table";
    viewName?: undefined;
    definition?: undefined;
}) & {
    relatedTables: {
        tableName: string;
        tableNameEscaped: string;
        condition: string;
    }[];
};
export type SubscriptionParams = {
    socket_id?: string;
    channel_name: string;
    /**
     * If this is a view then an array with all related tables will be
     * */
    viewOptions?: ViewSubscriptionOptions;
    parentSubParams: Omit<SubscriptionParams, "parentSubParams"> | undefined;
    table_info: TableOrViewInfo;
    table_rules?: TableRule;
    filter: object;
    params: SelectParams;
    localFuncs?: LocalFuncs;
    socket: PRGLIOSocket | undefined;
    throttle?: number;
    last_throttled: number;
    is_throttling?: any;
    is_ready?: boolean;
};
export type PubSubManagerOptions = {
    dboBuilder: DboBuilder;
    wsChannelNamePrefix?: string;
    pgChannelName?: string;
    onSchemaChange?: (event: {
        command: string;
        query: string;
    }) => void;
};
export type Subscription = Pick<SubscriptionParams, "throttle" | "is_throttling" | "last_throttled" | "channel_name" | "is_ready" | "localFuncs" | "socket" | "socket_id" | "table_info" | "filter" | "params" | "table_rules"> & {
    triggers: {
        table_name: string;
        condition: string;
        is_related: boolean;
    }[];
};
export declare class PubSubManager {
    static DELIMITER: string;
    dboBuilder: DboBuilder;
    get db(): DB;
    get dbo(): DBHandlerServer;
    _triggers?: Record<string, string[]>;
    sockets: AnyObject;
    subs: Subscription[];
    syncs: SyncParams[];
    socketChannelPreffix: string;
    onSchemaChange?: ((event: {
        command: string;
        query: string;
    }) => void);
    postgresNotifListenManager?: PostgresNotifListenManager;
    private constructor();
    NOTIF_TYPE: {
        data: string;
        schema: string;
    };
    NOTIF_CHANNEL: {
        preffix: string;
        getFull: (appID?: string) => string;
    };
    /**
     * Used facilitate concurrent prostgles connections to the same database
     */
    appID?: string;
    appCheckFrequencyMS: number;
    appCheck?: ReturnType<typeof setInterval>;
    static canCreate: (db: DB) => Promise<{
        canExecute: boolean;
        isSuperUs: boolean;
        yes: boolean;
    }>;
    static create: (options: PubSubManagerOptions) => Promise<any>;
    destroyed: boolean;
    destroy: () => void;
    canContinue: () => boolean;
    appChecking: boolean;
    init: any;
    static SCHEMA_ALTERING_QUERIES: string[];
    static EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID: string;
    prepareTriggers: () => Promise<boolean>;
    isReady(): any;
    getSubs(table_name: string, condition: string, client?: Pick<Subscription, "localFuncs" | "socket_id">): Subscription[];
    removeLocalSub(tableName: string, conditionRaw: string, localFuncs: LocalFuncs): void;
    getSyncs(table_name: string, condition: string): SyncParams[];
    notifListener: any;
    getSubData: (sub: Subscription) => Promise<{
        data: any[];
        err?: undefined;
    } | {
        data?: undefined;
        err: any;
    }>;
    pushSubData: any;
    upsertSocket(socket: any): void;
    syncTimeout?: ReturnType<typeof setTimeout>;
    syncData(sync: SyncParams, clientData: ClientExpressData | undefined, source: "trigger" | "client"): Promise<void>;
    addSync: any;
    addSub: any;
    getActiveListeners: () => {
        table_name: string;
        condition: string;
    }[];
    checkIfTimescaleBug: (table_name: string) => Promise<boolean>;
    getMyTriggerQuery: () => Promise<string>;
    addingTrigger: any;
    addTriggerPool?: Record<string, string[]>;
    addTrigger(params: {
        table_name: string;
        condition: string;
    }, viewOptions?: ViewSubscriptionOptions): Promise<boolean>;
}
export declare const parseCondition: (condition: string) => string;
export { pickKeys, omitKeys } from "prostgles-types";
//# sourceMappingURL=PubSubManager.d.ts.map
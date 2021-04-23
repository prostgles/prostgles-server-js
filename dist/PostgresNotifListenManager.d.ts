export declare type PrglNotifListener = (args: {
    length: number;
    processId: number;
    channel: string;
    payload: string;
    name: string;
}) => void;
export declare class PostgresNotifListenManager {
    connection: any;
    db_pg: any;
    notifListener: PrglNotifListener;
    db_channel_name: string;
    isListening: any;
    client: any;
    static create: (db_pg: any, notifListener: PrglNotifListener, db_channel_name: string) => Promise<PostgresNotifListenManager>;
    constructor(db_pg: any, notifListener: PrglNotifListener, db_channel_name: string, noInit?: boolean);
    init(): Promise<PostgresNotifListenManager>;
    isReady(): any;
    startListening(): Promise<unknown>;
    stopListening: () => void;
    reconnect(delay?: any, maxAttempts?: any): Promise<unknown>;
}
//# sourceMappingURL=PostgresNotifListenManager.d.ts.map
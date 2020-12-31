export declare class PostgresNotifListenManager {
    connection: any;
    db_pg: any;
    notifListener: any;
    db_channel_name: any;
    isListening: any;
    constructor(db_pg: any, notifListener: any, db_channel_name: any);
    isReady(): any;
    startListening(): Promise<void>;
    reconnect(delay?: any, maxAttempts?: any): Promise<unknown>;
}
//# sourceMappingURL=PostgresNotifListenManager.d.ts.map
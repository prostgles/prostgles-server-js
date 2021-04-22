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
    constructor(db_pg: any, notifListener: PrglNotifListener, db_channel_name: string);
    isReady(): any;
    startListening(): Promise<void>;
    reconnect(delay?: any, maxAttempts?: any): Promise<unknown>;
}
//# sourceMappingURL=PostgresNotifListenManager.d.ts.map
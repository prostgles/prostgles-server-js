import { FieldFilter, WAL } from "prostgles-types";
export declare type POJO = {
    [key: string]: any;
};
export declare const debug: any;
export declare type SyncOptions = Partial<SyncedTableOptions> & {
    select?: FieldFilter;
    handlesOnData?: boolean;
};
export declare type SyncOneOptions = Partial<SyncedTableOptions> & {
    handlesOnData?: boolean;
};
/**
 * Creates a local synchronized table
 */
export declare type Sync = <T = POJO>(basicFilter: any, options: SyncOptions, onChange: (data: (SyncDataItems & T)[], delta?: Partial<T>[]) => any, onError?: (error: any) => void) => Promise<MultiSyncHandles<T>>;
/**
 * Creates a local synchronized record
 */
export declare type SyncOne = <T = POJO>(basicFilter: any, options: SyncOneOptions, onChange: (data: (SyncDataItem & T), delta?: Partial<T>) => any, onError?: (error: any) => void) => Promise<SingleSyncHandles<T>>;
export declare type SyncBatchRequest = {
    from_synced?: string | number;
    to_synced?: string | number;
    offset: number;
    limit: number;
};
export declare type ItemUpdate = {
    idObj: any;
    delta: any;
};
export declare type ItemUpdated = ItemUpdate & {
    oldItem: any;
    newItem: any;
    status: "inserted" | "updated" | "deleted";
    from_server: boolean;
};
export declare type CloneSync<T> = (onChange: SingleChangeListener, onError?: (error: any) => void) => SingleSyncHandles<T>;
/**
 * CRUD handles added if initialised with handlesOnData = true
 */
export declare type SyncDataItems<T = POJO> = T & {
    $get?: () => T;
    $find?: (idObj: Partial<T>) => (T | undefined);
    $update?: (newData: Partial<T>) => any;
    $delete?: () => any;
};
/**
 * CRUD handles added if initialised with handlesOnData = true
 * A single data item can also be unsynced and cloned
 */
export declare type SyncDataItem<T = POJO> = SyncDataItems<T> & {
    $unsync?: () => any;
    $cloneSync?: CloneSync<T>;
};
export declare type MultiSyncHandles<T = POJO> = {
    unsync: () => void;
    upsert: (newData: T[]) => any;
};
export declare type SingleSyncHandles<T = POJO> = {
    get: () => T;
    find: (idObj: Partial<T>) => (T | undefined);
    unsync: () => any;
    delete: () => void;
    update: (data: T) => void;
    cloneSync: CloneSync<T>;
};
export declare type SubscriptionSingle<T = POJO> = {
    _onChange: (data: T, delta?: Partial<T>) => T;
    notify: (data: T, delta?: Partial<T>) => T;
    idObj: Partial<T>;
    handlesOnData?: boolean;
    handles?: SingleSyncHandles;
};
export declare type SubscriptionMulti<T = POJO> = {
    _onChange: (data: T[], delta: Partial<T>[]) => T[];
    notify: (data: T[], delta: Partial<T>[]) => T[];
    idObj?: Partial<T>;
    handlesOnData?: boolean;
    handles?: MultiSyncHandles<T>;
};
export declare type MultiChangeListener<T = POJO> = (items: SyncDataItems<T>[], delta: Partial<T>[]) => any;
export declare type SingleChangeListener<T = POJO> = (item: SyncDataItem<T>, delta: Partial<T>) => any;
export declare type SyncedTableOptions = {
    name: string;
    filter?: POJO;
    onChange?: MultiChangeListener;
    onError?: (error: any) => void;
    db: any;
    pushDebounce?: number;
    skipFirstTrigger?: boolean;
    select?: "*" | {};
    storageType: string;
    patchText: boolean;
    patchJSON: boolean;
    onReady: () => any;
};
export declare class SyncedTable {
    db: any;
    name: string;
    select?: "*" | {};
    filter?: POJO;
    onChange: (data: POJO[], delta: POJO) => POJO[];
    id_fields: string[];
    synced_field: string;
    throttle: number;
    batch_size: number;
    skipFirstTrigger: boolean;
    columns: {
        name: string;
        data_type: string;
    }[];
    wal: WAL;
    _multiSubscriptions: SubscriptionMulti[];
    _singleSubscriptions: SubscriptionSingle[];
    /**
     * add debug mode to fix sudden no data and sync listeners bug
     */
    set multiSubscriptions(mSubs: SubscriptionMulti[]);
    get multiSubscriptions(): SubscriptionMulti[];
    set singleSubscriptions(sSubs: SubscriptionSingle[]);
    get singleSubscriptions(): SubscriptionSingle[];
    dbSync: any;
    items: POJO[];
    storageType: string;
    itemsObj: POJO;
    patchText: boolean;
    patchJSON: boolean;
    isSynced: boolean;
    onError: SyncedTableOptions["onError"];
    constructor({ name, filter, onChange, onReady, db, skipFirstTrigger, select, storageType, patchText, patchJSON, onError }: SyncedTableOptions);
    private updatePatches;
    static create(opts: SyncedTableOptions): Promise<SyncedTable>;
    /**
     * Returns a sync handler to all records within the SyncedTable instance
     * @param onChange change listener <(items: object[], delta: object[]) => any >
     * @param handlesOnData If true then $upsert and $unsync handles will be added on each data item. True by default;
     */
    sync<T = POJO>(onChange: MultiChangeListener, handlesOnData?: boolean): MultiSyncHandles<T>;
    /**
     * Returns a sync handler to a specific record within the SyncedTable instance
     * @param idObj object containing the target id_fields properties
     * @param onChange change listener <(item: object, delta: object) => any >
     * @param handlesOnData If true then $update, $delete and $unsync handles will be added on the data item. True by default;
     */
    syncOne<T = POJO>(idObj: Partial<T>, onChange: SingleChangeListener, handlesOnData?: boolean): SingleSyncHandles<T>;
    /**
     * Notifies multi subs with ALL data + deltas. Attaches handles on data if required
     * @param newData -> updates. Must include id_fields + updates
     */
    private notifySubscribers;
    unsubscribe: (onChange: any) => string;
    private getIdStr;
    private getIdObj;
    private getRowSyncObj;
    unsync: () => void;
    destroy: () => void;
    private matchesFilter;
    private matchesIdObj;
    /**
     * Returns properties that are present in {n} and are different to {o}
     * @param o current full data item
     * @param n new data item
     */
    private getDelta;
    deleteAll(): void;
    private delete;
    private checkItemCols;
    /**
     * Upserts data locally -> notify subs -> sends to server if required
     * synced_field is populated if data is not from server
     * @param items <{ idObj: object, delta: object }[]> Data items that changed
     * @param from_server : <boolean> If false then updates will be sent to server
     */
    upsert: (items: ItemUpdate[], from_server?: boolean) => Promise<any>;
    getItem<T = POJO>(idObj: Partial<T>): {
        data?: T;
        index: number;
    };
    /**
     *
     * @param item data to be inserted/updated/deleted. Must include id_fields
     * @param index (optional) index within array
     * @param isFullData
     * @param deleteItem
     */
    setItem(item: POJO, index: number, isFullData?: boolean, deleteItem?: boolean): void;
    /**
     * Sets the current data
     * @param items data
     */
    setItems: (items: POJO[]) => void;
    /**
     * Returns the current data ordered by synced_field ASC and matching the main filter;
     */
    getItems: () => POJO[];
    /**
     * Sync data request
     * @param param0: SyncBatchRequest
     */
    getBatch: ({ from_synced, to_synced, offset, limit }?: SyncBatchRequest) => {
        [x: string]: any;
    }[];
}
//# sourceMappingURL=SyncedTable.d.ts.map
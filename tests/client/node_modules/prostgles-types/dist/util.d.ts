export declare function asName(str: string): string;
export declare function stableStringify(data: any, opts: any): string;
export declare type TextPatch = {
    from: number;
    to: number;
    text: string;
    md5: string;
};
export declare function getTextPatch(oldStr: string, newStr: string): TextPatch | string;
export declare function unpatchText(original: string, patch: TextPatch): string;
export declare type SyncTableInfo = {
    id_fields: string[];
    synced_field: string;
    throttle: number;
    batch_size: number;
};
export declare type BasicOrderBy = {
    fieldName: string;
    asc: boolean;
}[];
export declare type WALConfig = SyncTableInfo & {
    onSendStart?: () => any;
    onSend: (items: any[], fullItems: WALItem[]) => Promise<any>;
    onSendEnd?: (batch: any[], fullItems: WALItem[], error?: any) => any;
    orderBy?: BasicOrderBy;
};
export declare type WALItem = {
    initial?: any;
    current: any;
};
export declare type WALItemsObj = {
    [key: string]: WALItem;
};
export declare class WAL {
    private changed;
    private sending;
    private options;
    private callbacks;
    constructor(args: WALConfig);
    sort: (a: any, b: any) => number;
    isSending(): boolean;
    getIdStr(d: any): string;
    getIdObj(d: any): any;
    getDeltaObj(d: any): any;
    addData: (data: WALItem[], cb?: (err: any) => any) => void;
    isSendingTimeout?: any;
    private sendItems;
}
export declare function isEmpty(obj?: any): boolean;
export declare function get(obj: any, propertyPath: string | string[]): any;
//# sourceMappingURL=util.d.ts.map
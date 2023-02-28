import { PubSubManager } from "./PubSubManager";
export declare const DB_OBJ_NAMES: {
    readonly trigger_add_remove_func: "prostgles.trigger_add_remove_func";
    readonly data_watch_func: "prostgles.prostgles_trigger_function";
    readonly schema_watch_func: "prostgles.schema_watch_func";
    readonly schema_watch_trigger: "prostgles_schema_watch_trigger_new";
};
export declare const getInitQuery: (this: PubSubManager) => Promise<string>;
//# sourceMappingURL=getInitQuery.d.ts.map
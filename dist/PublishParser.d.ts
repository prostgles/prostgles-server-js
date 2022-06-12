import { AnyObject, TableSchemaForClient, DBSchemaTable, FullFilter, DBSchemaColumns, DBSchema, DBTableSchema } from "prostgles-types";
import { ClientInfo } from "./AuthHandler";
import { CommonTableRules, LocalParams, PRGLIOSocket } from "./DboBuilder";
import { Prostgles, DBHandlerServer, DB } from "./Prostgles";
import type { DBOFullyTyped, PublishFullyTyped } from "./DBSchemaBuilder";
export declare type Method = (...args: any) => (any | Promise<any>);
export declare type PublishMethods<S extends DBSchema | undefined = undefined> = (params: PublishParams<S>) => {
    [key: string]: Method;
} | Promise<{
    [key: string]: Method;
}>;
export declare type Awaitable<T> = T | Promise<T>;
declare type Request = {
    socket?: any;
    httpReq?: any;
};
declare type DboTable = Request & {
    tableName: string;
    localParams: LocalParams;
};
declare type DboTableCommand = Request & DboTable & {
    command: string;
    localParams: LocalParams;
};
import { FieldFilter, SelectParams } from "prostgles-types";
export declare type InsertRequestData = {
    data: object | object[];
    returning: FieldFilter;
};
export declare type SelectRequestData = {
    filter: object;
    params: SelectParams;
};
export declare type DeleteRequestData = {
    filter: object;
    returning: FieldFilter;
};
export declare type UpdateRequestDataOne<R> = {
    filter: FullFilter<R>;
    data: Partial<R>;
    returning: FieldFilter<R>;
};
export declare type UpdateReq<R> = {
    filter: FullFilter<R>;
    data: Partial<R>;
};
export declare type UpdateRequestDataBatch<R> = {
    data: UpdateReq<R>[];
};
export declare type UpdateRequestData<R extends AnyObject = AnyObject> = UpdateRequestDataOne<R> | UpdateRequestDataBatch<R>;
export declare type ValidateRow<R extends AnyObject = AnyObject> = (row: R) => R | Promise<R>;
export declare type ValidateUpdateRow<R extends AnyObject = AnyObject> = (args: {
    update: Partial<R>;
    filter: FullFilter<R>;
}) => R | Promise<R>;
export declare type SelectRule<S extends DBTableSchema | undefined = undefined> = {
    /**
     * Fields allowed to be selected.   Tip: Use false to exclude field
     */
    fields: FieldFilter<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * The maximum number of rows a user can get in a select query. null by default. Unless a null or higher limit is specified 100 rows will be returned by the default
     */
    maxLimit?: number | null;
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     */
    forcedFilter?: FullFilter<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Fields user can filter by
     * */
    filterFields?: FieldFilter<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Validation logic to check/update data for each request
     */
    validate?(args: SelectRequestData): SelectRequestData | Promise<SelectRequestData>;
};
export declare type InsertRule<S extends DBTableSchema | undefined = undefined> = {
    /**
     * Fields allowed to be inserted.   Tip: Use false to exclude field
     */
    fields: SelectRule<S>["fields"];
    /**
     * Data to include/overwrite on each insert
     */
    forcedData?: Partial<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Fields user can view after inserting
     */
    returningFields?: SelectRule<S>["fields"];
    /**
     * Validation logic to check/update data for each request. Happens before publish rule checks (for fields, forcedData/forcedFilter)
     */
    preValidate?: ValidateRow<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Validation logic to check/update data for each request. Happens after publish rule checks (for fields, forcedData/forcedFilter)
     */
    validate?: InsertRule<S>["preValidate"];
};
export declare type UpdateRule<S extends DBTableSchema | undefined = undefined> = {
    /**
     * Fields allowed to be updated.   Tip: Use false/0 to exclude field
     */
    fields: SelectRule<S>["fields"];
    /**
     * Row level FGAC
     * Used when the editable fields change based on the updated row
     * If specified then the fields from the first matching filter table.count({ ...filter, ...updateFilter }) > 0 will be used
     * If none matching then the "fields" will be used
     * Specify in decreasing order of specificity otherwise a more general filter will match first
     */
    dynamicFields?: {
        filter: SelectRule<S>["forcedFilter"];
        fields: SelectRule<S>["fields"];
    }[];
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     * This filter cannot be updated
     */
    forcedFilter?: SelectRule<S>["forcedFilter"];
    /**
     * Data to include/overwrite on each updatDBe
     */
    forcedData?: InsertRule<S>["forcedData"];
    /**
     * Fields user can use to find the updates
     */
    filterFields?: SelectRule<S>["fields"];
    /**
     * Fields user can view after updating
     */
    returningFields?: SelectRule<S>["fields"];
    /**
     * Validation logic to check/update data for each request
     */
    validate?: ValidateUpdateRow<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
};
export declare type DeleteRule<S extends DBTableSchema | undefined = undefined> = {
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     */
    forcedFilter?: FullFilter<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Fields user can filter by
     */
    filterFields?: FieldFilter<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Fields user can view after deleting
     */
    returningFields?: FieldFilter<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
    /**
     * Validation logic to check/update data for each request
     */
    validate?(...args: any[]): UpdateRequestData<S extends DBTableSchema ? DBSchemaColumns<S["columns"]> : AnyObject>;
};
export declare type SyncRule<S extends DBTableSchema | undefined = undefined> = {
    /**
     * Primary keys used in updating data
     */
    id_fields: S extends DBTableSchema ? (keyof S["dataTypes"])[] : string[];
    /**
     * Numerical incrementing fieldname (last updated timestamp) used to sync items
     */
    synced_field: S extends DBTableSchema ? (keyof S["dataTypes"]) : string;
    /**
     * EXPERIMENTAL. Disabled by default. If true then server will attempt to delete any records missing from client.
     */
    allow_delete?: boolean;
    /**
     * Throttle replication transmission in milliseconds. Defaults to 100
     */
    throttle?: number;
    /**
     * Number of rows to send per trip. Defaults to 50
     */
    batch_size?: number;
};
export declare type SubscribeRule = {
    throttle?: number;
};
export declare type ViewRule<S extends DBTableSchema | undefined = undefined> = CommonTableRules & {
    /**
     * What can be read from the table
     */
    select?: SelectRule<S>;
};
export declare type TableRule<S extends DBTableSchema | undefined = undefined> = ViewRule<S> & {
    insert?: InsertRule<S>;
    update?: UpdateRule<S>;
    delete?: DeleteRule<S>;
    sync?: SyncRule<S>;
    subscribe?: SubscribeRule;
};
export declare type PublishViewRule<S extends DBTableSchema | undefined = undefined> = {
    select?: SelectRule<S> | PublishAllOrNothing;
    getColumns?: PublishAllOrNothing;
    getInfo?: PublishAllOrNothing;
};
export declare type PublishTableRule<S extends DBTableSchema | undefined = undefined> = PublishViewRule<S> & {
    insert?: InsertRule<S> | PublishAllOrNothing;
    update?: UpdateRule<S> | PublishAllOrNothing;
    delete?: DeleteRule<S> | PublishAllOrNothing;
    sync?: SyncRule<S>;
    subscribe?: SubscribeRule | PublishAllOrNothing;
};
export declare type ParsedPublishTable = {
    select?: SelectRule;
    getColumns?: true;
    getInfo?: true;
    insert?: InsertRule;
    update?: UpdateRule;
    delete?: DeleteRule;
    sync?: SyncRule;
    subscribe?: SubscribeRule;
    subscribeOne?: SubscribeRule;
};
export declare type PublishParams<S extends DBSchema | undefined = undefined> = {
    sid?: string;
    dbo: DBOFullyTyped<S>;
    db?: DB;
    user?: AnyObject;
    socket: PRGLIOSocket;
};
export declare type RequestParams = {
    dbo?: DBHandlerServer;
    socket?: any;
};
export declare type PublishAllOrNothing = true | "*" | false | null;
export declare type PublishObject<Schema extends DBSchema | undefined = undefined> = {
    [table_name: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing);
};
export declare type ParsedPublishTables = {
    [table_name: string]: ParsedPublishTable;
};
export declare type PublishedResult<Schema extends DBSchema | undefined = undefined> = PublishAllOrNothing | PublishFullyTyped<Schema>;
export declare type Publish<Schema extends DBSchema | undefined = undefined> = PublishedResult<Schema> | ((params: PublishParams<Schema>) => Awaitable<PublishedResult<Schema>>);
export declare class PublishParser {
    publish: any;
    publishMethods?: any;
    publishRawSQL?: any;
    dbo: DBHandlerServer;
    db: DB;
    prostgles: Prostgles;
    constructor(publish: any, publishMethods: any, publishRawSQL: any, dbo: DBHandlerServer, db: DB, prostgles: Prostgles);
    getPublishParams(localParams: LocalParams, clientInfo?: ClientInfo): Promise<PublishParams<any>>;
    getMethods(socket: any): Promise<{}>;
    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket
     * @param user
     */
    getPublish(localParams: LocalParams, clientInfo?: ClientInfo): Promise<PublishObject>;
    getValidatedRequestRuleWusr({ tableName, command, localParams }: DboTableCommand): Promise<TableRule>;
    getValidatedRequestRule({ tableName, command, localParams }: DboTableCommand, clientInfo?: ClientInfo): Promise<TableRule>;
    getTableRules({ tableName, localParams }: DboTable, clientInfo?: ClientInfo): Promise<ParsedPublishTable | undefined>;
    getSchemaFromPublish(socket: any): Promise<{
        schema: TableSchemaForClient;
        tables: DBSchemaTable[];
    }>;
}
export {};
//# sourceMappingURL=PublishParser.d.ts.map
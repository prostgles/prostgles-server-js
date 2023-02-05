import { AnyObject, TableSchemaForClient, DBSchemaTable, FullFilter, Method } from "prostgles-types";
import { AuthResult, SessionUser } from "./AuthHandler";
import { CommonTableRules, LocalParams, PRGLIOSocket, TableOrViewInfo, TableSchemaColumn } from "./DboBuilder";
import { Prostgles, DBHandlerServer, DB } from "./Prostgles";
import type { DBOFullyTyped, PublishFullyTyped } from "./DBSchemaBuilder";
export declare type PublishMethods<S = void, SUser extends SessionUser = SessionUser> = (params: PublishParams<S, SUser>) => {
    [key: string]: Method;
} | Promise<{
    [key: string]: Method;
} | null>;
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
export declare type UpdateRequestDataOne<R extends AnyObject> = {
    filter: FullFilter<R>;
    data: Partial<R>;
    returning: FieldFilter<R>;
};
export declare type UpdateReq<R extends AnyObject> = {
    filter: FullFilter<R>;
    data: Partial<R>;
};
export declare type UpdateRequestDataBatch<R extends AnyObject> = {
    data: UpdateReq<R>[];
};
export declare type UpdateRequestData<R extends AnyObject = AnyObject> = UpdateRequestDataOne<R> | UpdateRequestDataBatch<R>;
export declare type ValidateRow<R extends AnyObject = AnyObject, S = void> = (row: R, dbx: DBOFullyTyped<S>) => R | Promise<R>;
export declare type ValidateUpdateRow<R extends AnyObject = AnyObject, S = void> = (args: {
    update: Partial<R>;
    filter: FullFilter<R>;
}, dbx: DBOFullyTyped<S>) => R | Promise<R>;
export declare type SelectRule<Cols extends AnyObject = AnyObject, S = void> = {
    /**
     * Fields allowed to be selected.
     * Tip: Use false to exclude field
     */
    fields: FieldFilter<Cols>;
    /**
     * Fields allowed to sorted
     * Defaults to the "fields". Use empty array/object to disallow sorting
     */
    orderByFields?: FieldFilter<Cols>;
    /**
     * The maximum number of rows a user can get in a select query. null by default. Unless a null or higher limit is specified 100 rows will be returned by the default
     */
    maxLimit?: number | null;
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     */
    forcedFilter?: FullFilter<Cols, S>;
    /**
     * Fields user can filter by
     * */
    filterFields?: FieldFilter<Cols>;
    /**
     * Validation logic to check/update data for each request
     */
    validate?(args: SelectRequestData): SelectRequestData | Promise<SelectRequestData>;
};
export declare type InsertRule<Cols extends AnyObject = AnyObject, S = void> = {
    /**
     * Fields allowed to be inserted.   Tip: Use false to exclude field
     */
    fields: SelectRule<Cols>["fields"];
    /**
     * Data to include/overwrite on each insert
     */
    forcedData?: Partial<Cols>;
    /**
     * Fields user can view after inserting
     */
    returningFields?: SelectRule<Cols>["fields"];
    /**
     * Validation logic to check/update data for each request. Happens before publish rule checks (for fields, forcedData/forcedFilter)
     */
    preValidate?: ValidateRow<Cols, S>;
    /**
     * Validation logic to check/update data for each request. Happens after publish rule checks (for fields, forcedData/forcedFilter)
     */
    validate?: ValidateRow<Cols, S>;
    /**
     * Validation logic to check/update data after the insert.
     * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
     */
    postValidate?: ValidateRow<Required<Cols>, S>;
};
export declare type UpdateRule<Cols extends AnyObject = AnyObject, S = void> = {
    /**
     * Fields allowed to be updated.   Tip: Use false/0 to exclude field
     */
    fields: SelectRule<Cols>["fields"];
    /**
     * Row level FGAC
     * Used when the editable fields change based on the updated row
     * If specified then the fields from the first matching filter table.count({ ...filter, ...updateFilter }) > 0 will be used
     * If none matching then the "fields" will be used
     * Specify in decreasing order of specificity otherwise a more general filter will match first
     */
    dynamicFields?: {
        filter: FullFilter<Cols, S>;
        fields: SelectRule<Cols>["fields"];
    }[];
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     * This filter cannot be updated
     */
    forcedFilter?: SelectRule<Cols, S>["forcedFilter"];
    /**
     * Data to include/overwrite on each updatDBe
     */
    forcedData?: InsertRule<Cols, S>["forcedData"];
    /**
     * Fields user can use to find the updates
     */
    filterFields?: SelectRule<Cols>["fields"];
    /**
     * Fields user can view after updating
     */
    returningFields?: SelectRule<Cols>["fields"];
    /**
     * Validation logic to check/update data for each request
     */
    validate?: ValidateUpdateRow<Cols, S>;
    /**
     * Validation logic to check/update data after the insert.
     * Happens in the same transaction so upon throwing an error the record will be deleted (not committed)
     */
    postValidate?: ValidateRow<Required<Cols>, S>;
};
export declare type DeleteRule<Cols extends AnyObject = AnyObject, S = void> = {
    /**
     * Filter added to every query (e.g. user_id) to restrict access
     */
    forcedFilter?: SelectRule<Cols, S>["forcedFilter"];
    /**
     * Fields user can filter by
     */
    filterFields: FieldFilter<Cols>;
    /**
     * Fields user can view after deleting
     */
    returningFields?: SelectRule<Cols>["filterFields"];
    /**
     * Validation logic to check/update data for each request
     */
    validate?(...args: any[]): Awaitable<void>;
};
export declare type SyncRule<Cols extends AnyObject = AnyObject> = {
    /**
     * Primary keys used in updating data
     */
    id_fields: (keyof Cols)[];
    /**
     * Numerical incrementing fieldname (last updated timestamp) used to sync items
     */
    synced_field: keyof Cols;
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
export declare type ViewRule<S extends AnyObject = AnyObject> = CommonTableRules & {
    /**
     * What can be read from the table
     */
    select?: SelectRule<S>;
};
export declare type TableRule<RowType extends AnyObject = AnyObject, S = void> = ViewRule<RowType> & {
    insert?: InsertRule<RowType, S>;
    update?: UpdateRule<RowType, S>;
    delete?: DeleteRule<RowType, S>;
    sync?: SyncRule<RowType>;
    subscribe?: SubscribeRule;
};
export declare type PublishViewRule<Col extends AnyObject = AnyObject, S = void> = {
    select?: SelectRule<Col, S> | PublishAllOrNothing;
    getColumns?: PublishAllOrNothing;
    getInfo?: PublishAllOrNothing;
};
export declare type PublishTableRule<Col extends AnyObject = AnyObject, S = void> = PublishViewRule<Col, S> & {
    insert?: InsertRule<Col, S> | PublishAllOrNothing;
    update?: UpdateRule<Col, S> | PublishAllOrNothing;
    delete?: DeleteRule<Col, S> | PublishAllOrNothing;
    sync?: SyncRule<Col>;
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
export declare type PublishParams<S = void, SUser extends SessionUser = SessionUser> = {
    sid?: string;
    dbo: DBOFullyTyped<S>;
    db: DB;
    user?: SUser["user"];
    socket: PRGLIOSocket;
    tables: {
        name: string;
        info: TableOrViewInfo;
        columns: TableSchemaColumn[];
    }[];
};
export declare type RequestParams = {
    dbo?: DBHandlerServer;
    socket?: any;
};
export declare type PublishAllOrNothing = true | "*" | false | null;
declare type PublishObject = {
    [table_name: string]: (PublishTableRule | PublishViewRule | PublishAllOrNothing);
};
export declare type ParsedPublishTables = {
    [table_name: string]: ParsedPublishTable;
};
export declare type PublishedResult<Schema = void> = PublishAllOrNothing | PublishFullyTyped<Schema>;
export declare type Publish<Schema = void, SUser extends SessionUser = SessionUser> = PublishedResult<Schema> | ((params: PublishParams<Schema, SUser>) => Awaitable<PublishedResult<Schema>>);
export declare class PublishParser {
    publish: any;
    publishMethods?: PublishMethods<void, SessionUser<AnyObject, AnyObject>> | undefined;
    publishRawSQL?: any;
    dbo: DBHandlerServer;
    db: DB;
    prostgles: Prostgles;
    constructor(publish: any, publishMethods: PublishMethods<void, SessionUser<AnyObject, AnyObject>> | undefined, publishRawSQL: any, dbo: DBHandlerServer, db: DB, prostgles: Prostgles);
    getPublishParams(localParams: LocalParams, clientInfo?: AuthResult): Promise<PublishParams>;
    getAllowedMethods(socket: any, userData?: AuthResult): Promise<{
        [key: string]: Method;
    }>;
    /**
     * Parses the first level of publish. (If false then nothing if * then all tables and views)
     * @param socket
     * @param user
     */
    getPublish(localParams: LocalParams, clientInfo?: AuthResult): Promise<PublishObject>;
    getValidatedRequestRuleWusr({ tableName, command, localParams }: DboTableCommand): Promise<TableRule>;
    getValidatedRequestRule({ tableName, command, localParams }: DboTableCommand, clientInfo?: AuthResult): Promise<TableRule>;
    getTableRules({ tableName, localParams }: DboTable, clientInfo?: AuthResult): Promise<ParsedPublishTable | undefined>;
    getSchemaFromPublish(socket: any, userData?: AuthResult): Promise<{
        schema: TableSchemaForClient;
        tables: DBSchemaTable[];
    }>;
}
export {};
//# sourceMappingURL=PublishParser.d.ts.map
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { ColumnInfo, SQLOptions, DbJoinMaker, PG_COLUMN_UDT_DATA_TYPE, TS_PG_Types, TableInfo as TInfo, SQLHandler, AnyObject, ProstglesError, EXISTS_KEY } from "prostgles-types";
export type SortItem = {
    asc: boolean;
    nulls?: "first" | "last";
    nullEmpty?: boolean;
} & ({
    fieldQuery: string;
} | {
    fieldPosition: number;
});
export type ParsedMedia = Required<Pick<Media, "extension" | "content_type">>;
export type Media = {
    "id"?: string;
    "title"?: string;
    "extension"?: string;
    "content_type"?: string;
    "content_length"?: number;
    "url"?: string;
    "added"?: Date;
    "signed_url"?: string;
    "signed_url_expires"?: number;
    "name"?: string;
    "original_name"?: string;
    "etag"?: string;
    deleted?: string | null;
    deleted_from_storage?: string | null;
};
export type TxCB<TH = TableHandlers> = {
    (t: TH & Pick<DBHandlerServer, "sql">, _t: pgPromise.ITask<{}>): (any | void);
};
export type TX<TH = TableHandlers> = {
    (t: TxCB<TH>): Promise<(any | void)>;
};
export type TableHandlers = {
    [key: string]: Partial<TableHandler> | TableHandler;
};
export type DBHandlerServer<TH = TableHandlers> = TH & Partial<DbJoinMaker> & {
    sql?: SQLHandler;
} & {
    tx?: TX<TH>;
};
import { FieldSpec } from "./DboBuilder/QueryBuilder/Functions";
import { Join, Prostgles, DB } from "./Prostgles";
import { PublishParser, PublishAllOrNothing } from "./PublishParser";
import { PubSubManager, BasicCallback } from "./PubSubManager/PubSubManager";
import { JoinPaths, ViewHandler } from "./DboBuilder/ViewHandler";
type PGP = pgPromise.IMain<{}, pg.IClient>;
export declare const pgp: PGP;
export type TableInfo = TInfo & {
    schema: string;
    name: string;
    oid: number;
    comment: string;
    columns: ColumnInfo[];
};
export type ViewInfo = TableInfo & {
    parent_tables: string[];
};
export type TableOrViewInfo = TableInfo & ViewInfo & {
    is_view: boolean;
};
export type PRGLIOSocket = {
    readonly id: string;
    readonly handshake?: {
        query?: Record<string, string>;
        headers?: AnyObject & {
            cookie?: string;
        };
        auth?: Record<string, any>;
    };
    readonly on: (channel: string, params: any, cb?: (err: any, res?: any) => void) => Promise<void>;
    readonly emit: (channel: string, message: any, cb?: BasicCallback) => any;
    readonly once: (channel: string, cb: (_data: any, cb: BasicCallback) => void) => void;
    readonly removeAllListeners: (channel: string) => void;
    readonly disconnect: () => void;
    readonly request: {
        url: string;
    };
    /** Used for session caching */
    __prglCache?: {
        session: BasicSession;
        user: UserLike;
        clientUser: AnyObject;
    };
    _user?: AnyObject;
    /** Used for publish error caching */
    prostgles?: AnyObject;
};
export type LocalParams = {
    httpReq?: any;
    socket?: PRGLIOSocket;
    func?: () => any;
    isRemoteRequest?: {
        user?: UserLike | undefined;
    };
    testRule?: boolean;
    tableAlias?: string;
    tx?: {
        dbTX: TableHandlers;
        t: pgPromise.ITask<{}>;
    };
    returnQuery?: boolean | "noRLS";
    returnNewQuery?: boolean;
    nestedInsert?: {
        depth: number;
        previousData: AnyObject;
        previousTable: string;
        referencingColumn?: string;
    };
};
export declare function escapeTSNames(str: string, capitalize?: boolean): string;
export type Aggregation = {
    field: string;
    query: string;
    alias: string;
    getQuery: (alias: string) => string;
};
export type Filter = AnyObject | {
    $and: Filter[];
} | {
    $or: Filter[];
};
export type JoinInfo = {
    expectOne?: boolean;
    paths: {
        /**
         * The table that JOIN ON columns refer to.
         * columns in index = 1 refer to this table. index = 0 columns refer to previous JoinInfo.table
         */
        table: string;
        /**
         * Source and target JOIN ON columns
         * Each inner array group will be combined with AND and outer arrays with OR to allow multiple references to the same table
         * e.g.:    [[source_table_column: string, table_column: string]]
         */
        on: [string, string][][];
        /**
         * Source table name
         */
        source: string;
        /**
         * Target table name
         */
        target: string;
    }[];
};
import { Graph } from "./shortestPath";
export type CommonTableRules = {
    /**
     * True by default. Allows clients to get column information on any columns that are allowed in (select, insert, update) field rules.
     */
    getColumns?: PublishAllOrNothing;
    /**
     * True by default. Allows clients to get table information (oid, comment, label, has_media).
     */
    getInfo?: PublishAllOrNothing;
};
export type ValidatedTableRules = CommonTableRules & {
    allColumns: FieldSpec[];
    select: {
        fields: string[];
        orderByFields: string[];
        filterFields: string[];
        forcedFilter: any;
        maxLimit: number | null;
    };
    update: {
        fields: string[];
        returningFields: string[];
        filterFields: string[];
        forcedFilter: any;
        forcedData: any;
    };
    insert: {
        fields: string[];
        returningFields: string[];
        forcedData: any;
    };
    delete: {
        filterFields: string[];
        forcedFilter: any;
        returningFields: string[];
    };
};
export declare function makeErrorFromPGError(err: any, localParams?: LocalParams, view?: ViewHandler, allowedKeys?: string[]): Promise<never>;
/**
 * Ensure the error is an Object and has
 */
export declare function parseError(e: any, caller: string): ProstglesError;
export type ExistsFilterConfig = {
    key: string;
    f2: Filter;
    existType: EXISTS_KEY;
    tables: string[];
    isJoined: boolean;
    shortestJoin: boolean;
};
import { BasicSession, UserLike } from "./AuthHandler";
import { TableHandler } from "./DboBuilder/TableHandler";
export declare class DboBuilder {
    tablesOrViews?: TableSchema[];
    /**
     * Used in obtaining column names for error messages
     */
    constraints?: PGConstraint[];
    db: DB;
    schema: string;
    dbo: DBHandlerServer;
    _pubSubManager?: PubSubManager;
    /**
     * Used for db.sql field type details
     */
    DATA_TYPES: {
        oid: string;
        typname: PG_COLUMN_UDT_DATA_TYPE;
    }[] | undefined;
    USER_TABLES: {
        /**
         * oid of the table
         */
        relid: number;
        relname: string;
        schemaname: string;
        pkey_columns: string[] | null;
    }[] | undefined;
    USER_TABLE_COLUMNS: {
        relid: number;
        schemaname: string;
        relname: string;
        column_name: string;
        udt_name: string;
        ordinal_position: number;
    }[] | undefined;
    getPubSubManager: () => Promise<PubSubManager>;
    pojoDefinitions?: string[];
    tsTypesDefinition?: string;
    joinGraph?: Graph;
    joinPaths: JoinPaths;
    prostgles: Prostgles;
    publishParser?: PublishParser;
    onSchemaChange?: (event: {
        command: string;
        query: string;
    }) => void;
    private constructor();
    private init;
    static create: (prostgles: Prostgles) => Promise<DboBuilder>;
    destroy(): void;
    _joins?: Join[];
    get joins(): Join[];
    set joins(j: Join[]);
    getJoinPaths(): JoinPaths;
    parseJoins(): Promise<JoinPaths>;
    runSQL: (query: string, params: any, options: SQLOptions | undefined, localParams?: LocalParams) => Promise<any>;
    build(): Promise<DBHandlerServer>;
    getTX: (cb: TxCB) => Promise<any>;
}
export type TableSchemaColumn = ColumnInfo & {
    privileges: {
        privilege_type: "INSERT" | "REFERENCES" | "SELECT" | "UPDATE";
        is_grantable: "YES" | "NO";
    }[];
};
export type TableSchema = {
    schema: string;
    name: string;
    oid: number;
    comment: string;
    columns: TableSchemaColumn[];
    is_view: boolean;
    view_definition: string | null;
    parent_tables: string[];
    privileges: {
        insert: boolean;
        select: boolean;
        update: boolean;
        delete: boolean;
    };
};
type PGConstraint = {
    /**
     * Constraint type
     */
    contype: "u" | "p" | "c";
    /**
     * Column ordinal positions
     */
    conkey: number[];
    /**
     * Constraint name
     */
    conname: string;
    /**
     * Table name
     */
    relname: string;
};
export declare function isPlainObject(o: any): o is Record<string, any>;
export declare function postgresToTsType(udt_data_type: PG_COLUMN_UDT_DATA_TYPE): keyof typeof TS_PG_Types;
export declare const prepareSort: (items: SortItem[], excludeOrder?: boolean) => string;
export declare const canEXECUTE: (db: DB) => Promise<boolean>;
export declare const withUserRLS: (localParams: LocalParams | undefined, query: string) => string;
export {};
//# sourceMappingURL=DboBuilder.d.ts.map
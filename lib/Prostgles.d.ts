/// <reference types="node" />
import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { FileManager, ImageOptions, LocalConfig, S3Config } from "./FileManager/FileManager";
import { SchemaWatch } from "./SchemaWatch";
import AuthHandler, { Auth, SessionUser, AuthRequestParams } from "./AuthHandler";
import TableConfigurator, { TableConfig } from "./TableConfig/TableConfig";
import { DboBuilder, DBHandlerServer, PRGLIOSocket } from "./DboBuilder";
export { DBHandlerServer };
export type PGP = pgPromise.IMain<{}, pg.IClient>;
import { AnyObject, FileColumnConfig } from "prostgles-types";
import { Publish, PublishMethods, PublishParams, PublishParser } from "./PublishParser";
import { DBEventsManager } from "./DBEventsManager";
export type DB = pgPromise.IDatabase<{}, pg.IClient>;
type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
type DbConnectionOpts = pg.IDefaults;
export declare const TABLE_METHODS: readonly ["update", "find", "findOne", "insert", "delete", "upsert"];
export declare const JOIN_TYPES: readonly ["one-many", "many-one", "one-one", "many-many"];
export type Join = {
    tables: [string, string];
    on: {
        [key: string]: string;
    }[];
    type: typeof JOIN_TYPES[number];
};
export type Joins = Join[] | "inferred";
type Keywords = {
    $and: string;
    $or: string;
    $not: string;
};
export type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
};
export type ExpressApp = {
    get: (routePath: string, cb: (req: {
        params: {
            name: string;
        };
        cookies: {
            sid: string;
        };
    }, res: {
        redirect: (redirectUrl: string) => any;
        contentType: (type: string) => void;
        sendFile: (fileName: string, opts?: {
            root: string;
        }) => any;
        status: (code: number) => {
            json: (response: AnyObject) => any;
        };
    }) => any) => any;
    _router?: {
        stack?: {
            handle: Function;
            path: undefined;
            keys?: any[];
            route?: {
                path?: string;
            };
        }[];
    };
};
/**
 * Allows uploading and downloading files.
 * Currently supports only S3.
 *
 * @description
 * Will create a media table that contains file metadata and urls
 * Inserting a file into this table through prostgles will upload it to S3 and insert the relevant metadata into the media table
 * Requesting a file from HTTP GET {fileUrlPath}/{fileId} will:
 *  1. check auth (if provided)
 *  2. check the permissions in publish (if provided)
 *  3. redirect the request to the signed url (if allowed)
 *
 * Specifying referencedTables will:
 *  1. create a column in that table called media
 *  2. create a lookup table lookup_media_{referencedTable} that joins referencedTable to the media table
 */
export type FileTableConfig = {
    tableName?: string;
    /**
     * GET path used in serving media. defaults to /${tableName}
     */
    fileServeRoute?: string;
    awsS3Config?: S3Config;
    localConfig?: LocalConfig;
    /**
     * If defined the the files will not be deleted immediately
     * Instead, the "deleted" field will be updated to the current timestamp and after the day interval provided in "deleteAfterNDays" the files will be deleted
     * "checkIntervalMinutes" is the frequency in hours at which the files ready for deletion are deleted
     */
    delayedDelete?: {
        /**
         * Minimum amount of time measured in days for which the files will not be deleted after requesting delete
         */
        deleteAfterNDays: number;
        /**
         * How freuquently the files will be checked for deletion delay
         */
        checkIntervalHours?: number;
    };
    expressApp: ExpressApp;
    referencedTables?: {
        [tableName: string]: "one" | "many"
        /**
         * If defined then will try to create (if necessary) a column in the files table which will reference this table's primary key (must have one)
         * */
        /**
         * If defined then will try to create (if necessary) this column which will reference files_table(id)
         * Prostgles UI will use these hints (obtained through tableHandler.getInfo())
         * */
         | {
            type: "column";
            referenceColumns: Record<string, FileColumnConfig>;
        };
    };
    imageOptions?: ImageOptions;
};
export type ProstglesInitOptions<S = void, SUser extends SessionUser = SessionUser> = {
    dbConnection: DbConnection;
    dbOptions?: DbConnectionOpts;
    tsGeneratedTypesDir?: string;
    io?: any;
    publish?: Publish<S, SUser>;
    publishMethods?: PublishMethods<S, SUser>;
    publishRawSQL?(params: PublishParams<S, SUser>): ((boolean | "*") | Promise<(boolean | "*")>);
    joins?: Joins;
    schema?: string;
    sqlFilePath?: string;
    onReady: OnReadyCallback<S>;
    transactions?: string | boolean;
    wsChannelNamePrefix?: string;
    /**
     * Use for connection verification. Will disconnect socket on any errors
     */
    onSocketConnect?: (args: AuthRequestParams<S, SUser> & {
        socket: PRGLIOSocket;
    }) => void | Promise<void>;
    onSocketDisconnect?: (args: AuthRequestParams<S, SUser> & {
        socket: PRGLIOSocket;
    }) => void | Promise<void>;
    auth?: Auth<S, SUser>;
    DEBUG_MODE?: boolean;
    watchSchemaType?: 
    /**
     * Will set database event trigger for schema changes. Requires superuser
     * Default
     */
    "DDL_trigger"
    /**
     * Will check client queries for schema changes
     * fallback if DDL not possible
     */
     | "prostgles_queries"
    /**
     * Schema checked for changes every 'checkIntervalMillis" milliseconds
     */
     | {
        checkIntervalMillis: number;
    };
    /**
     * If truthy then DBoGenerated.d.ts will be updated and "onReady" will be called with new schema on both client and server
     */
    watchSchema?: boolean
    /**
     * Will only rewrite the DBoGenerated.d.ts found in tsGeneratedTypesDir
     * This is meant to be used in development when server restarts on file change
     */
     | "hotReloadMode"
    /**
     * Function called when schema changes. Nothing else triggered
     */
     | ((event: {
        command: string;
        query: string;
    }) => void);
    keywords?: Keywords;
    onNotice?: (notice: AnyObject, message?: string) => void;
    fileTable?: FileTableConfig;
    /**
     * Creates tables and provides UI labels, autocomplete and hints for a given json structure
     */
    tableConfig?: TableConfig;
    tableConfigMigrations?: {
        /**
         * If false then prostgles won't start on any tableConfig error
         * true by default
         */
        silentFail?: boolean;
        version: number;
        /** Table that will contain the schema version number and the tableConfig
         * Defaults to schema_version
        */
        versionTableName?: string;
        /**
         * Script run before tableConfig is loaded IF an older schema_version is present
         */
        onMigrate: (args: {
            db: DB;
            oldVersion: number | undefined;
            getConstraints: (table: string, column?: string, types?: ColConstraint["type"][]) => Promise<ColConstraint[]>;
        }) => void;
    };
};
export type OnReady = {
    dbo: DBHandlerServer;
    db: DB;
};
type OnReadyCallback<S = void> = (dbo: DBOFullyTyped<S>, db: DB) => any;
export type InitResult = {
    db: DBOFullyTyped;
    _db: DB;
    pgp: PGP;
    io?: any;
    destroy: () => Promise<boolean>;
    /**
     * Generated database public schema TS types for all tables and views
     */
    getTSSchema: () => string;
    update: (newOpts: Pick<ProstglesInitOptions, "fileTable">) => Promise<void>;
    restart: () => Promise<InitResult>;
};
import { DBOFullyTyped } from "./DBSchemaBuilder";
import { ColConstraint } from "./TableConfig/getConstraintDefinitionQueries";
export declare class Prostgles {
    opts: ProstglesInitOptions;
    db?: DB;
    pgp?: PGP;
    dbo?: DBHandlerServer;
    _dboBuilder?: DboBuilder;
    get dboBuilder(): DboBuilder;
    set dboBuilder(d: DboBuilder);
    publishParser?: PublishParser;
    authHandler?: AuthHandler;
    schemaWatch?: SchemaWatch;
    keywords: {
        $filter: string;
        $and: string;
        $or: string;
        $not: string;
    };
    private loaded;
    dbEventsManager?: DBEventsManager;
    fileManager?: FileManager;
    tableConfigurator?: TableConfigurator;
    isMedia(tableName: string): boolean;
    constructor(params: ProstglesInitOptions);
    destroyed: boolean;
    onSchemaChange(event: {
        command: string;
        query: string;
    }): Promise<void>;
    checkDb(): void;
    getTSFileName(): {
        fileName: string;
        fullPath: string;
    };
    private getFileText;
    getTSFileContent: () => string;
    /**
     * Will write the Schema Typescript definitions to file (tsGeneratedTypesDir)
     */
    writeDBSchema(force?: boolean): void;
    /**
     * Will re-create the dbo object
     */
    refreshDBO: () => Promise<DBHandlerServer>;
    private initWatchSchema;
    initFileTable: () => Promise<void>;
    isSuperUser: boolean;
    schema_checkIntervalMillis?: NodeJS.Timeout;
    init(onReady: OnReadyCallback): Promise<InitResult>;
    runSQLFile(filePath: string): Promise<any[][]>;
    connectedSockets: any[];
    setSocketEvents(): Promise<void>;
    pushSocketSchema: (socket: any) => Promise<void>;
}
export declare function isSuperUser(db: DB): Promise<boolean>;
//# sourceMappingURL=Prostgles.d.ts.map
import { FileColumnConfig } from "prostgles-types";
import { Auth, AuthRequestParams, SessionUser } from "./Auth/AuthTypes";
import { EventTriggerTagFilter } from "./Event_Trigger_Tags";
import {
  CloudClient,
  ImageOptions,
  LocalConfig,
} from "./FileManager/FileManager";
import { DbConnection, OnReadyCallback } from "./initProstgles";
import { EventInfo } from "./Logging";
import { ExpressApp, RestApiConfig } from "./RestApi";
import { OnSchemaChangeCallback } from "./SchemaWatch/SchemaWatch";
import { ColConstraint } from "./TableConfig/getConstraintDefinitionQueries";
import { TableConfig } from "./TableConfig/TableConfig";

import { PRGLIOSocket } from "./DboBuilder/DboBuilder";

import pgPromise from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";
import { AnyObject } from "prostgles-types";
import type { Server } from "socket.io";
import { DB } from "./Prostgles";
import {
  Publish,
  PublishMethods,
  PublishParams,
} from "./PublishParser/PublishParser";

/**
 * Allows uploading and downloading files.
 * Currently supports only S3.
 *
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
  /**
   * Name of the table that will contain the file metadata.
   * Defaults to "files"
   */
  tableName?: string;

  /**
   * GET path used in serving media. defaults to /${tableName}
   */
  fileServeRoute?: string;

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

  /**
   * Express server instance
   */
  expressApp: ExpressApp;

  /**
   * Used to specify which tables will have a file column and allowed file types.
   *
   * Specifying referencedTables will:
   *  1. create a column in that table called media
   *  2. create a lookup table lookup_media_{referencedTable} that joins referencedTable to the media table
   */
  referencedTables?: {
    [tableName: string]: /**
     * Will try to create (if necessary) these columns which will reference files_table(id)
     * Prostgles UI will use these hints (obtained through tableHandler.getInfo())
     * */
    { type: "column"; referenceColumns: Record<string, FileColumnConfig> };
  };
  imageOptions?: ImageOptions;

  /**
   * Callbacks for file upload and download.
   * Used for custom file handling.
   */
  cloudClient?: CloudClient;

  /**
   * Local file storage configuration.
   */
  localConfig?: LocalConfig;
};

export const JOIN_TYPES = [
  "one-many",
  "many-one",
  "one-one",
  "many-many",
] as const;
export type Join = {
  tables: [string, string];
  on: { [key: string]: string }[]; // Allow multi references to table
  type: (typeof JOIN_TYPES)[number];
};
type Joins = Join[] | "inferred";

export type ProstglesInitOptions<
  S = void,
  SUser extends SessionUser = SessionUser,
> = {
  /**
   * Database connection details and options
   */
  dbConnection: DbConnection;

  /**
   * Called when the prostgles server is ready to accept connections.
   * It waits for auth, tableConfig and other async configurations to complete before executing
   */
  onReady: OnReadyCallback<S>;

  /**
   * Path to the directory where the generated types (`DBGeneratedSchema.d.ts`) will be saved.
   * This file exports a `DBGeneratedSchema` type which contains types for the database tables and
   * can be used as a generic type input for the prostgles instances to ensure type safety
   */
  tsGeneratedTypesDir?: string;

  /**
   * Socket.IO server instance object required to allow clients to connect through websockets
   */
  io?: Server;

  /**
   * Rest API configuration.
   * The REST API allows interacting with the database similarly to the websocket connection.
   * with the exception of subscriptions and realtime features.
   *
   * POST Routes:
   * - /api/db/:tableName/:command
   * - /api/db/sql
   * - /api/methods/:method
   * - /api/schema
   *
   * Example request:
   * ```typescript
   * const res = await fetch(
   *  `http://127.0.0.1:3001/api/db/items/findOne`,
   *  {
   *    method: "POST",
   *    headers: new Headers({
   *      'Authorization': `Bearer ${Buffer.from(token, "utf-8").toString("base64")}`,
   *      'Accept': 'application/json',
   *      'Content-Type': 'application/json'
   *    }),
   *    body: JSON.stringify([{ id: 1 }]),
   *  }
   * );
   * ```
   */
  restApi?: RestApiConfig;

  /**
   * If true then schema watch, subscriptions and syncs will be disabled.
   * No `prostgles` schema will be created which is needed for the realtime features.
   * This is useful when you want to connect to a database and prevent any changes to the schema
   */
  disableRealtime?: boolean;

  /**
   * Data access rules applied to clients.
   * By default, nothing is allowed.
   */
  publish?: Publish<S, SUser>;

  /**
   * If defined and resolves to true then the connected client can run SQL queries
   */
  publishRawSQL?(
    params: PublishParams<S, SUser>,
  ): (boolean | "*") | Promise<boolean | "*">;

  /**
   * Server-side functions that can be invoked by the client
   */
  publishMethods?: PublishMethods<S, SUser>;

  /**
   * If true then will test all table methods on each socket connect.
   * Not recommended for production
   */
  testRulesOnConnect?: boolean;

  /**
   * Allows defining table relationships that can then be used in filters and data inserts:
   *  - `infered` - uses the foreign keys to infer the joins
   *  - `Join[]` - specifies the joins manually
   */
  joins?: Joins;

  /**
   * If defined then the specified schemas are included/excluded from the prostgles schema.
   * By default only current_schema() is included.
   */
  schemaFilter?: Record<string, 1> | Record<string, 0>;

  /**
   * Path to a SQL file that will be executed on startup (but before onReady)
   */
  sqlFilePath?: string;

  /**
   * If true then will allow transactions on the server through the db.tx method:
   * ```typescript
   *  db.tx(async t => {
   *    await t.items.insert({ name: "a" });
   *    throw new Error("rollback");
   *  })
   * ```
   */
  transactions?: boolean;

  /**
   * Called when a socket connects
   * Use for connection verification. Will disconnect socket on any errors
   */
  onSocketConnect?: (
    args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket },
  ) => void | Promise<void>;

  /**
   * Called when a socket disconnects
   */
  onSocketDisconnect?: (
    args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket },
  ) => void | Promise<void>;

  /**
   * Auth configuration.
   * Supports email and OAuth strategies
   */
  auth?: Auth<S, SUser>;

  /**
   * Used internally for debugging
   */
  DEBUG_MODE?: boolean;

  /**
   * Callback called when a query is executed.
   * Useful for logging or debugging
   */
  onQuery?: (error: any, ctx: pgPromise.IEventContext<pg.IClient>) => void;

  /**
   * What schema change watcher to use when watchSchema is enabled:
   * - `"DDL_trigger"` - (default) - Use a database event trigger for schema changes. Requires superuser.
   * - `"prostgles_queries"` - Check db.sql() initiated queries for schema changes. Any other queries are ignored.
   */
  watchSchemaType?: "DDL_trigger" | "prostgles_queries";

  /**
   * Reloads schema on schema change.
   * Either calls the provided callback or triggers "onReady" on both the server
   * and any connected clients when schema changes and also updates `DBGeneratedSchema.d.ts` if enabled.
   * Options:
   * - `true` - "onReady" call and "DBGeneratedSchema" rewrite
   * - `EventTriggerTagFilter` - same as `true` but only on specified events
   * - `"hotReloadMode"` - only rewrites `DBGeneratedSchema.d.ts`. Used in development when server restarts on file change.
   * - `OnSchemaChangeCallback` - custom callback to be fired. Nothing else triggered
   * Useful for development
   */
  watchSchema?:
    | boolean
    | EventTriggerTagFilter
    | "hotReloadMode"
    | OnSchemaChangeCallback;

  /**
   * Called when a notice is received from the database
   */
  onNotice?: (notice: AnyObject, message?: string) => void;

  /**
   * Enables file storage and serving.
   * Currently supports saving files locally or to AWS S3.
   * By designating a file table files can be inserted through the table handler:
   * ```typescript
   * const file = await db.files.insert(
   *    { file: new Buffer("file content"), name: "file.txt" },
   *    { returnType: "*" }
   * );
   *
   * const fileUrl = file.url;
   * ```
   */
  fileTable?: FileTableConfig;

  /**
   * Define tables through a JSON-schema like object.
   * Allows adding runtime JSONB validation and type safety.
   * Should be used with caution because it tends to revert any changes
   * made to the database schema through SQL queries
   */
  tableConfig?: TableConfig;

  /**
   * Migration logic used when the new tableConfig version is higher than the one in the database.
   * By default server will fail to start if the tableConfig schema changes cannot be applied without errors
   */
  tableConfigMigrations?: TableConfigMigrations;

  /**
   * Usefull for logging or debugging
   */
  onLog?: (evt: EventInfo) => Promise<void>;
};

type TableConfigMigrations = {
  /**
   * If false then prostgles won't start on any tableConfig error
   * true by default
   */
  silentFail?: boolean;

  /**
   * Version number that must be increased on each schema change.
   */
  version: number;

  /** Table that will contain the schema version number and the tableConfig
   * Defaults to schema_version
   */
  versionTableName?: string;

  /**
   * Script executed before tableConfig is loaded and IF an older schema_version is present.
   * Any data conflicting with the new schema changes should be resolved here.
   */
  onMigrate: OnMigrate;
};

type OnMigrate = (args: {
  db: DB;
  oldVersion: number | undefined;
  getConstraints: (
    table: string,
    column?: string,
    types?: ColConstraint["type"][],
  ) => Promise<ColConstraint[]>;
}) => void;

import { FileColumnConfig } from "prostgles-types";
import { Auth, AuthRequestParams, SessionUser } from "./Auth/AuthTypes";
import { EventTriggerTagFilter } from "./Event_Trigger_Tags";
import { CloudClient, ImageOptions, LocalConfig } from "./FileManager/FileManager";
import { EventInfo } from "./Logging";
import { ExpressApp } from "./RestApi";
import { OnSchemaChangeCallback } from "./SchemaWatch/SchemaWatch";
import { ColConstraint } from "./TableConfig/getConstraintDefinitionQueries";
import { DbConnection, DbConnectionOpts, OnReadyCallback } from "./initProstgles";
import { RestApiConfig } from "./RestApi";
import { TableConfig } from "./TableConfig/TableConfig";

import { PRGLIOSocket } from "./DboBuilder/DboBuilder";

import { AnyObject } from "prostgles-types";
import type { Server } from "socket.io";
import { Publish, PublishMethods, PublishParams } from "./PublishParser/PublishParser";
import { DB } from "./Prostgles";
import pgPromise from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";

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
  tableName?: string /* defaults to 'media' */;

  /**
   * GET path used in serving media. defaults to /${tableName}
   */
  fileServeRoute?: string;

  cloudClient?: CloudClient;
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
    [tableName: string]: /**
     * If defined then will try to create (if necessary) these columns which will reference files_table(id)
     * Prostgles UI will use these hints (obtained through tableHandler.getInfo())
     * */
    { type: "column"; referenceColumns: Record<string, FileColumnConfig> };
  };
  imageOptions?: ImageOptions;
};

type Keywords = {
  $and: string;
  $or: string;
  $not: string;
};

export const JOIN_TYPES = ["one-many", "many-one", "one-one", "many-many"] as const;
export type Join = {
  tables: [string, string];
  on: { [key: string]: string }[]; // Allow multi references to table
  type: (typeof JOIN_TYPES)[number];
};
type Joins = Join[] | "inferred";

export type ProstglesInitOptions<S = void, SUser extends SessionUser = SessionUser> = {
  dbConnection: DbConnection;
  /**
   * Called when the prostgles server is ready to accept connections.
   * It waits for auth, tableConfig and other async configurations to complete before executing
   */
  onReady: OnReadyCallback<S>;
  /**
   * @deprecated
   */
  // dbOptions?: DbConnectionOpts;

  /**
   * Path to the directory where the generated types (`DBGeneratedSchema.d.ts`) will be saved
   * This file exports a `DBGeneratedSchema` type which contains types for the database tables and
   * can be used as a generic type input for the prostgles instances to ensure type safety
   */
  tsGeneratedTypesDir?: string;

  /**
   * If true then schema watch, subscriptions and syncs will be disabled.
   * No `prostgles` schema will be created which is needed for the realtime features.
   * This is useful when you want to connect to a database and prevent any changes to the schema
   */
  disableRealtime?: boolean;

  /**
   * Socket.IO server instance object
   */
  io?: Server;

  /**
   * Data access rules applied to clients.
   * By default, nothing is allowed.
   */
  publish?: Publish<S, SUser>;

  /**
   * If true then will test all table methods on each socket connect.
   * Not recommended for production
   */
  testRulesOnConnect?: boolean;

  /**
   * Custom methods that can be called from the client
   */
  publishMethods?: PublishMethods<S, SUser>;

  /**
   * If defined and resolves to true then the connected client can run SQL queries
   */
  publishRawSQL?(params: PublishParams<S, SUser>): (boolean | "*") | Promise<boolean | "*">;

  /**
   * Allows defining joins between tables:
   *  - `infered` - uses the foreign keys to infer the joins
   *  - `Join[]` - specifies the joins manually
   */
  joins?: Joins;

  /**
   * If defined then the specified schemas are included/excluded from the prostgles schema.
   * By default the `public` schema is included.
   */
  schema?: Record<string, 1> | Record<string, 0>;

  /**
   * Path to a SQL file that will be executed on startup (but before onReady)
   */
  sqlFilePath?: string;
  transactions?: string | boolean;
  wsChannelNamePrefix?: string;

  /**
   * Called when a socket connects
   * Use for connection verification. Will disconnect socket on any errors
   */
  onSocketConnect?: (
    args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket }
  ) => void | Promise<void>;

  /**
   * Called when a socket disconnects
   */
  onSocketDisconnect?: (
    args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket }
  ) => void | Promise<void>;

  /**
   * Auth configuration.
   * Supports email and OAuth strategies
   */
  auth?: Auth<S, SUser>;
  DEBUG_MODE?: boolean;

  /**
   * Callback called when a query is executed.
   * Useful for logging or debugging
   */
  onQuery?: (error: any, ctx: pgPromise.IEventContext<pg.IClient>) => void;
  watchSchemaType?: /**
   * Will set database event trigger for schema changes. Requires superuser
   * Default
   */
  | "DDL_trigger"

    /**
     * Will check client queries for schema changes
     * fallback if DDL not possible
     */
    | "prostgles_queries";

  /**
   * If truthy then DBGeneratedSchema.d.ts will be updated
   * and "onReady" will be called with new schema on both client and server
   */
  watchSchema?: /**
   * Will listen only to few events (create table/view)
   */
  | boolean

    /**
     * Will listen to specified events (or all if "*" is specified)
     */
    | EventTriggerTagFilter

    /**
     * Will only rewrite the DBoGenerated.d.ts found in tsGeneratedTypesDir
     * This is meant to be used in development when server restarts on file change
     */
    | "hotReloadMode"

    /**
     * Function called when schema changes. Nothing else triggered
     */
    | OnSchemaChangeCallback;

  keywords?: Keywords;
  onNotice?: (notice: AnyObject, message?: string) => void;

  /**
   * Enables file storage and serving.
   * Currently supports saving files locally or to AWS S3
   */
  fileTable?: FileTableConfig;

  /**
   * Rest API configuration.
   * The REST API allows interacting with the database similarly to the socket connection
   * with the exception of subscriptions and realtime features
   */
  restApi?: RestApiConfig;

  /**
   * A simple way of defining tables through a JSON-schema like object.
   * Allowes adding runtime JSONB validation and type safety.
   * Should be used with caution because it tends to revert any changes
   * made to the database schema through SQL queries
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
      getConstraints: (
        table: string,
        column?: string,
        types?: ColConstraint["type"][]
      ) => Promise<ColConstraint[]>;
    }) => void;
  };
  /**
   * Usefull for logging or debugging
   */
  onLog?: (evt: EventInfo) => Promise<void>;
};

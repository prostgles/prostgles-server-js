
import { FileColumnConfig } from "prostgles-types";
import { Auth, AuthRequestParams, SessionUser } from "./AuthHandler";
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

import {
  AnyObject
} from "prostgles-types";
import type { Server } from "socket.io";
import { Publish, PublishMethods, PublishParams } from "./PublishParser/PublishParser";
import { DB } from "./Prostgles";

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
  tableName?: string; /* defaults to 'media' */

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
  }
  expressApp: ExpressApp;
  referencedTables?: {
    [tableName: string]:

      /** 
       * If defined then will try to create (if necessary) these columns which will reference files_table(id) 
       * Prostgles UI will use these hints (obtained through tableHandler.getInfo())
       * */ 
      | { type: "column", referenceColumns: Record<string, FileColumnConfig> }
  },
  imageOptions?: ImageOptions
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
  type: typeof JOIN_TYPES[number];
};
type Joins = Join[] | "inferred";

export type ProstglesInitOptions<S = void, SUser extends SessionUser = SessionUser> = {
  dbConnection: DbConnection;
  dbOptions?: DbConnectionOpts;
  tsGeneratedTypesDir?: string;
  disableRealtime?: boolean;
  io?: Server;
  publish?: Publish<S, SUser>;
  /**
   * If true then will test all table methods on each socket connect
   */
  testRulesOnConnect?: boolean;
  publishMethods?: PublishMethods<S, SUser>;
  publishRawSQL?(params: PublishParams<S, SUser>): ((boolean | "*") | Promise<(boolean | "*")>);
  joins?: Joins;
  schema?: Record<string, 1> | Record<string, 0>;
  sqlFilePath?: string;
  onReady: OnReadyCallback<S>;
  transactions?: string | boolean;
  wsChannelNamePrefix?: string;
  /**
   * Use for connection verification. Will disconnect socket on any errors
   */
  onSocketConnect?: (args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket }) => void | Promise<void>;
  onSocketDisconnect?: (args: AuthRequestParams<S, SUser> & { socket: PRGLIOSocket }) => void | Promise<void>;
  auth?: Auth<S, SUser>;
  DEBUG_MODE?: boolean;
  watchSchemaType?:

  /**
   * Will set database event trigger for schema changes. Requires superuser
   * Default
   */
  | "DDL_trigger"

  /**
   * Will check client queries for schema changes
   * fallback if DDL not possible
   */
  | "prostgles_queries"

  /**
   * If truthy then DBoGenerated.d.ts will be updated and "onReady" will be called with new schema on both client and server
   */
  watchSchema?:
    /**
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
  fileTable?: FileTableConfig;
  restApi?: RestApiConfig;
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
      getConstraints: (
        table: string, 
        column?: string, 
        types?: ColConstraint["type"][]
      ) => Promise<ColConstraint[]>
    }) => void;
  };
  onLog?: (evt: EventInfo) => Promise<void>;
}
import type pgPromise from "pg-promise";
import type pg from "pg-promise/typescript/pg-subset";
import type { MaybePromise, SQLHandler, TableSchema } from "prostgles-types";
import type { AuthClientRequest, SessionUser } from "./Auth/AuthTypes";
import { removeExpressRoutesTest } from "./Auth/utils/removeExpressRoute";
import { DBEventsManager } from "./DBEventsManager";
import type { DboBuilder } from "./DboBuilder/DboBuilder";
import type { DBOFullyTyped } from "./DBSchemaBuilder/DBSchemaBuilder";
import { getDbConnection } from "./getDbConnection";
import type { DBHandlerServer, Prostgles } from "./Prostgles";
import { getIsSuperUser } from "./Prostgles";
import type { ProstglesInitOptions } from "./ProstglesTypes";
import { PublishParser, type PermissionScope } from "./PublishParser/PublishParser";
import { SchemaWatch } from "./SchemaWatch/SchemaWatch";
import { runSQLFile } from "./TableConfig/runSQLFile";
import { updateConfiguration, type clientOnlyUpdateKeys } from "./updateConfiguration";
import { sleep } from "./utils/utils";
import { getClientHandlers } from "./WebsocketAPI/getClientHandlers";
import { getAdminClient } from "./DboBuilder/runSql/getAdminClient";

/**
 * Database connection details
 */
export type DbConnection =
  /**
   * Connection URI
   */
  string | pg.IConnectionParameters<pg.IClient>;
export type DbConnectionOpts = pg.IDefaults;

export type PGP = pgPromise.IMain<{}, pg.IClient>;
export type DB = pgPromise.IDatabase<{}, pg.IClient>;

export type UpdatableOptions<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = Pick<
  ProstglesInitOptions<S, SUser, Context>,
  | "io"
  | "fileTable"
  | "restApi"
  | "tableHooks"
  | "tableConfig"
  | "schemaFilter"
  | "auth"
  | "publish"
  | "functions"
  | "publishRawSQL"
  | "tsGeneratedTypesDir"
  | "tsGeneratedTypesFunctionsPath"
  | "modifyClientSchema"
  | "createContext"
>;
export type OnInitReason =
  | {
      type: "schema change";
      query: string;
      command: string | undefined;
    }
  | {
      type: "prgl.update";
      newOpts: Omit<
        UpdatableOptions<void, SessionUser, any>,
        (typeof clientOnlyUpdateKeys)[number]
      >;
    }
  | {
      type: "init" | "prgl.restart" | "TableConfig" | "dbo.refresh";
    };

type OnReadyParamsCommon = {
  db: DB;
  sql: SQLHandler;
  tables: TableSchema[];
  reason: OnInitReason;
};
export type OnReadyParamsBasic = OnReadyParamsCommon & {
  dbo: DBHandlerServer;
  context: any;
};
export type OnReadyParams<S, Context = undefined> = OnReadyParamsCommon & {
  dbo: DBOFullyTyped<S>;
  context: Context;
};

export type ContextCleanup = () => MaybePromise<void>;
export type CreateContextParams<S> = OnReadyParamsCommon & {
  dbo: DBOFullyTyped<S>;
  onCleanup: (cleanup: ContextCleanup) => void;
};
export type CreateContext<S, Context> = (
  params: CreateContextParams<S>,
) => MaybePromise<Context>;

export type OnReadyCallback<
  S,
  SUser extends SessionUser,
  Context = undefined,
> = (
  params: OnReadyParams<S, Context>,
  update: (newOpts: UpdatableOptions<S, SUser, Context>, force?: true) => Promise<void>,
) => void | Promise<void>;
export type OnReadyCallbackBasic = (
  params: OnReadyParamsBasic,
  update: (newOpts: UpdatableOptions<void, SessionUser, any>, force?: true) => Promise<void>,
) => void | Promise<void>;

export type InitResult<
  S = void,
  SUser extends SessionUser = SessionUser,
  Context = undefined,
> = {
  db: DBOFullyTyped<S>;
  context: Context;
  sql: SQLHandler;
  _db: DB;
  pgp: PGP;
  io: ProstglesInitOptions<S, SUser, Context>["io"];
  destroy: () => Promise<boolean>;
  /**
   * Generated database public schema TS types for all tables and views
   */
  getTSSchema: typeof DboBuilder.prototype.getTsDefinitions;
  getSchema: typeof DboBuilder.prototype.getSchema;
  reWriteDBSchema: () => void;
  update: (newOpts: UpdatableOptions<S, SUser, Context>, force?: true) => Promise<void>;
  restart: () => Promise<InitResult<S, SUser, Context>>;
  options: ProstglesInitOptions<S, SUser, Context>;
  getClientDBHandlers: (
    clientReq: AuthClientRequest,
    scope: PermissionScope | undefined,
  ) => ReturnType<typeof getClientHandlers<S>>;

  getFieldsWithTypes: typeof DboBuilder.prototype.getDetailedFieldInfo;
};

export const initProstgles = async function (
  this: Prostgles,
  onReady: OnReadyCallbackBasic,
  reason: OnInitReason,
): Promise<InitResult<void, SessionUser, any>> {
  this.loaded = false;
  const expressApp =
    this.opts.fileTable?.expressApp ??
    this.opts.restApi?.expressApp ??
    this.opts.auth?.loginSignupConfig?.app;

  /** Crucial in ensuring the runtime version of express works as expected */
  if (expressApp) {
    await removeExpressRoutesTest(expressApp);
  }

  if (!this.db) {
    let existingAppName = "";
    let connString = "";
    if (typeof this.opts.dbConnection === "string") {
      connString = this.opts.dbConnection;
    } else if (this.opts.dbConnection.connectionString) {
      connString = this.opts.dbConnection.connectionString;
    } else {
      existingAppName = this.opts.dbConnection.application_name ?? "";
    }

    if (connString) {
      try {
        const url = new URL(connString);
        existingAppName =
          url.searchParams.get("application_name") ?? url.searchParams.get("ApplicationName") ?? "";
      } catch {}
    }

    const conObj =
      typeof this.opts.dbConnection === "string" ?
        { connectionString: this.opts.dbConnection }
      : this.opts.dbConnection;
    const application_name = `prostgles ${this.appId} ${existingAppName}`;

    /* 1. Connect to db */
    const { db, pgp } = getDbConnection({
      onQuery: this.opts.onQuery,
      onConnectionError: this.opts.onConnectionError,
      DEBUG_MODE: this.opts.DEBUG_MODE,
      dbConnection: { ...conObj, application_name },
      onNotice: (notice) => {
        if (this.opts.onNotice) this.opts.onNotice(notice);
        if (this.dbEventsManager) {
          this.dbEventsManager.onNotice(notice);
        }
      },
    });

    this.adminClient = await getAdminClient(db);

    /** Drop stale triggers */
    await db
      .any(
        `
      WITH active_app_ids AS (
        SELECT DISTINCT (string_to_array(application_name, ' '))[2] AS app_id
        FROM pg_stat_activity
        WHERE application_name LIKE 'prostgles %'
      )
      DELETE FROM prostgles.app_triggers
      WHERE app_id NOT IN (SELECT app_id FROM active_app_ids)
      AND app_id != $1
      `,
        [this.appId],
      )
      .catch(() => {});

    this.db = db;
    this.pgp = pgp;
    this.isSuperUser = await getIsSuperUser(db);
  }
  this.checkDb();

  const db = this.db;
  const pgp = this.pgp!;

  try {
    await this.cleanupContext();

    /* 2. Execute any SQL file if provided */
    await runSQLFile(this);
    await this.rebuildDBO();
    await this.initTableConfig(reason);
    await this.rebuildDBO();
    await this.createContext(reason);
    this.initRestApi();

    this.schemaWatch = await SchemaWatch.create(this.dboBuilder);

    if (this.opts.publish) {
      if (!this.opts.io && !this.opts.restApi) {
        console.warn("IO missing. Publish has no effect without io or restApi");
      }

      /* 3.9 Check auth config */
      this.initAuthHandler();

      this.publishParser = new PublishParser(this);
      this.dboBuilder.publishParser = this.publishParser;

      /* 4. Set publish and auth listeners */
      this.setupSocketIO();
    } else if (this.opts.auth) {
      throw "Auth config does not work without publish";
    }

    this.dbEventsManager = new DBEventsManager(db, pgp);

    this.writeDBSchema();

    /* 5. Finish init and provide DBO object */
    try {
      if (this.destroyed) {
        console.trace("Prostgles: Instance is destroyed");
      }
      void onReady(
        {
          sql: this.dboBuilder.sql,
          dbo: this.dbo!,
          db: this.db,
          tables: this.dboBuilder.tables,
          reason,
          context: this.context,
        },
        async (...args) => {
          await updateConfiguration(this, onReady, ...args);
        },
      );
    } catch (err) {
      console.error("Prostgles: Error within onReady: \n", err);
    }

    this.loaded = true;
    const getContext = () => this.context;
    const initResult: InitResult<void, SessionUser, any> = {
      db: this.dbo as DBOFullyTyped,
      get context() {
        return getContext();
      },
      sql: this.dboBuilder.sql,
      _db: db,
      pgp,
      io: this.opts.io,
      getTSSchema: this.dboBuilder.getTsDefinitions,
      getSchema: this.dboBuilder.getSchema,
      reWriteDBSchema: () => this.writeDBSchema(true),
      options: this.opts,
      update: async (...args) => {
        await updateConfiguration(this, onReady, ...args);
      },
      getFieldsWithTypes: this.dboBuilder.getDetailedFieldInfo,
      restart: () => this.init(onReady, { type: "prgl.restart" }),
      destroy: async () => {
        console.log("destroying prgl instance");
        this.destroyed = true;
        if (this.opts.io) {
          this.opts.io.on("connection", () => {
            console.log("Socket connected to destroyed instance");
          });

          /** Try to close IO without stopping http server */
          if (this.opts.io.sockets.constructor.name === "Namespace") {
            for (const socket of this.opts.io.sockets.sockets.values()) {
              socket._onclose("server shutting down");
            }
          }
          if (this.opts.io.engine.constructor.name === "Server") {
            this.opts.io.engine.close();
          }
        }
        await this.cleanupContext();
        await this.dboBuilder.destroy();
        this.authHandler.destroy();
        await this.tableConfigurator?.destroy();
        this.dbo = undefined;
        this.db = undefined;
        await db.$pool.end();
        await this.adminClient?.end().catch(() => {});
        this.adminClient = undefined;
        await sleep(1000);
        return true;
      },
      getClientDBHandlers: (clientReq: AuthClientRequest, scope: PermissionScope | undefined) =>
        getClientHandlers(this, clientReq, scope),
    };

    return initResult;
  } catch (e: any) {
    await this.cleanupContext();
    console.trace(e);
    throw "init issues: " + (e as Error).toString();
  }
};

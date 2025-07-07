import * as pgPromise from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";
import { getKeys, isEmpty, isEqual } from "prostgles-types";
import type { AuthClientRequest, SessionUser } from "./Auth/AuthTypes";
import { removeExpressRoutesTest } from "./Auth/utils/removeExpressRoute";
import { DBEventsManager } from "./DBEventsManager";
import { DBOFullyTyped } from "./DBSchemaBuilder";
import { DBHandlerServer, Prostgles, getIsSuperUser } from "./Prostgles";
import { ProstglesInitOptions } from "./ProstglesTypes";
import { DbTableInfo, PublishParser } from "./PublishParser/PublishParser";
import { SchemaWatch } from "./SchemaWatch/SchemaWatch";
import { runSQLFile } from "./TableConfig/runSQLFile";
import { sleep } from "./utils";
import { getClientHandlers } from "./WebsocketAPI/getClientHandlers";

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

export type UpdateableOptions<S = void, SUser extends SessionUser = SessionUser> = Pick<
  ProstglesInitOptions<S, SUser>,
  "fileTable" | "restApi" | "tableConfig" | "schemaFilter" | "auth"
>;
export type OnInitReason =
  | {
      type: "schema change";
      query: string;
      command: string | undefined;
    }
  | {
      type: "prgl.update";
      newOpts: Omit<UpdateableOptions, (typeof clientOnlyUpdateKeys)[number]>;
    }
  | {
      type: "init" | "prgl.restart" | "TableConfig";
    };

type OnReadyParamsCommon = {
  db: DB;
  tables: DbTableInfo[];
  reason: OnInitReason;
};
export type OnReadyParamsBasic = OnReadyParamsCommon & {
  dbo: DBHandlerServer;
};
export type OnReadyParams<S> = OnReadyParamsCommon & {
  dbo: DBOFullyTyped<S>;
};

export type OnReadyCallback<S = void> = (params: OnReadyParams<S>) => any;
export type OnReadyCallbackBasic = (params: OnReadyParamsBasic) => any;

export type InitResult<S = void, SUser extends SessionUser = SessionUser> = {
  db: DBOFullyTyped<S>;
  _db: DB;
  pgp: PGP;
  io: ProstglesInitOptions<S, SUser>["io"];
  destroy: () => Promise<boolean>;
  /**
   * Generated database public schema TS types for all tables and views
   */
  getTSSchema: () => string;
  update: (newOpts: UpdateableOptions<S, SUser>) => Promise<void>;
  restart: () => Promise<InitResult<S, SUser>>;
  options: ProstglesInitOptions<S, SUser>;
  getClientDBHandlers: (clientReq: AuthClientRequest) => ReturnType<typeof getClientHandlers<S>>;
};

const clientOnlyUpdateKeys = ["auth"] as const satisfies (keyof UpdateableOptions)[];

export const initProstgles = async function (
  this: Prostgles,
  onReady: OnReadyCallbackBasic,
  reason: OnInitReason
): Promise<InitResult> {
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
    this.db = db;
    this.pgp = pgp;
    this.isSuperUser = await getIsSuperUser(db);
  }
  this.checkDb();

  const db = this.db;
  const pgp = this.pgp!;

  try {
    /* 2. Execute any SQL file if provided */
    await runSQLFile(this);
    await this.refreshDBO();
    await this.initTableConfig(reason);
    await this.initFileTable();
    this.initRestApi();

    this.schemaWatch = await SchemaWatch.create(this.dboBuilder);

    if (this.opts.publish) {
      if (!this.opts.io) {
        console.warn("IO missing. Publish has no effect without io");
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
      onReady({
        dbo: this.dbo!,
        db: this.db,
        tables: this.dboBuilder.tables,
        reason,
      });
    } catch (err) {
      console.error("Prostgles: Error within onReady: \n", err);
    }

    this.loaded = true;
    //@ts-ignore
    const initResult: InitResult = {
      db: this.dbo as DBOFullyTyped,
      _db: db,
      pgp,
      io: this.opts.io,
      getTSSchema: this.getTSFileContent,
      options: this.opts,
      update: async (newOpts) => {
        let optsHaveChanged = false as boolean;
        getKeys(newOpts).forEach((k) => {
          if (!isEqual(this.opts[k], newOpts[k])) {
            optsHaveChanged = true;
            //@ts-ignore
            this.opts[k] = newOpts[k];
          }
        });
        if (!optsHaveChanged) {
          console.warn("No options changed");
          return;
        }

        if ("fileTable" in newOpts) {
          await this.initFileTable();
        }
        if ("restApi" in newOpts) {
          this.initRestApi();
        }
        if ("tableConfig" in newOpts) {
          await this.initTableConfig({ type: "prgl.update", newOpts });
        }
        if ("schema" in newOpts) {
          await this.refreshDBO();
        }
        if ("auth" in newOpts) {
          this.initAuthHandler();
        }

        if (isEmpty(newOpts)) return;

        /**
         * Some of these changes require clients to reconnect
         * While others also affect the server and onReady should be called
         */
        if (
          getKeys(newOpts).every((updatedKey) =>
            clientOnlyUpdateKeys.some((key) => key === updatedKey)
          )
        ) {
          this.setupSocketIO();
        } else {
          await this.init(onReady, { type: "prgl.update", newOpts });
        }
      },
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
        this.fileManager?.destroy();
        await this.dboBuilder.destroy();
        this.authHandler?.destroy();
        await this.tableConfigurator?.destroy();
        this.dbo = undefined;
        this.db = undefined;
        await db.$pool.end();
        await sleep(1000);
        return true;
      },
      getClientDBHandlers: (clientReq: AuthClientRequest) => getClientHandlers(this, clientReq),
    };

    return initResult;
  } catch (e: any) {
    console.trace(e);
    throw "init issues: " + (e as Error).toString();
  }
};

type GetDbConnectionArgs = Pick<
  ProstglesInitOptions,
  "DEBUG_MODE" | "onQuery" | "dbConnection" | "onNotice" | "onConnectionError"
>;
const getDbConnection = function ({
  dbConnection,
  onQuery,
  onConnectionError,
  DEBUG_MODE,
  onNotice,
}: GetDbConnectionArgs): { db: DB; pgp: PGP } {
  const onQueryOrError:
    | undefined
    | ((error: any, ctx: pgPromise.IEventContext<pg.IClient>) => void) =
    !onQuery && !DEBUG_MODE ?
      undefined
    : (error, ctx) => {
        if (onQuery) {
          onQuery(error, ctx);
        } else if (DEBUG_MODE) {
          if (error) {
            console.error(error, ctx);
          } else {
            console.log(ctx);
          }
        }
      };

  const pgp: PGP = pgPromise({
    ...(onQueryOrError && {
      query: (ctx) => onQueryOrError(undefined, ctx),
    }),
    error: (err: Error, ctx) => {
      if (ctx.cn) {
        onConnectionError?.(err, ctx);
      }
      onQueryOrError?.(err, ctx);
    },
    ...((onNotice || DEBUG_MODE) && {
      connect: function ({ client, useCount }) {
        const isFresh = !useCount;
        if (isFresh && !client.listeners("notice").length) {
          client.on("notice", function (msg) {
            if (onNotice) {
              onNotice(msg, msg?.message);
            } else {
              console.log("notice: %j", msg?.message);
            }
          });
        }
        if (isFresh && !client.listeners("error").length) {
          client.on("error", function (msg) {
            if (onNotice) {
              onNotice(msg, msg?.message);
            } else {
              console.log("error: %j", msg?.message);
            }
          });
        }
      },
    }),
  });
  // pgp.pg.defaults.max = 70;

  // /* Casts count/sum/max to bigint. Needs rework to remove casting "+count" and other issues; */
  // pgp.pg.types.setTypeParser(20, BigInt);

  /**
   * Prevent timestamp casting to ensure we don't lose the microseconds.
   * This is needed to ensure the filters work as expected for a given row
   * 
  register(1114, parseTimestamp) // timestamp without time zone
  register(1184, parseTimestampTz) // timestamp with time zone
   */
  // pgp.pg.types.setTypeParser(1114, v => v); // timestamp without time zone
  // pgp.pg.types.setTypeParser(1184, v => v); // timestamp with time zone
  // pgp.pg.types.setTypeParser(1182, v => v); // date
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMP, (v) => v); // timestamp without time zone
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMPTZ, (v) => v); // timestamp with time zone
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.DATE, (v) => v); // date

  // if (dbOptions) {
  //   Object.assign(pgp.pg.defaults, dbOptions);
  // }

  return {
    db: pgp(dbConnection),
    pgp,
  };
};

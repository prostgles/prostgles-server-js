import type pgPromise from "pg-promise";
import { AuthHandler } from "./Auth/AuthHandler";
import type { SessionUser } from "./Auth/AuthTypes";
import type { ContextCleanup, OnInitReason } from "./initProstgles";
import { initProstgles } from "./initProstgles";
import type { SchemaWatch } from "./SchemaWatch/SchemaWatch";
import { getClientSchema } from "./WebsocketAPI/getClientSchema";
import { onSocketConnected } from "./WebsocketAPI/onSocketConnected";
import pg = require("pg-promise/typescript/pg-subset");

import type { ProstglesInitOptions } from "./ProstglesTypes";
import { RestApi } from "./RestApi";
import { TableConfigurator } from "./TableConfig/TableConfigurator";

import type { PRGLIOSocket } from "./DboBuilder/DboBuilder";
import { DBHandlerServer, DboBuilder } from "./DboBuilder/DboBuilder";
export { DBHandlerServer };
export type PGP = pgPromise.IMain<{}, pg.IClient>;
export { getEmailSender, getOrSetTransporter, verifySMTPConfig } from "./Auth/sendEmail";
export { applyTableConfig } from "./TableConfig/applyTableConfig";

import { CHANNELS, tryCatchV2 } from "prostgles-types";
import type { DBEventsManager } from "./DBEventsManager";
import type { PublishParser } from "./PublishParser/PublishParser";
import { pushSocketSchema } from "./WebsocketAPI/pushSocketSchema";

export type DB = pgPromise.IDatabase<{}, pg.IClient>;
export type DBorTx = DB | pgPromise.ITask<{}>;

export const TABLE_METHODS = [
  "update",
  "find",
  "findOne",
  "insert",
  "insertMany",
  "delete",
  "upsert",
] as const satisfies (keyof TableHandler)[];

/*
    1. Connect to db
    2. Execute any SQL file if provided
    3. Make DBO object from all tables and views
    4. Set publish listeners
    5. Finish init and provide DBO object
*/

export type OnReady = {
  dbo: DBHandlerServer;
  db: DB;
};

const DEFAULT_KEYWORDS = {
  $filter: "$filter",
  $and: "$and",
  $or: "$or",
  $not: "$not",
};

import { randomUUID } from "crypto";
import * as fs from "fs";
import type { getAdminClient } from "./DboBuilder/runSql/getAdminClient";
import type { TableHandler } from "./DboBuilder/TableHandler/TableHandler";
import { getFileTableConfig } from "./StorageClient/getFileTableConfig";
import { dirname } from "path";

export class Prostgles {
  /**
   * Used to manage concurrent prostgles connections to the same database
   */
  readonly appId = randomUUID();
  opts: ProstglesInitOptions<void, SessionUser, any> = {
    DEBUG_MODE: false,
    dbConnection: {
      host: "localhost",
      port: 5432,
      application_name: "prostgles_app",
    },
    onReady: () => {
      //empty
    },
    watchSchema: false,
    watchSchemaType: "DDL_trigger",
  };

  db?: DB;
  adminClient?: Awaited<ReturnType<typeof getAdminClient>>;
  pgp?: PGP;
  dbo?: DBHandlerServer;
  _dboBuilder?: DboBuilder;
  get dboBuilder(): DboBuilder {
    if (!this._dboBuilder) {
      console.trace(1);
      throw "get dboBuilder: it's undefined";
    }
    return this._dboBuilder;
  }
  set dboBuilder(d: DboBuilder) {
    this._dboBuilder = d;
  }
  publishParser?: PublishParser;

  authHandler = new AuthHandler(this);

  schemaWatch?: SchemaWatch;

  keywords = DEFAULT_KEYWORDS;
  loaded = false;

  dbEventsManager?: DBEventsManager;
  schemaAge = "0";

  restApi?: RestApi;

  tableConfigurator?: TableConfigurator;

  get mergedTableConfig() {
    return getFileTableConfig(this);
  }

  isMedia(tableName: string) {
    return this.opts.fileTable?.tableName === tableName;
  }

  constructor(params: ProstglesInitOptions<void, SessionUser, any>) {
    const config: Record<keyof ProstglesInitOptions<void, SessionUser, any>, 1> = {
      transactions: 1,
      joins: 1,
      tsGeneratedTypesDir: 1,
      tsGeneratedTypesFunctionsPath: 1,
      disableRealtime: 1,
      onReady: 1,
      dbConnection: 1,
      functions: 1,
      io: 1,
      publish: 1,
      schemaFilter: 1,
      publishRawSQL: 1,
      onSocketConnect: 1,
      onSocketDisconnect: 1,
      sqlFilePath: 1,
      auth: 1,
      DEBUG_MODE: 1,
      watchSchema: 1,
      watchSchemaType: 1,
      fileTable: 1,
      onQuery: 1,
      onConnectionError: 1,
      tableConfig: 1,
      tableHooks: 1,
      tableConfigMigrations: 1,
      onNotice: 1,
      onLog: 1,
      restApi: 1,
      testRulesOnConnect: 1,
      modifyClientSchema: 1,
      createContext: 1,
    };
    const unknownParams = Object.keys(params).filter(
      (key: string) => !Object.keys(config).includes(key),
    );
    if (unknownParams.length) {
      console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
    }

    this.opts = { ...this.opts, ...params };

    this.opts.schemaFilter ??= { public: 1 };

    this.keywords = {
      ...DEFAULT_KEYWORDS,
    };
  }

  destroyed = false;

  checkDb() {
    if (
      !this.db ||
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      !this.db.connect
    ) {
      throw "something went wrong getting a db connection";
    }
  }

  getTSFileName() {
    const fileName = "DBGeneratedSchema.ts";
    const _dir = this.opts.tsGeneratedTypesDir || "";
    const dir = _dir.endsWith("/") ? _dir : `${_dir}/`;
    const fullPath = dir + fileName;
    return { fileName, fullPath };
  }

  /**
   * Will write the Schema Typescript definitions to file (tsGeneratedTypesDir)
   * force is used for hotReloadMode to trigger a restart
   */
  writeDBSchema(force = false) {
    if (this.opts.tsGeneratedTypesDir) {
      const { fullPath, fileName } = this.getTSFileName();
      const { tsSchema: fileContent } = this.dboBuilder.getTsDefinitions();
      fs.mkdirSync(dirname(fullPath), { recursive: true });

      const existingContent =
        fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : undefined;
      if (force || existingContent !== fileContent) {
        fs.writeFileSync(fullPath, fileContent);
        console.log("Prostgles: Created typescript schema definition file: \n " + fileName);
      }
    } else if (force) {
      console.error("Schema changed. tsGeneratedTypesDir needs to be set to reload server");
    }
  }

  context: unknown;
  private contextCleanups: ContextCleanup[] = [];

  cleanupContext = async () => {
    const cleanups = this.contextCleanups.splice(0).reverse();
    this.context = undefined;
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        console.error("Prostgles: Context cleanup failed", error);
      }
    }
  };

  createContext = async (reason: OnInitReason) => {
    const createContext = this.opts.createContext;
    if (!createContext) {
      this.context = undefined;
      return;
    }
    if (!this.db || !this.dbo) throw new Error("Cannot create context before the DBO is ready");

    const cleanups: ContextCleanup[] = [];
    try {
      const context = await createContext({
        db: this.db,
        dbo: this.dbo as any,
        sql: this.dboBuilder.sql,
        tables: this.dboBuilder.tables,
        reason,
        onCleanup: (cleanup) => cleanups.push(cleanup),
      });
      this.context = context;
      this.contextCleanups = cleanups;
    } catch (error) {
      for (const cleanup of cleanups.reverse()) {
        try {
          await cleanup();
        } catch (cleanupError) {
          console.error("Prostgles: Context cleanup failed", cleanupError);
        }
      }
      throw error;
    }
  };

  /** Rebuilds the DBO without changing the application context. */
  rebuildDBO = async () => {
    await this.opts.onLog?.({
      type: "debug",
      command: "refreshDBO.start",
      duration: -1,
      data: {},
    });
    const start = Date.now();
    if (this._dboBuilder) {
      await this._dboBuilder.build();
    } else {
      this.dboBuilder = await DboBuilder.create(this);
    }
    this.dbo = this.dboBuilder.dbo;
    await this.opts.onLog?.({
      type: "debug",
      command: "refreshDBO.end",
      duration: Date.now() - start,
    });
    return this.dbo;
  };

  /** Rebuilds the DBO and replaces the application context. */
  refreshDBO = async () => {
    await this.cleanupContext();
    const dbo = await this.rebuildDBO();
    await this.createContext({ type: "dbo.refresh" });
    return dbo;
  };

  initRestApi = () => {
    this.restApi?.destroy();
    this.restApi = this.opts.restApi && new RestApi({ prostgles: this, ...this.opts.restApi });
  };

  initAuthHandler = () => {
    this.authHandler.destroy();
    this.authHandler = new AuthHandler(this);
  };

  initTableConfig = async (reason: OnInitReason) => {
    const res = await tryCatchV2(async () => {
      if (this.tableConfigurator?.initialising) {
        console.error("TableConfigurator WILL deadlock", { reason });
      }
      await this.tableConfigurator?.destroy();
      this.tableConfigurator = new TableConfigurator(this);
      try {
        const now = Date.now();
        await this.opts.onLog?.({
          type: "debug",
          command: "tableConfigurator.init.start",
          duration: -1,
        });
        await this.tableConfigurator.init();
        await this.opts.onLog?.({
          type: "debug",
          command: "tableConfigurator.init.end",
          duration: Date.now() - now,
        });
      } catch (e) {
        if (this.opts.tableConfigMigrations?.silentFail === false) {
          console.error("TableConfigurator silentFail: ", e);
        } else {
          throw e;
        }
      }
    });
    await this.opts.onLog?.({
      type: "debug",
      command: "initTableConfig",
      ...res,
      data: {},
    });
    if (res.hasError) throw res.error;
    return res.data;
  };

  isSuperUser = false;

  init = initProstgles.bind(this);

  connectedSockets: PRGLIOSocket[] = [];
  setupSocketIO() {
    this.checkDb();

    const {
      dbo,
      opts: { io },
    } = this;
    if (!dbo) throw "dbo missing";

    if (!io) return;

    /* Already initialised. Only reconnect sockets */
    if (this.connectedSockets.length) {
      this.connectedSockets.forEach((s) => {
        s.emit(CHANNELS.SCHEMA_CHANGED);
        void this.pushSocketSchema(s);
      });
      return;
    }

    /* Initialise */
    io.removeAllListeners("connection");
    io.on("connection", this.onSocketConnected);
    /** In some cases io will re-init with already connected sockets */
    io.sockets.sockets.forEach((socket) => {
      void this.onSocketConnected(socket);
    });
  }

  onSocketConnected = onSocketConnected.bind(this);
  getClientSchema = getClientSchema.bind(this);
  pushSocketSchema = pushSocketSchema.bind(this);
}

export async function getIsSuperUser(db: DBorTx): Promise<boolean> {
  return db
    .oneOrNone<{ usesuper: boolean }>("select usesuper from pg_user where usename = CURRENT_USER;")
    .then((r) => !!r?.usesuper);
}

export const getFileText = (fullPath: string, _format = "utf8"): Promise<string> => {
  return new Promise((resolve, reject) => {
    fs.readFile(fullPath, "utf8", function (err, data) {
      if (err) reject(err);
      else resolve(data);
    });
  });
};

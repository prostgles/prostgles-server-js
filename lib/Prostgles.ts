import type * as pgPromise from "pg-promise";
import { AuthHandler } from "./Auth/AuthHandler";
import { FileManager } from "./FileManager/FileManager";
import type { OnInitReason } from "./initProstgles";
import { initProstgles } from "./initProstgles";
import type { SchemaWatch } from "./SchemaWatch/SchemaWatch";
import { getClientSchema } from "./WebsocketAPI/getClientSchema";
import { onSocketConnected } from "./WebsocketAPI/onSocketConnected";
import pg = require("pg-promise/typescript/pg-subset");

import type { ProstglesInitOptions } from "./ProstglesTypes";
import { RestApi } from "./RestApi";
import TableConfigurator from "./TableConfig/TableConfig";

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

export const TABLE_METHODS = ["update", "find", "findOne", "insert", "delete", "upsert"] as const;

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

export class Prostgles {
  /**
   * Used to manage concurrent prostgles connections to the same database
   */
  readonly appId = randomUUID();
  opts: ProstglesInitOptions = {
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

  fileManager?: FileManager;
  restApi?: RestApi;

  tableConfigurator?: TableConfigurator;

  isMedia(tableName: string) {
    return this.opts.fileTable?.tableName === tableName;
  }

  constructor(params: ProstglesInitOptions) {
    const config: Record<keyof ProstglesInitOptions, 1> = {
      transactions: 1,
      joins: 1,
      tsGeneratedTypesDir: 1,
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
      tableConfigMigrations: 1,
      onNotice: 1,
      onLog: 1,
      restApi: 1,
      testRulesOnConnect: 1,
    };
    const unknownParams = Object.keys(params).filter(
      (key: string) => !Object.keys(config).includes(key),
    );
    if (unknownParams.length) {
      console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
    }

    this.opts = { ...this.opts, ...params };

    /* set defaults */
    if (this.opts.fileTable) {
      this.opts.fileTable.tableName ??= "media";
    }
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
    )
      throw "something went wrong getting a db connection";
  }

  getTSFileName() {
    const fileName = "DBGeneratedSchema.d.ts";
    const _dir = this.opts.tsGeneratedTypesDir || "";
    const dir = _dir.endsWith("/") ? _dir : `${_dir}/`;
    const fullPath = dir + fileName;
    return { fileName, fullPath };
  }

  getTSFileContent = () => {
    return this.dboBuilder.tsTypesDefinition ?? "";
  };

  /**
   * Will write the Schema Typescript definitions to file (tsGeneratedTypesDir)
   */
  writeDBSchema(force = false) {
    if (this.opts.tsGeneratedTypesDir) {
      const { fullPath, fileName } = this.getTSFileName();
      const fileContent = this.getTSFileContent();
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.readFile(fullPath, "utf8", function (err, data) {
        if (err || force || data !== fileContent) {
          // eslint-disable-next-line security/detect-non-literal-fs-filename
          fs.writeFileSync(fullPath, fileContent);
          console.log("Prostgles: Created typescript schema definition file: \n " + fileName);
        }
      });
    } else if (force) {
      console.error("Schema changed. tsGeneratedTypesDir needs to be set to reload server");
    }
  }

  /**
   * Will re-create the dbo object
   */
  refreshDBO = async () => {
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

  initRestApi = () => {
    if (this.opts.restApi) {
      this.restApi = new RestApi({ prostgles: this, ...this.opts.restApi });
    } else {
      this.restApi?.destroy();
      this.restApi = undefined;
    }
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

  /* Create media table if required */
  initFileTable = async () => {
    const res = await tryCatchV2(async () => {
      if (this.opts.fileTable) {
        const { cloudClient, localConfig, imageOptions } = this.opts.fileTable;
        await this.refreshDBO();
        if (!cloudClient && !localConfig)
          throw "fileTable missing param: Must provide awsS3Config OR localConfig";

        this.fileManager = new FileManager(cloudClient || localConfig!, imageOptions);

        try {
          await this.fileManager.init(this);
        } catch (e) {
          console.error("FileManager: ", e);
          this.fileManager = undefined;
        }
      } else {
        this.fileManager?.destroy();
        this.fileManager = undefined;
      }
      await this.refreshDBO();
      return { data: {} };
    });
    await this.opts.onLog?.({
      type: "debug",
      command: "initFileTable",
      ...res,
    });
    if (res.error !== undefined) throw res.error;
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
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.readFile(fullPath, "utf8", function (err, data) {
      if (err) reject(err);
      else resolve(data);
    });
  });
};

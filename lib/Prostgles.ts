/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pgPromise from "pg-promise";
import { AuthHandler } from "./Auth/AuthHandler";
import { FileManager } from "./FileManager/FileManager";
import { SchemaWatch } from "./SchemaWatch/SchemaWatch";
import { OnInitReason, initProstgles } from "./initProstgles";
import { makeSocketError, onSocketConnected } from "./onSocketConnected";
import { clientCanRunSqlRequest, runClientSqlRequest } from "./runClientRequest";
import pg = require("pg-promise/typescript/pg-subset");
const { version } = require("../package.json");

import type { ProstglesInitOptions } from "./ProstglesTypes";
import { RestApi } from "./RestApi";
import TableConfigurator from "./TableConfig/TableConfig";

import {
  DBHandlerServer,
  DboBuilder,
  PRGLIOSocket,
  getErrorAsObject,
} from "./DboBuilder/DboBuilder";
export { DBHandlerServer };
export type PGP = pgPromise.IMain<{}, pg.IClient>;
export { getEmailSender, getOrSetTransporter, verifySMTPConfig } from "./Auth/sendEmail";
export { applyTableConfig } from "./TableConfig/applyTableConfig";

import {
  CHANNELS,
  ClientSchema,
  SQLRequest,
  isObject,
  omitKeys,
  tryCatchV2,
} from "prostgles-types";
import { DBEventsManager } from "./DBEventsManager";
import { PublishParser } from "./PublishParser/PublishParser";

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
import { AuthClientRequest } from "./Auth/AuthTypes";

export class Prostgles {
  /**
   * Used facilitate concurrent prostgles connections to the same database
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

  authHandler?: AuthHandler;

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
      publishMethods: 1,
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
      tableConfig: 1,
      tableConfigMigrations: 1,
      onNotice: 1,
      onLog: 1,
      restApi: 1,
      testRulesOnConnect: 1,
    };
    const unknownParams = Object.keys(params).filter(
      (key: string) => !Object.keys(config).includes(key)
    );
    if (unknownParams.length) {
      console.error(`Unrecognised ProstglesInitOptions params: ${unknownParams.join()}`);
    }

    Object.assign(this.opts, params);

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
    if (!this.db || !(this.db as any).connect) throw "something went wrong getting a db connection";
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
      fs.readFile(fullPath, "utf8", function (err, data) {
        if (err || force || data !== fileContent) {
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

  initAuthHandler = async () => {
    this.authHandler?.destroy();
    if (!this.opts.auth) {
      return;
    }
    this.authHandler = new AuthHandler(this);
    await this.authHandler.init();
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
  setSocketEvents() {
    this.checkDb();

    if (!this.dbo) throw "dbo missing";

    const publishParser = new PublishParser(this);
    this.publishParser = publishParser;

    if (!this.opts.io) return;

    /* Already initialised. Only reconnect sockets */
    if (this.connectedSockets.length) {
      this.connectedSockets.forEach((s) => {
        s.emit(CHANNELS.SCHEMA_CHANGED);
        void this.pushSocketSchema(s);
      });
      return;
    }

    /* Initialise */
    this.opts.io.removeAllListeners("connection");
    this.opts.io.on("connection", this.onSocketConnected);
    /** In some cases io will re-init with already connected sockets */
    this.opts.io.sockets.sockets.forEach((socket) => {
      void this.onSocketConnected(socket);
    });
  }

  onSocketConnected = onSocketConnected.bind(this);

  getClientSchema = async (clientReq: AuthClientRequest) => {
    const result = await tryCatchV2(async () => {
      const clientInfo =
        clientReq.socket ?
          { type: "socket" as const, ...clientReq }
        : { type: "http" as const, ...clientReq };

      const userData = await this.authHandler?.getSidAndUserFromRequest(clientInfo);
      const { publishParser } = this;
      let fullSchema: Awaited<ReturnType<PublishParser["getSchemaFromPublish"]>> | undefined;
      let publishValidationError;

      try {
        if (!publishParser) throw "publishParser undefined";
        fullSchema = await publishParser.getSchemaFromPublish({
          ...clientInfo,
          userData,
        });
      } catch (e) {
        publishValidationError = e;
        console.error(`\nProstgles Publish validation failed (after socket connected):\n    ->`, e);
      }
      let rawSQL = false;
      if (this.opts.publishRawSQL && typeof this.opts.publishRawSQL === "function") {
        const { allowed } = await clientCanRunSqlRequest.bind(this)(clientInfo);
        rawSQL = allowed;
      }

      const { schema, tables, tableSchemaErrors } = fullSchema ?? {
        schema: {},
        tables: [],
        tableSchemaErrors: {},
      };
      const joinTables2: string[][] = [];
      if (this.opts.joins) {
        const _joinTables2 = this.dboBuilder
          .getAllJoinPaths()
          .filter((jp) => ![jp.t1, jp.t2].find((t) => !schema[t] || !schema[t]?.findOne))
          .map((jp) => [jp.t1, jp.t2].sort());
        _joinTables2.map((jt) => {
          if (!joinTables2.find((_jt) => _jt.join() === jt.join())) {
            joinTables2.push(jt);
          }
        });
      }

      const methods = await publishParser?.getAllowedMethods(clientInfo, userData);

      const methodSchema: ClientSchema["methods"] =
        !methods ?
          []
        : Object.entries(methods)
            .map(([methodName, method]) => {
              if (isObject(method) && "run" in method) {
                return {
                  name: methodName,
                  ...omitKeys(method, ["run"]),
                };
              }
              return methodName;
            })
            .sort((a, b) => {
              const aName = isObject(a) ? a.name : a;
              const bName = isObject(b) ? b.name : b;
              return aName.localeCompare(bName);
            });

      const authInfo = await this.authHandler?.getClientAuth(clientReq);

      const clientSchema: ClientSchema = {
        schema,
        methods: methodSchema,
        tableSchema: tables,
        rawSQL,
        joinTables: joinTables2,
        tableSchemaErrors,
        auth: authInfo?.auth,
        version,
        err: publishValidationError ? "Server Error: User publish validation failed." : undefined,
      };

      return {
        publishValidationError,
        clientSchema,
        userData,
      };
    });
    const sid = this.authHandler?.getSIDNoError(clientReq);
    await this.opts.onLog?.({
      type: "connect.getClientSchema",
      duration: result.duration,
      sid,
      socketId: clientReq.socket?.id,
      error: result.error || result.data?.publishValidationError,
    });
    if (result.hasError) throw result.error;
    return result.data.clientSchema;
  };

  pushSocketSchema = async (socket: PRGLIOSocket) => {
    try {
      const clientSchema = await this.getClientSchema({ socket });
      socket.prostgles = clientSchema;
      if (clientSchema.rawSQL) {
        socket.removeAllListeners(CHANNELS.SQL);
        socket.on(
          CHANNELS.SQL,
          (
            sqlRequestData: SQLRequest,
            cb = (..._callback: any) => {
              /* Empty */
            }
          ) => {
            runClientSqlRequest
              .bind(this)(sqlRequestData, { socket })
              .then((res) => {
                cb(null, res);
              })
              .catch((err) => {
                makeSocketError(cb, err);
              });
          }
        );
      }
      await this.dboBuilder.prostgles.opts.onLog?.({
        type: "debug",
        command: "pushSocketSchema",
        duration: -1,
        data: { socketId: socket.id, clientSchema },
      });
      socket.emit(CHANNELS.SCHEMA, clientSchema);
    } catch (err: any) {
      socket.emit(CHANNELS.SCHEMA, { err: getErrorAsObject(err) });
    }
  };
}

export async function getIsSuperUser(db: DB): Promise<boolean> {
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

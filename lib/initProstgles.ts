import * as promise from "bluebird";
import * as pgPromise from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";
import { isEmpty, pickKeys } from "prostgles-types";
import AuthHandler from "./AuthHandler";
import { DBEventsManager } from "./DBEventsManager";
import { DBOFullyTyped } from "./DBSchemaBuilder";
import { DBHandlerServer, Prostgles, ProstglesInitOptions, isSuperUser } from "./Prostgles";
import { PublishParser } from "./PublishParser/PublishParser";
import { sleep } from "./utils";

export type DbConnection = string | pg.IConnectionParameters<pg.IClient>;
export type DbConnectionOpts = pg.IDefaults;

export type PGP = pgPromise.IMain<{}, pg.IClient>;
export type DB = pgPromise.IDatabase<{}, pg.IClient>;

export type OnInitReason = 
  | { type: "schema change"; query: string; command: string; } 
  | { 
    type: "init" | "prgl.restart" | "prgl.update" | "TableConfig"
  }
export type OnReadyCallback<S = void> = (dbo: DBOFullyTyped<S>, db: DB, reason: OnInitReason) => any;
export type OnReadyCallbackBasic = (dbo: DBHandlerServer, db: DB, reason: OnInitReason) => any;

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
  update: (newOpts: Pick<ProstglesInitOptions, "fileTable" | "restApi" | "tableConfig">) => Promise<void>;
  restart: () => Promise<InitResult>; 
}

export const initProstgles = async function(this: Prostgles, onReady: OnReadyCallbackBasic, reason: OnInitReason): Promise<InitResult> {
  this.loaded = false;

  this.initWatchSchema(onReady);

  /* 1. Connect to db */
  if (!this.db) {
    const { db, pgp } = getDbConnection(this.opts.dbConnection, this.opts.dbOptions, this.opts.DEBUG_MODE,
      notice => {
        if (this.opts.onNotice) this.opts.onNotice(notice);
        if (this.dbEventsManager) {
          this.dbEventsManager.onNotice(notice)
        }
      }
    );
    this.db = db;
    this.pgp = pgp;
    this.isSuperUser = await isSuperUser(db);
  }
  this.checkDb();
  const db = this.db!;
  const pgp = this.pgp!;

  /* 2. Execute any SQL file if provided */
  if (this.opts.sqlFilePath) {
    await this.runSQLFile(this.opts.sqlFilePath);
  }

  try {

    await this.refreshDBO();
    await this.initTableConfig(reason);
    await this.initFileTable();
    await this.initRestApi();

    if (this.opts.publish) {

      if (!this.opts.io) console.warn("IO missing. Publish has no effect without io");

      /* 3.9 Check auth config */
      this.authHandler = new AuthHandler(this as any);
      await this.authHandler.init();

      this.publishParser = new PublishParser(this.opts.publish, this.opts.publishMethods as any, this.opts.publishRawSQL, this.dbo!, this.db, this as any);
      this.dboBuilder.publishParser = this.publishParser;

      /* 4. Set publish and auth listeners */
      await this.setSocketEvents();

    } else if (this.opts.auth) {
      throw "Auth config does not work without publish";
    }

    this.dbEventsManager = new DBEventsManager(db, pgp);


    this.writeDBSchema();

    /* 5. Finish init and provide DBO object */
    try {
      if (this.destroyed) {
        console.trace(1)
      }
      onReady(this.dbo as any, this.db, { type: "init" });
    } catch (err) {
      console.error("Prostgles: Error within onReady: \n", err)
    }

    this.loaded = true;
    return {
      db: this.dbo!,
      _db: db,
      pgp,
      io: this.opts.io,
      getTSSchema: this.getTSFileContent,
      update: async (newOpts) => {
        if("fileTable" in newOpts){
          this.opts.fileTable = newOpts.fileTable;
          await this.initFileTable();
        }
        if("restApi" in newOpts){
          this.opts.restApi = newOpts.restApi;
          await this.initRestApi();
        }
        if("tableConfig" in newOpts){
          this.opts.tableConfig = newOpts.tableConfig;
          await this.initTableConfig({ type: "prgl.update" });
          await this.refreshDBO();
        }
        if(!isEmpty(newOpts)){
          await this.init(onReady, { type: "prgl.update"});
        }
      },
      restart: () => this.init(onReady, { type: "prgl.restart" }),
      destroy: async () => {
        console.log("destroying prgl instance")
        this.destroyed = true;
        if (this.opts.io) {
          this.opts.io.on("connection", () => {
            console.log("Socket connected to destroyed instance")
          });

          /** Try to close IO without stopping http server */
          if(this.opts.io.sockets.constructor.name === "Namespace"){
            for (const socket of this.opts.io.sockets.sockets.values()) {
              socket._onclose("server shutting down");
            }
          }
          if(this.opts.io.engine.constructor.name === 'Server'){
            this.opts.io.engine.close();
          }
          // if (typeof this.opts.io.close === "function") {
          //   this.opts.io.close();
          //   console.log("this.io.close")
          // }
        }
        this.fileManager?.destroy();
        this.dboBuilder?.destroy();
        this.authHandler?.destroy();
        await this.tableConfigurator?.destroy();
        this.dbo = undefined;
        this.db = undefined;
        await db.$pool.end();
        await sleep(1000);
        return true;
      }
    };
  } catch (e: any) {
    console.trace(e)
    throw "init issues: " + e.toString();
  }
}

function getDbConnection(dbConnection: DbConnection, options: DbConnectionOpts | undefined, debugQueries = false, onNotice: ProstglesInitOptions["onNotice"]): { db: DB, pgp: PGP } {
  const pgp: PGP = pgPromise({

    promiseLib: promise,
    ...(debugQueries ? {
      query: function (ctx) {
        console.log({ 
          ...pickKeys(ctx, ["params", "query"]),
        });
      },
      error: (error, ctx) => {
        console.log({ 
          ...pickKeys(ctx, ["params", "query"]),
          error 
        });        
      }
    } : {}),
    ...((onNotice || debugQueries) ? {
      connect: function ({ client, dc, useCount }) {
        const isFresh = !useCount;
        if (isFresh && !client.listeners('notice').length) {
          client.on('notice', function (msg) {
            if (onNotice) {
              onNotice(msg, msg?.message);
            } else {
              console.log("notice: %j", msg?.message);
            }
          });
        }
        if (isFresh && !client.listeners('error').length) {
          client.on('error', function (msg) {
            if (onNotice) {
              onNotice(msg, msg?.message);
            } else {
              console.log("error: %j", msg?.message);
            }
          });
        }
      },
    } : {})
  });
  pgp.pg.defaults.max = 70;

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
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMP, v => v); // timestamp without time zone
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMPTZ, v => v); // timestamp with time zone
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.DATE, v => v); // date
  

  if (options) {
    Object.assign(pgp.pg.defaults, options);
  }

  return {
    db: pgp(dbConnection),
    pgp
  };
}
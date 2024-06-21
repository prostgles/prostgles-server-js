
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
  PG_COLUMN_UDT_DATA_TYPE,
  SQLOptions,
  getJoinHandlers
} from "prostgles-types";
import { getDBSchema } from "../DBSchemaBuilder";
import {
  DB, Prostgles
} from "../Prostgles";
import { PubSubManager } from "../PubSubManager/PubSubManager";
import {
  DbTableInfo,
  PublishParser
} from "../PublishParser/PublishParser";
import { Graph } from "../shortestPath";
import { clone } from "../utils";
import { DBHandlerServer, DbTxTableHandlers, LocalParams, TX, TableSchema, TxCB } from "./DboBuilderTypes";
import { QueryStreamer } from "./QueryStreamer";
import { TableHandler } from "./TableHandler/TableHandler";
import { JoinPaths, ViewHandler } from "./ViewHandler/ViewHandler";
import { parseJoinPath } from "./ViewHandler/parseJoinPath";
import { PGConstraint, getCanExecute, getConstraints, getSerializedClientErrorFromPGError } from "./dboBuilderUtils";
import { getTablesForSchemaPostgresSQL } from "./getTablesForSchemaPostgresSQL";
import { prepareShortestJoinPaths } from "./prepareShortestJoinPaths";
import { runSQL } from "./runSQL";
import { Join } from "../ProstglesTypes";

export * from "./DboBuilderTypes";
export * from "./dboBuilderUtils";

type OidInfo = {
  /**
   * Oid
   */
  relid: number;
  relname: string;
  schemaname: string;
};

type TableOidInfo = OidInfo & {
  pkey_columns: string[] | null;
};

type TableOidColumnInfo = OidInfo & {
  column_name: string;
  udt_name: string;
  ordinal_position: number;
};


export class DboBuilder {
  tablesOrViews?: TableSchema[];
  /**
   * Used in obtaining column names for error messages
   */
  constraints?: PGConstraint[];

  db: DB;

  dbo: DBHandlerServer;

  /**
   * Undefined if cannot create table triggers
   */
  private _pubSubManager?: PubSubManager;

  /**
   * Used for db.sql field type details
   */
  DATA_TYPES: { oid: string, typname: PG_COLUMN_UDT_DATA_TYPE }[] | undefined;
  USER_TABLES: TableOidInfo[] | undefined;
  USER_TABLE_COLUMNS: TableOidColumnInfo[] | undefined;
  
  queryStreamer: QueryStreamer;

  get tables(): DbTableInfo[] {
    return (this.tablesOrViews ?? []).map(({ name, columns }) => ({
      name,
      columns,
      info: this.dbo[name]!.tableOrViewInfo!
    }));
  }

  getPubSubManager = async (): Promise<PubSubManager> => {
    if (!this._pubSubManager) {

      const canExecute = await getCanExecute(this.db)
      if (!canExecute) throw "PubSubManager based subscriptions not possible: Cannot run EXECUTE statements on this connection";

      this._pubSubManager = await PubSubManager.create({
        dboBuilder: this,
      });
    }
    if (!this._pubSubManager) {
      console.trace("Could not create this._pubSubManager")
      throw "Could not create this._pubSubManager";
    }

    return this._pubSubManager;
  }

  tsTypesDefinition?: string;
  joinGraph?: Graph;
  private shortestJoinPaths: JoinPaths = [];

  prostgles: Prostgles;
  publishParser?: PublishParser;

  onSchemaChange?: (event: { command: string; query: string }) => void;

  private constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    if (!this.prostgles.db) throw "db missing"
    this.db = this.prostgles.db;
    this.dbo = {} as unknown as DBHandlerServer;
    this.queryStreamer = new QueryStreamer(this);
  }

  private init = async () => {

    await this.build();
    /* If watchSchema is enabled then PubSubManager must be created (if possible) because it creates the event trigger */
    if (
      this.prostgles.schemaWatch?.type.watchType === "DDL_trigger"
    ) {
      await this.getPubSubManager()
    }

    return this;
  }

  public static create = async (prostgles: Prostgles): Promise<DboBuilder> => {
    const res = new DboBuilder(prostgles)
    return await res.init();
  }


  destroy() {
    this._pubSubManager?.destroy();
  }

  _joins?: Join[];
  get joins(): Join[] {
    return clone(this._joins ?? []).filter(j => j.tables[0] !== j.tables[1]) as Join[];
  }

  set joins(j: Join[]) {
    this._joins = clone(j);
  }

  getAllJoinPaths() {
    return this.shortestJoinPaths;
  }

  prepareShortestJoinPaths = async () => {
    const { joins, shortestJoinPaths, joinGraph } = await prepareShortestJoinPaths(this);
    this.joinGraph = joinGraph;
    this.joins = joins;
    this.shortestJoinPaths = shortestJoinPaths;
  }

  runSQL = async (query: string, params: any, options: SQLOptions | undefined, localParams?: LocalParams) => {
    return runSQL.bind(this)(query, params, options, localParams).catch(error => Promise.reject(getSerializedClientErrorFromPGError(error, { type: "sql" })));
  }
  async build(): Promise<DBHandlerServer> {

    const start = Date.now();
    const tablesOrViewsReq = await getTablesForSchemaPostgresSQL(this, this.prostgles.opts.schema);
    await this.prostgles.opts.onLog?.({
      type: "debug",
      command: "DboBuilder.getTablesForSchemaPostgresSQL",
      data: tablesOrViewsReq.durations,
      duration: Date.now() - start,
    })
    this.tablesOrViews = tablesOrViewsReq.result;

    this.constraints = await getConstraints(this.db, this.prostgles.opts.schema);
    await this.prepareShortestJoinPaths();

    this.dbo = {};
    this.tablesOrViews.map(tov => {
      const columnsForTypes = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));


      const filterKeywords = Object.values(this.prostgles.keywords);
      const $filterCol = columnsForTypes.find(c => filterKeywords.includes(c.name));
      if ($filterCol) {
        throw `DboBuilder init error: \n\nTable ${JSON.stringify(tov.name)} column ${JSON.stringify($filterCol.name)} is colliding with Prostgles filtering functionality ($filter keyword)
                Please provide a replacement keyword name using the $filter_keyName init option. 
                Alternatively you can rename the table column\n`;
      }

      this.dbo[tov.escaped_identifier] = new (tov.is_view ? ViewHandler : TableHandler)(this.db, tov, this, undefined, this.shortestJoinPaths);

      if (this.shortestJoinPaths && this.shortestJoinPaths.find(jp => [jp.t1, jp.t2].includes(tov.name))) {

        const table = tov.name;

        this.dbo.innerJoin ??= {};
        this.dbo.leftJoin ??= {};
        this.dbo.innerJoinOne ??= {};
        this.dbo.leftJoinOne ??= {};

        const joinHandlers = getJoinHandlers(table);
        //@ts-ignore
        this.dbo.leftJoin[table] = joinHandlers.leftJoin;
        this.dbo.innerJoin[table] = joinHandlers.innerJoin;
        this.dbo.leftJoinOne[table] = joinHandlers.leftJoinOne;
        this.dbo.innerJoinOne[table] = joinHandlers.innerJoinOne;
      }
    });

    if (this.prostgles.opts.transactions) {
      let txKey = "tx";
      if (typeof this.prostgles.opts.transactions === "string") txKey = this.prostgles.opts.transactions;

      (this.dbo[txKey] as unknown as TX) = (cb: TxCB) => this.getTX(cb);
    }

    if (!this.dbo.sql) {

      this.dbo.sql = this.runSQL;
    } else {
      console.warn(`Could not create dbo.sql handler because there is already a table named "sql"`)
    }

    this.tsTypesDefinition = [
      `/* SCHEMA DEFINITON. Table names have been altered to work with Typescript */`,
      `/* DBO Definition */`,
      getDBSchema(this)
    ].join("\n");

    return this.dbo;
  }

  getShortestJoinPath = (viewHandler: ViewHandler, target: string): JoinPaths[number] | undefined => {
    const source = viewHandler.name;
    if(source === target){
      const joinPath = parseJoinPath({
        rawPath: target,
        rootTable: source,
        viewHandler
      });

      if(!joinPath) return undefined;

      return {
        t1: source,
        t2: target,
        path: [source]
      }
    }

    const jp = this.shortestJoinPaths.find(jp => jp.t1 === source && jp.t2 === target);
    return jp;
  }

  getTX = async (cb: TxCB) => {
    try {
      const transaction = await this.db.tx(t => {
        const dbTX: DbTxTableHandlers & Pick<DBHandlerServer, "sql"> = {};
        this.tablesOrViews?.map(tov => {
          dbTX[tov.name] = new (tov.is_view ? ViewHandler : TableHandler)(this.db, tov, this, { t, dbTX }, this.shortestJoinPaths);
        });
        dbTX.sql = (q, args, opts, localP) => this.runSQL(q, args, opts, { tx: { dbTX, t }, ...(localP ?? {}) })
  
        return cb(dbTX, t);
      });
  
      return transaction;

    } catch (e) {
      console.error("Error in getTX", e);
      throw e;
    }
  }
}

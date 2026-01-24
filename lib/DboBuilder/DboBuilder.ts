/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PG_COLUMN_UDT_DATA_TYPE, SQLOptions } from "prostgles-types";
import { getSerialisableError, isDefined, tryCatchV2 } from "prostgles-types";
import { getDBTypescriptSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import { getFunctionsTypescriptSchema } from "../DBSchemaBuilder/getFunctionsTypescriptSchema";
import type { DB, Prostgles } from "../Prostgles";
import type { Join } from "../ProstglesTypes";
import { PubSubManager } from "../PubSubManager/PubSubManager";
import { getCreatePubSubManagerError } from "../PubSubManager/getCreatePubSubManagerError";
import type { DbTableInfo, PublishParser } from "../PublishParser/PublishParser";
import type { ServerFunctionDefinition } from "../PublishParser/defineServerFunction";
import { getQueryErrorPositionInfo } from "../TableConfig/runSQLFile";
import type { Graph } from "../shortestPath";
import { clone } from "../utils/utils";
import type {
  DBHandlerServer,
  DbTxTableHandlers,
  LocalParams,
  SQLHandlerServer,
  TableSchema,
  TxCB,
} from "./DboBuilderTypes";
import { QueryStreamer } from "./QueryStreamer";
import { TableHandler } from "./TableHandler/TableHandler";
import type { JoinPaths } from "./ViewHandler/ViewHandler";
import { ViewHandler } from "./ViewHandler/ViewHandler";
import { parseJoinPath } from "./ViewHandler/parseJoinPath";
import type { PGConstraint } from "./dboBuilderUtils";
import {
  getCanExecute,
  getConstraints,
  getSerializedClientErrorFromPGError,
} from "./dboBuilderUtils";
import { prepareShortestJoinPaths } from "./prepareShortestJoinPaths";
import { cacheDBTypes, runSQL } from "./runSQL";
import { getTablesForSchemaPostgresSQL } from "./schema/getTablesForSchemaPostgresSQL";

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

  dboMap: Map<string, TableHandler | ViewHandler> = new Map();

  /**
   * Undefined if cannot create table triggers
   */
  private _pubSubManager?: PubSubManager;

  /**
   * Used for db.sql field type details
   */
  DATA_TYPES: { oid: string; typname: PG_COLUMN_UDT_DATA_TYPE }[] | undefined;
  DATA_TYPES_DBKEY = "";
  USER_TABLES: TableOidInfo[] | undefined;
  USER_TABLE_COLUMNS: TableOidColumnInfo[] | undefined;

  queryStreamer: QueryStreamer;

  get tables(): DbTableInfo[] {
    return (this.tablesOrViews ?? [])
      .map(({ name, columns }) => {
        const info = this.dbo[name]?.tableOrViewInfo;
        if (!info) return undefined;
        return {
          name,
          columns,
          info,
        };
      })
      .filter(isDefined);
  }

  getPubSubManagerPromise?: Promise<PubSubManager>;
  getPubSubManager = async (): Promise<PubSubManager> => {
    this.getPubSubManagerPromise ??= (async () => {
      if (!this._pubSubManager) {
        const canExecute = await getCanExecute(this.db);
        if (!canExecute)
          throw "PubSubManager based subscriptions not possible: Cannot run EXECUTE statements on this connection";

        const {
          data: pubSubManager,
          error,
          hasError,
        } = await tryCatchV2(async () => {
          const pubSubManager = await PubSubManager.create(this);
          return pubSubManager;
        });
        this._pubSubManager = pubSubManager;
        if (hasError || !this._pubSubManager) {
          await this.prostgles.opts.onLog?.({
            type: "debug",
            command: "PubSubManager.create",
            duration: 0,
            error: getSerialisableError(error),
          });
          console.error("Could not create PubSubManager", getQueryErrorPositionInfo(error));
          throw "Could not create this._pubSubManager check logs";
        }
      }
      return this._pubSubManager;
    })();
    return this.getPubSubManagerPromise;
  };

  tsTypesDefinition?: string;
  joinGraph?: Graph;
  private shortestJoinPaths: JoinPaths = [];

  prostgles: Prostgles;
  publishParser?: PublishParser;

  onSchemaChange?: (event: { command: string; query: string }) => void;

  private constructor(prostgles: Prostgles) {
    this.prostgles = prostgles;
    if (!this.prostgles.db) throw "db missing";
    this.db = this.prostgles.db;
    this.dbo = {} as unknown as DBHandlerServer;
    this.dboMap = new Map();
    this.queryStreamer = new QueryStreamer(this);
  }

  private init = async () => {
    await this.build();
    /* If watchSchema is enabled then PubSubManager must be created (if possible) because it creates the event trigger */
    if (this.prostgles.schemaWatch?.type.watchType === "DDL_trigger") {
      await this.getPubSubManager();
    }

    return this;
  };

  public static create = async (prostgles: Prostgles): Promise<DboBuilder> => {
    const res = new DboBuilder(prostgles);
    return await res.init();
  };

  destroy() {
    return this._pubSubManager?.destroy();
  }

  _joins?: Join[];
  get joins(): Join[] {
    return clone(this._joins ?? []).filter((j) => j.tables[0] !== j.tables[1]);
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
  };

  runSQL: SQLHandlerServer = async (
    query: string,
    params: any,
    options: SQLOptions | undefined,
    localParams: LocalParams | undefined,
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return runSQL
      .bind(this)(query, params, options, localParams)
      .catch((error) =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        Promise.reject(
          getSerializedClientErrorFromPGError(error, {
            type: "sql",
            localParams,
          }),
        ),
      );
  };

  canSubscribe = false;
  checkingCanSubscribe = false;
  async build(): Promise<DBHandlerServer> {
    if (!this.canSubscribe && !this.checkingCanSubscribe) {
      this.checkingCanSubscribe = true;
      const subscribeError = await getCreatePubSubManagerError(this);
      if (subscribeError) {
        console.error(
          "Could not initiate PubSubManager. Realtime data/Subscriptions will not work. Error: ",
          subscribeError,
        );
        this.canSubscribe = false;
      } else {
        this.canSubscribe = true;
      }
      this.checkingCanSubscribe = false;
    }
    const start = Date.now();
    const tablesOrViewsReq = await getTablesForSchemaPostgresSQL(
      this,
      this.prostgles.opts.schemaFilter,
    );
    await this.prostgles.opts.onLog?.({
      type: "debug",
      command: "DboBuilder.getTablesForSchemaPostgresSQL",
      data: tablesOrViewsReq.durations,
      duration: Date.now() - start,
    });
    const tablesOrViews = tablesOrViewsReq.result;
    this.tablesOrViews = tablesOrViews;

    this.constraints = await getConstraints(this.db, this.prostgles.opts.schemaFilter);
    await this.prepareShortestJoinPaths();

    this.dbo = {};
    this.tablesOrViews.map((tov) => {
      const columnsForTypes = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));

      const filterKeywords = Object.values(this.prostgles.keywords);
      const $filterCol = columnsForTypes.find((c) => filterKeywords.includes(c.name));
      if ($filterCol) {
        throw `DboBuilder init error: \n\nTable ${JSON.stringify(tov.name)} column ${JSON.stringify($filterCol.name)} is colliding with Prostgles filtering functionality ($filter keyword)
                Please provide a replacement keyword name using the $filter_keyName init option. 
                Alternatively you can rename the table column\n`;
      }

      const tableHandler = new (tov.is_view ? ViewHandler : TableHandler)(
        this.db,
        tov,
        this,
        undefined,
        this.shortestJoinPaths,
      );
      this.dbo[tov.name] = tableHandler;
      this.dboMap.set(tov.name, tableHandler);
    });

    if (this.prostgles.opts.transactions) {
      const txKey = "tx";

      //@ts-ignore
      this.dbo[txKey] = <R, TH extends DbTxTableHandlers & Pick<DBHandlerServer, "sql">>(
        cb: TxCB<Promise<R>, TH>,
      ) => this.getTX(cb);
    }

    const { functions } = this.prostgles.opts;
    let resolvedFunctions = {} as { [key: string]: ServerFunctionDefinition };
    if (functions) {
      try {
        resolvedFunctions = await functions(undefined);
      } catch (e) {
        console.error("Invalid functions:", e);
        throw e;
      }
    }
    this.tsTypesDefinition = [
      `/* Schema definition generated by prostgles-server */`,
      getDBTypescriptSchema({
        config: this.prostgles.opts.tableConfig,
        tablesOrViews,
      }),
      getFunctionsTypescriptSchema(tablesOrViews, resolvedFunctions),
    ].join("\n");

    return this.dbo;
  }

  getShortestJoinPath = (
    viewHandler: ViewHandler,
    target: string,
  ): JoinPaths[number] | undefined => {
    const source = viewHandler.name;
    if (source === target) {
      parseJoinPath({
        rawPath: target,
        rootTable: source,
        viewHandler,
      });

      return {
        t1: source,
        t2: target,
        path: [source],
      };
    }

    const jp = this.shortestJoinPaths.find((jp) => jp.t1 === source && jp.t2 === target);
    return jp;
  };

  getTX = async <R, TH extends DbTxTableHandlers>(cb: TxCB<Promise<R> | R, TH>) => {
    return this.db.tx((t) => {
      const dbTX: DbTxTableHandlers = {};
      this.tablesOrViews?.map((tov) => {
        const handlerClass = tov.is_view ? ViewHandler : TableHandler;
        dbTX[tov.name] = new handlerClass(this.db, tov, this, { t, dbTX }, this.shortestJoinPaths);
      });
      // dbTX.sql = (q, args, opts, localParams) => {
      //   if (localParams?.tx) {
      //     throw "Cannot run transaction within transaction";
      //   }
      //   return this.runSQL(q, args, opts, { ...localParams, tx: { dbTX, t } });
      // };

      return cb(dbTX as TH, t);
    });
  };

  cacheDBTypes = cacheDBTypes.bind(this);
}

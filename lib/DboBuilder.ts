
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Bluebird from "bluebird";

import * as pgPromise from 'pg-promise';
import {
  AnyObject,
  ColumnInfo,
  DbJoinMaker,
  EXISTS_KEY,
  PG_COLUMN_UDT_DATA_TYPE,
  ProstglesError,
  RawJoinPath,
  SQLHandler,
  SQLOptions,
  TableInfo as TInfo,
  TS_PG_Types,
  getJoinHandlers,
  getKeys,
  isObject
} from "prostgles-types";
import { getSchemaFilter, getTablesForSchemaPostgresSQL } from "./DboBuilder/getTablesForSchemaPostgresSQL";
import { runSQL } from "./DboBuilder/runSQL";
import { sqlErrCodeToMsg } from "./DboBuilder/sqlErrCodeToMsg";
import pg = require('pg-promise/typescript/pg-subset');

export type SortItem = {
  asc: boolean;
  nulls?: "first" | "last";
  nullEmpty?: boolean;
  key: string;
  nested?: {
    table: string;
    selectItemAlias: string;
    isNumeric: boolean;
    wrapperQuerySortItem: string;
    joinAlias: string;
  };
} & ({
  type: "query";
  fieldQuery: string;
} | {
  type: "position";
  fieldPosition: number;
});

export type ParsedMedia = Required<Pick<Media, "extension" | "content_type">>;

export type Media = {
  "id"?: string;
  "title"?: string;
  "extension"?: string;
  "content_type"?: string;
  "content_length"?: number;
  "url"?: string;
  "added"?: Date;
  "signed_url"?: string;
  "signed_url_expires"?: number;
  "name"?: string;
  "original_name"?: string;
  "etag"?: string;
  deleted?: string | null;
  deleted_from_storage?: string | null;
}

export type TxCB<TH = DbTxTableHandlers> = {
  (t: TH & Pick<DBHandlerServer, "sql">, _t: pgPromise.ITask<{}>): (any | void);
}
export type TX<TH = TableHandlers> = {
  (t: TxCB<TH>): Promise<(any | void)>;
}

export type TableHandlers = {
  [key: string]: Partial<TableHandler> | TableHandler;
}
export type DbTxTableHandlers = {
  [key: string]: Omit<Partial<TableHandler>, "dbTx"> | Omit<TableHandler, "dbTx">;
}

export type DBHandlerServer<TH = TableHandlers> =
  TH &
  Partial<DbJoinMaker> & {
    sql?: SQLHandler
  } & {
    tx?: TX<TH>
  }


import { FieldSpec, } from "./DboBuilder/QueryBuilder/Functions";
import { JoinPaths, ViewHandler } from "./DboBuilder/ViewHandler/ViewHandler";
import {
  DB,
  Join, Prostgles,
  ProstglesInitOptions
} from "./Prostgles";
import { BasicCallback, PubSubManager, pickKeys } from "./PubSubManager/PubSubManager";
import {
  PublishAllOrNothing,
  PublishParser,
} from "./PublishParser";
import { clone } from "./utils";


type PGP = pgPromise.IMain<{}, pg.IClient>;
export const pgp: PGP = pgPromise({
  promiseLib: Bluebird
  // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});

export type TableInfo = TInfo & {
  schema: string;
  name: string;
  oid: number;
  comment: string;
  columns: ColumnInfo[];
}

export type ViewInfo = TableInfo & {
  parent_tables: string[]
}

export type TableOrViewInfo = TableInfo & ViewInfo & {
  is_view: boolean;
}

export type PRGLIOSocket = {
  readonly id: string;

  readonly handshake: {
    query?: Record<string, string>;
    /**
     * IP Address
     */
    address: string;
    headers?: AnyObject & { cookie?: string; };  //  e.g.: "some_arg=dwdaw; otherarg=23232"
    auth?: Record<string, any>;
  }

  readonly on: (channel: string, params: any, cb?: (err: any, res?: any) => void) => Promise<void>;

  readonly emit: (channel: string, message: any, cb?: BasicCallback) => any;

  readonly once: (channel: string, cb: (_data: any, cb: BasicCallback) => void) => void;

  readonly removeAllListeners: (channel: string) => void;

  readonly disconnect: () => void;

  readonly request: {
    url: string;
    connection: { remoteAddress: string; }
  }

  /** Used for session caching */
  __prglCache?: {
    session: BasicSession;
    user: UserLike;
    clientUser: AnyObject;
  }

  _user?: AnyObject

  /** Used for publish error caching */
  prostgles?: AnyObject;
};

export type LocalParams = {
  httpReq?: any;
  socket?: PRGLIOSocket;
  func?: () => any;
  isRemoteRequest?: {
    user?: UserLike | undefined;
  };
  testRule?: boolean;
  tableAlias?: string;
  // subOne?: boolean;

  tx?: {
    dbTX: TableHandlers;
    t: pgPromise.ITask<{}>;
  }

  // localTX?: pgPromise.ITask<{}>;

  returnQuery?: boolean | "noRLS" | "where-condition";
  returnNewQuery?: boolean;
  /** Used for count/size queries */
  bypassLimit?: boolean;

  nestedInsert?: {
    depth: number;
    previousData: AnyObject;
    previousTable: string;
    referencingColumn?: string;
  }
}

export function escapeTSNames(str: string, capitalize = false): string {
  let res = str;
  res = (capitalize ? str[0]?.toUpperCase() : str[0]) + str.slice(1);
  if (canBeUsedAsIsInTypescript(res)) return res;
  return JSON.stringify(res);
}

export type Aggregation = {
  field: string,
  query: string,
  alias: string,
  getQuery: (alias: string) => string;
};

export type Filter = AnyObject | { $and: Filter[] } | { $or: Filter[] };

export type JoinInfo = {
  /**
   * If true then all joins involve unique columns and the result is a 1 to 1 join
   */
  expectOne?: boolean,
  paths: {

    /**
     * The table that JOIN ON columns refer to.
     * columns in index = 1 refer to this table. index = 0 columns refer to previous JoinInfo.table
     */
    table: string,

    /**
     * Source and target JOIN ON column groups for each existing constraint
     * Each inner array group will be combined with AND and outer arrays with OR to allow multiple references to the same table  
     * e.g.:    [[source_table_column: string, table_column: string]]
     */
    on: [string, string][][],

    /**
     * Source table name
     */
    source: string,

    /**
     * Target table name
     */
    target: string
  }[]
}

import { Graph } from "./shortestPath";

export type CommonTableRules = {

  /**
   * True by default. Allows clients to get column information on any columns that are allowed in (select, insert, update) field rules. 
   */
  getColumns?: PublishAllOrNothing;

  /**
   * True by default. Allows clients to get table information (oid, comment, label, has_media). 
   */
  getInfo?: PublishAllOrNothing
}

export type ValidatedTableRules = CommonTableRules & {

  /* All columns of the view/table. Includes computed fields as well */
  allColumns: FieldSpec[];

  select: {
    /* Fields you can select */
    fields: string[];

    /* Fields you can select */
    orderByFields: string[];

    /* Filter applied to every select */
    filterFields: string[];

    /* Filter applied to every select */
    forcedFilter: any;

    /* Max limit allowed for each select. 1000 by default. If null then an unlimited select is allowed when providing { limit: null } */
    maxLimit: number | null;
  },
  update: {
    /* Fields you can update */
    fields: string[];

    /* Fields you can return after updating */
    returningFields: string[];

    /* Fields you can use in filtering when updating */
    filterFields: string[];

    /* Filter applied to every update. Filter fields cannot be updated */
    forcedFilter: any;

    /* Data applied to every update */
    forcedData: any;
  },
  insert: {
    /* Fields you can insert */
    fields: string[];

    /* Fields you can return after inserting. Will return select.fields by default */
    returningFields: string[];

    /* Data applied to every insert */
    forcedData: any;
  },
  delete: {
    /* Fields to filter by when deleting */
    filterFields: string[];

    /* Filter applied to every deletes */
    forcedFilter: any;

    /* Fields you can return after deleting */
    returningFields: string[];
  }
}

/* DEBUG CLIENT ERRORS HERE */
export function makeErrorFromPGError(err: any, localParams?: LocalParams, view?: ViewHandler, allowedKeys?: string[]) {
  // console.trace(err)
  if (process.env.TEST_TYPE || process.env.PRGL_DEBUG) {
    console.trace(err)
  }
  const errObject = {
    ...((!localParams || !localParams.socket) ? err : {}),
    ...pickKeys(err, ["column", "code", "table", "constraint", "hint"]),
    ...(err && err.toString ? { txt: err.toString() } : {}),
    code_info: sqlErrCodeToMsg(err.code)
  };
  if (view?.dboBuilder?.constraints && errObject.constraint && !errObject.column) {
    const constraint = view.dboBuilder.constraints
      .find(c => c.conname === errObject.constraint && c.relname === view.name);
    if (constraint) {
      const cols = view.columns.filter(c =>
        (!allowedKeys || allowedKeys.includes(c.name)) &&
        constraint.conkey.includes(c.ordinal_position)
      );
      const [firstCol] = cols;
      if (firstCol) {
        errObject.column = firstCol.name;
        errObject.columns = cols.map(c => c.name);
      }
    }
  }
  return Promise.reject(errObject);
}

/**
 * Ensure the error is an Object and has 
 */
export function parseError(e: any, caller: string): ProstglesError {

  const errorObject = isObject(e) ? e : undefined;
  const message = typeof e === "string" ? e : e instanceof Error ? e.message :
    isObject(errorObject) ? (errorObject.message ?? errorObject.txt ?? JSON.stringify(errorObject) ?? "") : "";
  const stack = [
    ...(errorObject && Array.isArray(errorObject.stack) ? errorObject.stack : []),
    caller
  ]
  const result: ProstglesError = {
    ...errorObject,
    message,
    stack,
  }
  return result;
}

export type ExistsFilterConfig = {
  existType: EXISTS_KEY;
  /**
   * Target table filter. target table is the last table from tables
   */
  targetTableFilter: Filter;

} & ({
  isJoined: true;
  /**
   * list of join tables in their order
   * If table path starts with "**" then get shortest join to first table
   * e.g.: "**.users" means finding the shortest join from root table to users table
   */
  path: RawJoinPath;
  parsedPath: ParsedJoinPath[]
} | {
  isJoined: false;
  targetTable: string;
});

import { BasicSession, UserLike } from "./AuthHandler";
import { getDBSchema } from "./DBSchemaBuilder";
import { asNameAlias } from "./DboBuilder/QueryBuilder/QueryBuilder";
import { TableHandler } from "./DboBuilder/TableHandler/TableHandler";
import { ParsedJoinPath, parseJoinPath } from "./DboBuilder/ViewHandler/parseJoinPath";
import { prepareShortestJoinPaths } from "./DboBuilder/prepareShortestJoinPaths";

export class DboBuilder {
  tablesOrViews?: TableSchema[];   //TableSchema           TableOrViewInfo
  /**
   * Used in obtaining column names for error messages
   */
  constraints?: PGConstraint[];

  db: DB;

  // dbo: DBHandlerServer | DBHandlerServerTX;
  dbo: DBHandlerServer;
  _pubSubManager?: PubSubManager;

  /**
   * Used for db.sql field type details
   */
  DATA_TYPES: { oid: string, typname: PG_COLUMN_UDT_DATA_TYPE }[] | undefined;
  USER_TABLES: {
    /**
     * oid of the table
     */
    relid: number;
    relname: string;
    schemaname: string;
    pkey_columns: string[] | null;
  }[] | undefined;
  USER_TABLE_COLUMNS: {
    relid: number;
    schemaname: string;
    relname: string;
    column_name: string;
    udt_name: string;
    ordinal_position: number;
  }[] | undefined;

  getPubSubManager = async (): Promise<PubSubManager> => {
    if (!this._pubSubManager) {
      let onSchemaChange;

      const { isSuperUs } = await PubSubManager.canCreate(this.db);
      if (!canEXECUTE) throw "PubSubManager based subscriptions not possible: Cannot run EXECUTE statements on this connection";

      if (this.prostgles.opts.watchSchema && this.prostgles.opts.watchSchemaType === "DDL_trigger") {
        if (!isSuperUs) {
          console.warn(`watchSchemaType "${this.prostgles.opts.watchSchemaType}" cannot be used because db user is not a superuser. Will fallback to watchSchemaType "prostgles_queries" `)
        } else {
          onSchemaChange = (event: { command: string; query: string }) => {
            this.prostgles.onSchemaChange(event)
          }
        }
      }

      this._pubSubManager = await PubSubManager.create({
        dboBuilder: this,
        onSchemaChange
      });
    }
    if (!this._pubSubManager) {
      console.trace("Could not create this._pubSubManager")
      throw "Could not create this._pubSubManager";
    }

    return this._pubSubManager;
  }

  pojoDefinitions?: string[];
  // dboDefinition?: string;

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
  }

  private init = async () => {


    /* If watchSchema then PubSubManager must be created (if possible) */
    await this.build();
    if (
      this.prostgles.opts.watchSchema &&
      (this.prostgles.opts.watchSchemaType === "DDL_trigger" || !this.prostgles.opts.watchSchemaType) &&
      this.prostgles.isSuperUser
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
    return runSQL.bind(this)(query, params, options, localParams);
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

  getTX = (cb: TxCB) => {
    return this.db.tx(t => {
      const dbTX: DbTxTableHandlers & Pick<DBHandlerServer, "sql"> = {};
      this.tablesOrViews?.map(tov => {
        dbTX[tov.name] = new (tov.is_view ? ViewHandler : TableHandler)(this.db, tov, this, { t, dbTX }, this.shortestJoinPaths);
      });
      // ???? getKeys(dbTX).map(k => {
      //   dbTX[k]!.dbTX = dbTX;
      // });
      dbTX.sql = (q, args, opts, localP) => this.runSQL(q, args, opts, { tx: { dbTX, t }, ...(localP ?? {}) })

      return cb(dbTX, t);
    });
  }
}

export type TableSchemaColumn = ColumnInfo & {
  privileges: Partial<Record<"INSERT" | "REFERENCES" | "SELECT" | "UPDATE", true>>;// | "DELETE";
}

/* UTILS */
export type TableSchema = {
  schema: string;
  name: string;
  escaped_identifier: string;
  oid: number;
  comment: string;
  columns: TableSchemaColumn[];
  is_view: boolean;
  view_definition: string | null;
  parent_tables: string[];
  privileges: {
    insert: boolean;
    select: boolean;
    update: boolean;
    delete: boolean;
  };
  /** Cannot add triggers to hyperTables */
  isHyperTable?: boolean;
}

type PGConstraint = {

  /**
   * Constraint type
   */
  contype:
  | "u" // Unique
  | "p" // Primary key 
  | "c" // Check

  /**
   * Column ordinal positions
   */
  conkey: number[];

  /**
   * Constraint name
   */
  conname: string;

  /**
   * Table name
   */
  relname: string;
};

async function getConstraints(db: DB, schema: ProstglesInitOptions["schema"], filter?: { table: string; column: string; }): Promise<PGConstraint[]> {
  const { sql, schemaNames } = getSchemaFilter(schema);
  return db.any(`
    SELECT rel.relname, con.conkey, con.conname, con.contype
    FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel
            ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp
            ON nsp.oid = connamespace
    WHERE nsp.nspname ${sql}
  `, { schemaNames });
}


export function isPlainObject(o: any): o is Record<string, any> {
  return Object(o) === o && Object.getPrototypeOf(o) === Object.prototype;
}

export function postgresToTsType(udt_data_type: PG_COLUMN_UDT_DATA_TYPE): keyof typeof TS_PG_Types {
  return getKeys(TS_PG_Types).find(k => {
    // @ts-ignore
    return TS_PG_Types[k].includes(udt_data_type)
  }) ?? "any";
}

export const prepareOrderByQuery = (items: SortItem[], tableAlias?: string): string[] => {
  if (!items.length) return [];
  return ["ORDER BY " + items.map(d => {

    const orderType = d.asc ? " ASC " : " DESC ";
    const nullOrder = d.nulls ? ` NULLS ${d.nulls === "first" ? " FIRST " : " LAST "}` : "";
    if(d.type === "query" && d.nested){
      return d.fieldQuery;
    }
    return `${asNameAlias(d.key, tableAlias)} ${orderType} ${nullOrder}`;
  }).join(", ")]
}

export const canEXECUTE = async (db: DB) => {

  try {
    await db.any(`DO $$ BEGIN  EXECUTE 'select 1'; END $$;`);
    return true;
  } catch (error) {
    console.warn(error)
  }

  return false;
}

export const withUserRLS = (localParams: LocalParams | undefined, query: string) => {

  const user = localParams?.isRemoteRequest?.user;
  const queryPrefix = `SET SESSION "prostgles.user" \nTO`
  let firstQuery = `${queryPrefix} '';`;
  if (user) {
    firstQuery = pgp.as.format(`${queryPrefix} \${user};`, { user });
  }

  return [firstQuery, query].join("\n");
}


function canBeUsedAsIsInTypescript(str: string): boolean {
  if (!str) return false;
  const isAlphaNumericOrUnderline = str.match(/^[a-z0-9_]+$/i);
  const startsWithCharOrUnderscore = str[0]?.match(/^[a-z_]+$/i);
  return Boolean(isAlphaNumericOrUnderline && startsWithCharOrUnderscore);
}
function snakify(str: string, capitalize = false): string {

  return str.split("").map((c, i) => {

    if (!i) {
      if (capitalize) c = c.toUpperCase();
      if (c.match(/[^a-z_A-Z]/)) {
        return ((capitalize) ? "D_" : "_") + c.charCodeAt(0);
      }
    } else {
      if (c.match(/[^a-zA-Z_0-9]/)) {
        return "_" + c.charCodeAt(0);
      }
    }

    return c;

  }).join("");
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as pgPromise from "pg-promise";
import {
  AnyObject,
  ClientSchema,
  ColumnInfo,
  DbJoinMaker,
  EXISTS_KEY,
  RawJoinPath,
  SQLHandler,
  TableInfo as TInfo,
  UserLike,
} from "prostgles-types";
import { BasicSession, ExpressReq } from "../Auth/AuthTypes";
import { BasicCallback } from "../PubSubManager/PubSubManager";
import { PublishAllOrNothing } from "../PublishParser/PublishParser";
import { FieldSpec } from "./QueryBuilder/Functions";
import { TableHandler } from "./TableHandler/TableHandler";
import { ParsedJoinPath } from "./ViewHandler/parseJoinPath";
import pg = require("pg-promise/typescript/pg-subset");

type PGP = pgPromise.IMain<{}, pg.IClient>;

export type TableSchemaColumn = ColumnInfo & {
  privileges: Partial<Record<"INSERT" | "REFERENCES" | "SELECT" | "UPDATE", true>>;
};

export type TableSchema = Pick<TableInfo, "uniqueColumnGroups"> & {
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
};

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
} & (
  | {
      type: "query";
      fieldQuery: string;
    }
  | {
      type: "position";
      fieldPosition: number;
    }
);

export type Media = {
  id?: string;
  title?: string;
  extension?: string;
  content_type?: string;
  content_length?: number;
  url?: string;
  added?: Date;
  signed_url?: string;
  signed_url_expires?: number;
  name?: string;
  original_name?: string;
  etag?: string;
  deleted?: string | null;
  deleted_from_storage?: string | null;
};

export type ParsedMedia = Required<Pick<Media, "extension" | "content_type">>;

export type TxCB<TH = DbTxTableHandlers> = {
  (t: TH & Pick<DBHandlerServer, "sql">, _t: pgPromise.ITask<{}>): any | void;
};
export type TX<TH = TableHandlers> = {
  (t: TxCB<TH>): Promise<any | void>;
};

export type TableHandlers = {
  [key: string]: Partial<TableHandler>;
};
export type DbTxTableHandlers = {
  [key: string]: Omit<Partial<TableHandler>, "dbTx"> | Omit<TableHandler, "dbTx">;
};

export type DBHandlerServerExtra<TH = TableHandlers, WithTransactions = true> = {
  sql: SQLHandler;
} & (WithTransactions extends true ? { tx: TX<TH> } : Record<string, never>);

// export type DBHandlerServer<TH = TableHandlers> =
//   TH &
//   Partial<DbJoinMaker> & {
//     sql?: SQLHandler
//   } & {
//     tx?: TX<TH>
//   }

export type DBHandlerServer<TH = TableHandlers> = TH &
  Partial<DbJoinMaker> & {
    sql?: SQLHandler;
  } & {
    tx?: TX<TH>;
  };

export const pgp: PGP = pgPromise({
  // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});

export type TableInfo = TInfo & {
  schema: string;
  name: string;
  oid: number;
  comment: string;
  columns: ColumnInfo[];
};

export type ViewInfo = TableInfo & {
  parent_tables: string[];
};

export type TableOrViewInfo = TableInfo &
  ViewInfo & {
    is_view: boolean;
  };

export type PRGLIOSocket = {
  readonly id: string;

  readonly handshake: {
    query?: Record<string, string | string[] | undefined>;
    /**
     * IP Address
     */
    address: string;
    headers?: AnyObject & { cookie?: string }; //  e.g.: "some_arg=dwdaw; otherarg=23232"
    auth?: Record<string, any>;
  };

  readonly on: (channel: string, params: any, cb?: (err: any, res?: any) => void) => any; // Promise<void>;

  readonly emit: (channel: string, message?: any, cb?: BasicCallback) => any;

  readonly once: (channel: string, cb: (_data: any, cb: BasicCallback) => void) => void;

  readonly removeAllListeners: (channel: string) => void;

  readonly disconnect: () => void;

  readonly request: {
    url?: string;
    connection: { remoteAddress?: string };
  };

  /** Used for session caching */
  __prglCache?: {
    session: BasicSession;
    user: UserLike;
    clientUser: UserLike;
  };

  _user?: AnyObject;

  /** Used for publish error caching */
  prostgles?: ClientSchema;
};

export type LocalParams = {
  httpReq?: ExpressReq;
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
  };

  /** Used to exclude certain logs */
  noLog?: boolean;

  returnQuery?: boolean | "noRLS" | "where-condition";
  returnNewQuery?: boolean;
  /** Used for count/size queries */
  bypassLimit?: boolean;

  nestedInsert?: {
    depth: number;
    previousData: AnyObject;
    previousTable: string;
    referencingColumn?: string;
  };
};

export type Aggregation = {
  field: string;
  query: string;
  alias: string;
  getQuery: (alias: string) => string;
};

export type Filter = AnyObject | { $and: Filter[] } | { $or: Filter[] };

export type JoinInfo = {
  /**
   * If true then all joins involve unique columns and the result is a 1 to 1 join
   */
  expectOne?: boolean;
  paths: {
    /**
     * The table that JOIN ON columns refer to.
     * columns in index = 1 refer to this table. index = 0 columns refer to previous JoinInfo.table
     */
    table: string;

    /**
     * Source and target JOIN ON column groups for each existing constraint
     * Each inner array group will be combined with AND and outer arrays with OR to allow multiple references to the same table
     * e.g.:    [[source_table_column: string, table_column: string]]
     */
    on: [string, string][][];

    /**
     * Source table name
     */
    source: string;

    /**
     * Target table name
     */
    target: string;
  }[];
};

export type CommonTableRules = {
  /**
   * True by default. Allows clients to get column information on any columns that are allowed in (select, insert, update) field rules.
   */
  getColumns?: PublishAllOrNothing;

  /**
   * True by default. Allows clients to get table information (oid, comment, label, has_media).
   */
  getInfo?: PublishAllOrNothing;
};

export type ValidatedTableRules = CommonTableRules & {
  /* All columns of the view/table. Includes computed fields as well */
  allColumns: FieldSpec[];

  select?: {
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
  };
  update?: {
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
  };
  insert?: {
    /* Fields you can insert */
    fields: string[];

    /* Fields you can return after inserting. Will return select.fields by default */
    returningFields: string[];

    /* Data applied to every insert */
    forcedData: any;
  };
  delete?: {
    /* Fields to filter by when deleting */
    filterFields: string[];

    /* Filter applied to every deletes */
    forcedFilter: any;

    /* Fields you can return after deleting */
    returningFields: string[];
  };
};

export type ExistsFilterConfig = {
  existType: EXISTS_KEY;
  /**
   * Target table filter. target table is the last table from tables
   */
  targetTableFilter: Filter;
} & (
  | {
      isJoined: true;
      /**
       * list of join tables in their order
       * If table path starts with "**" then get shortest join to first table
       * e.g.: "**.users" means finding the shortest join from root table to users table
       */
      path: RawJoinPath;
      parsedPath: ParsedJoinPath[];
    }
  | {
      isJoined: false;
      targetTable: string;
    }
);

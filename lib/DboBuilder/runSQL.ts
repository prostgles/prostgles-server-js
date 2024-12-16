import pgPromise, {
  ParameterizedQuery as PQ,
  ParameterizedQuery,
} from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";
import {
  AnyObject,
  SQLOptions,
  SQLResult,
  SQLResultInfo,
} from "prostgles-types";
import { DB, Prostgles } from "../Prostgles";
import { DboBuilder, LocalParams, pgp, postgresToTsType } from "./DboBuilder";

export async function runSQL(
  this: DboBuilder,
  queryWithoutRLS: string,
  args: undefined | AnyObject | any[],
  options: SQLOptions | undefined,
  localParams?: LocalParams,
) {
  const queryWithRLS = queryWithoutRLS;
  if (
    queryWithRLS
      ?.replace(/\s\s+/g, " ")
      .toLowerCase()
      .includes("create extension pg_stat_statements")
  ) {
    const { shared_preload_libraries } = await this.db.oneOrNone(
      "SHOW shared_preload_libraries",
    );
    if (!(shared_preload_libraries || "").includes("pg_stat_statements")) {
      throw (
        "This query will crash the server (pg_stat_statements must be loaded via shared_preload_libraries). Need to: \n ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements' \n" +
        " AND restart server: \n    (linux) sudo service postgresql restart\n   (mac) brew services restart postgres\n "
      );
    }
  }

  await this.cacheDBTypes();

  if (!(await canRunSQL(this.prostgles, localParams))) {
    throw "Not allowed to run SQL";
  }

  const {
    returnType,
    allowListen,
    hasParams = true,
  }: SQLOptions = options || ({} as SQLOptions);
  const { socket } = localParams || {};

  const db = localParams?.tx?.t || this.db;
  if (returnType === "stream") {
    if (localParams?.tx) throw "Cannot use stream with localParams transaction";
    if (!socket) throw "Only allowed with client socket";
    const streamInfo = await this.queryStreamer.create({
      socket,
      query: pgp.as.format(queryWithRLS, args),
      options,
    });
    return streamInfo;
  } else if (returnType === "noticeSubscription") {
    if (!socket) throw "Only allowed with client socket";
    return await this.prostgles.dbEventsManager?.addNotice(socket);
  } else if (returnType === "statement") {
    try {
      return pgp.as.format(queryWithoutRLS, args);
    } catch (err) {
      throw (err as any).toString();
    }
  }

  if (!db) {
    throw "db is missing";
  }

  let finalQuery: string | ParameterizedQuery = queryWithRLS + "";
  const isNotListenOrNotify =
    returnType === "arrayMode" &&
    !["listen ", "notify "].find((c) =>
      queryWithoutRLS.toLowerCase().trim().startsWith(c),
    );
  if (isNotListenOrNotify) {
    finalQuery = new PQ({
      rowMode: "array",
      text: hasParams ? pgp.as.format(queryWithRLS, args) : queryWithRLS,
    });
  }

  const params = hasParams ? args : undefined;
  let queryResult: pgPromise.IResultExt<AnyObject> | undefined;

  if (returnType === "default-with-rollback") {
    const ROLLBACK = "Rollback";
    await db
      .tx(async (t) => {
        queryResult = await t.result<AnyObject>(finalQuery, params);
        /** Rollback */
        return Promise.reject(new Error(ROLLBACK));
      })
      .catch((e) => {
        if (!(e instanceof Error && e.message === ROLLBACK)) throw e;
      });
  } else {
    queryResult = await db.result<AnyObject>(finalQuery, params);
  }
  if (!queryResult) throw "No query result";
  const { fields, rows } = queryResult;

  const listenHandlers = await onSQLResult.bind(this)(
    queryWithoutRLS,
    queryResult,
    allowListen,
    localParams,
  );
  if (listenHandlers) {
    return listenHandlers;
  }

  if (returnType === "rows") {
    return rows;
  } else if (returnType === "row") {
    return rows[0];
  } else if (returnType === "value") {
    return Object.values(rows?.[0] ?? {})?.[0];
  } else if (returnType === "values") {
    return rows.map((r) => Object.values(r ?? {})[0]);
  } else {
    const qres: SQLResult<typeof returnType> = {
      duration: 0,
      ...queryResult,
      fields: getDetailedFieldInfo.bind(this)(fields),
    };
    return qres;
  }
}

const onSQLResult = async function (
  this: DboBuilder,
  queryWithoutRLS: string,
  { command }: Omit<SQLResultInfo, "duration">,
  allowListen: boolean | undefined,
  localParams?: LocalParams,
) {
  this.prostgles.schemaWatch?.onSchemaChangeFallback?.({
    command,
    query: queryWithoutRLS,
  });

  if (command === "LISTEN") {
    const { socket } = localParams || {};
    if (!allowListen)
      throw new Error(
        `Your query contains a LISTEN command. Set { allowListen: true } to get subscription hooks. Or ignore this message`,
      );
    if (!socket) throw "Only allowed with client socket";
    return await this.prostgles.dbEventsManager?.addNotify(
      queryWithoutRLS,
      socket,
    );
  }
};

export async function cacheDBTypes(this: DboBuilder, force = false) {
  if (force) {
    this.DATA_TYPES = undefined;
    this.USER_TABLES = undefined;
    this.USER_TABLE_COLUMNS = undefined;
  }
  this.DATA_TYPES ??=
    (await this.db.any("SELECT oid, typname FROM pg_type")) ?? [];
  this.USER_TABLES ??=
    (await this.db.any(`
    SELECT 
      relid, 
      relname, 
      schemaname, 
      array_to_json(array_agg(c.column_name) FILTER (WHERE c.column_name IS NOT NULL)) as pkey_columns
    FROM pg_catalog.pg_statio_user_tables t
    LEFT JOIN (
      SELECT a.attname as column_name, i.indrelid as table_oid
      FROM   pg_index i
      JOIN   pg_attribute a ON a.attrelid = i.indrelid
        AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary
    ) c
    ON t.relid = c.table_oid
    GROUP BY relid, relname, schemaname
  `)) ?? [];
  this.USER_TABLE_COLUMNS ??= await this.db.any(`
    SELECT t.relid, t.schemaname,t.relname, c.column_name, c.udt_name, c.ordinal_position
    FROM information_schema.columns c
    INNER JOIN pg_catalog.pg_statio_user_tables t
    ON  c.table_schema = t.schemaname AND c.table_name = t.relname 
  `);
}

export function getDetailedFieldInfo(this: DboBuilder, fields: pg.IColumn[]) {
  return (
    fields?.map((f) => {
      const dataType =
          this.DATA_TYPES!.find((dt) => +dt.oid === +f.dataTypeID)?.typname ??
          "text",
        table = this.USER_TABLES!.find((t) => +t.relid === +f.tableID),
        column = this.USER_TABLE_COLUMNS!.find(
          (c) => +c.relid === +f.tableID && c.ordinal_position === f.columnID,
        ),
        tsDataType = postgresToTsType(dataType);

      return {
        ...f,
        tsDataType,
        dataType,
        udt_name: dataType,
        tableName: table?.relname,
        tableSchema: table?.schemaname,
        columnName: column?.column_name,
      };
    }) ?? []
  );
}

export const canRunSQL = async (
  prostgles: Prostgles,
  localParams?: LocalParams,
): Promise<boolean> => {
  if (!localParams?.socket || !localParams?.httpReq) return true;

  const { socket } = localParams;
  const publishParams = await prostgles.publishParser!.getPublishParams({
    socket,
  });
  //@ts-ignore
  const res = await prostgles.opts.publishRawSQL?.(publishParams);
  return Boolean((res && typeof res === "boolean") || res === "*");
};

export const canCreateTables = async (db: DB): Promise<boolean> => {
  return db
    .any(`SELECT has_database_privilege(current_database(), 'create') as yes`)
    .then((rows) => rows?.[0].yes === true);
};

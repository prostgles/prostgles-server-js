import type pgPromise from "pg-promise";
import type { ParameterizedQuery } from "pg-promise";
import { ParameterizedQuery as PQ } from "pg-promise";
import type { AnyObject, SQLOptions, SQLResult, SQLResultInfo } from "prostgles-types";
import type { AuthClientRequest } from "../../Auth/AuthTypes";
import type { DB, Prostgles } from "../../Prostgles";
import type { DboBuilder, LocalParams } from "../DboBuilder";
import { pgp } from "../DboBuilder";
import { getDbTypes, getDetailedFieldInfo } from "./runSqlUtils";
export async function runSQL(
  this: DboBuilder,
  queryWithoutRLS: string,
  args: unknown,
  options: SQLOptions | undefined,
  localParams: LocalParams | undefined,
) {
  const queryWithRLS = queryWithoutRLS;
  if (
    queryWithRLS
      .replace(/\s\s+/g, " ")
      .toLowerCase()
      .includes("create extension pg_stat_statements")
  ) {
    const row = await this.db.oneOrNone<{
      shared_preload_libraries: string | null;
    }>("SHOW shared_preload_libraries");
    if (!row?.shared_preload_libraries?.includes("pg_stat_statements")) {
      throw (
        "This query will crash the server (pg_stat_statements must be loaded via shared_preload_libraries). Need to: \n ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements' \n" +
        " AND restart server: \n    (linux) sudo service postgresql restart\n   (mac) brew services restart postgres\n "
      );
    }
  }

  if (!(await canRunSQL(this.prostgles, localParams?.clientReq))) {
    throw "Not allowed to run SQL";
  }

  const { returnType, allowListen, hasParams = true }: SQLOptions = options || ({} as SQLOptions);
  const { socket } = localParams?.clientReq ?? {};

  const db = localParams?.tx?.t || this.db;
  if (returnType === "stream") {
    if (localParams?.tx) throw "Cannot use stream with localParams transaction";
    if (!socket) throw "stream allowed only with client socket";
    const streamInfo = this.queryStreamer.create({
      socket,
      query: pgp.as.format(queryWithRLS, args),
      options,
    });
    return streamInfo;
  } else if (returnType === "noticeSubscription") {
    if (!socket) throw "noticeSubscription allowed only with client socket";
    return this.prostgles.dbEventsManager?.addNotice(socket);
  } else if (returnType === "statement") {
    try {
      return pgp.as.format(queryWithoutRLS, args);
    } catch (err: any) {
      throw err.toString();
    }
  }

  let finalQuery: string | ParameterizedQuery = queryWithRLS + "";
  const isNotListenOrNotify =
    returnType === "arrayMode" &&
    !["listen ", "notify "].find((c) => queryWithoutRLS.toLowerCase().trim().startsWith(c));
  if (isNotListenOrNotify) {
    finalQuery = new PQ({
      rowMode: "array",
      text: hasParams ? pgp.as.format(queryWithRLS, args) : queryWithRLS,
    });
  }

  const params = hasParams ? args : undefined;
  let queryResult: pgPromise.IResultExt<AnyObject> | undefined;

  if (returnType === "default-with-rollback") {
    const ROLLBACK_SENTINEL = Symbol("rollback");
    await db
      .tx(async (t) => {
        queryResult = await t.result<AnyObject>(finalQuery, params);
        throw ROLLBACK_SENTINEL;
      })
      .catch((err) => {
        if (err !== ROLLBACK_SENTINEL) {
          throw err;
        }
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
    localParams?.clientReq,
  );
  if (listenHandlers) {
    return listenHandlers;
  }

  if (returnType === "rows") {
    return rows;
  } else if (returnType === "row") {
    return rows[0];
  } else if (returnType === "value") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Object.values(rows[0] ?? {})[0];
  } else if (returnType === "values") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return rows.map((r) => Object.values(r)[0]);
  } else {
    const typesCache = await this.cacheDBTypes();
    const qres: SQLResult<typeof returnType> = {
      duration: 0,
      ...queryResult,
      fields: getDetailedFieldInfo(typesCache, fields),
    };
    return qres;
  }
}

const onSQLResult = async function (
  this: DboBuilder,
  queryWithoutRLS: string,
  { command }: Omit<SQLResultInfo, "duration">,
  allowListen: boolean | undefined,
  clientReq: AuthClientRequest | undefined,
) {
  this.prostgles.schemaWatch?.onSchemaChangeFallback?.({
    command,
    query: queryWithoutRLS,
  });

  if (command === "LISTEN") {
    const { socket } = clientReq || {};
    if (!allowListen)
      throw new Error(
        `Your query contains a LISTEN command. Set { allowListen: true } to get subscription hooks. Or ignore this message`,
      );
    if (!socket) throw "LISTEN allowed only with client socket";
    return await this.prostgles.dbEventsManager?.addNotify(queryWithoutRLS, socket);
  }
};

export async function cacheDBTypes(this: DboBuilder, force = false) {
  if (force || !this.dbTypesCache) {
    this.dbTypesCache = await getDbTypes(this.db);
  }
  return this.dbTypesCache;
}

export const canRunSQL = async (
  prostgles: Prostgles,
  clientReq: AuthClientRequest | undefined,
): Promise<boolean> => {
  if (!clientReq) return true;
  const publishParams = await prostgles.publishParser?.getPublishParams(clientReq, undefined);
  //@ts-ignore union type that is too complex to represent.
  const publishResult = publishParams && (await prostgles.opts.publishRawSQL?.(publishParams));
  return Boolean((publishResult && typeof publishResult === "boolean") || publishResult === "*");
};

export const canCreateTables = async (db: DB): Promise<boolean> => {
  return db
    .any(`SELECT has_database_privilege(current_database(), 'create') as yes`)
    .then((rows: { yes: boolean }[]) => rows[0]?.yes === true);
};

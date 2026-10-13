import {
  getAllowedTableMethods,
  getKeys,
  type AnyObject,
  type ClientSchema,
  type ServerFunctionHandler,
  type SQLHandler,
  type SQLOptions,
  type TableHandler,
} from "prostgles-types";
import type { AuthClientRequest } from "../Auth/AuthTypes";
import { createServerSideRequest } from "../Auth/utils/serverSideRequest";
import type { DBHandlerServerRestricted } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DbTxTableHandlers } from "../DboBuilder/DboBuilderTypes";
import type { Prostgles } from "../Prostgles";
import type { PermissionScope } from "../PublishParser/publishTypesAndUtils";
import { runClientMethod, runClientRequest, runClientSqlRequest } from "../runClientRequest";
import { getClientSchema } from "./getClientSchema";

export type ClientHandlers<S = void> = {
  clientSql: SQLHandler;
  clientDb: DBHandlerServerRestricted<S>;
  /**
   * Bind permission-checked table handlers to an active transaction from this instance.
   * The caller owns the transaction; caught request errors still roll it back.
   */
  getClientDbForTransaction: (
    transactionDb: DBHandlerServerRestricted<S>,
  ) => DBHandlerServerRestricted<S>;
  /**
   * Runs permission-checked table operations in a transaction. Requires transactions: true.
   * Caught table request errors also roll back the transaction.
   */
  withClientDbTx: <R>(
    callback: (clientDb: DBHandlerServerRestricted<S>) => R | Promise<R>,
  ) => Promise<R>;
  clientMethods: ServerFunctionHandler;
  clientSchema: ClientSchema;
};

export type ClientDBHandlerRequest =
  | AuthClientRequest
  | {
      /** Trusted server-only identity, resolved through auth.findUser on every operation. */
      userId: string;
      socket?: never;
      httpReq?: never;
      res?: never;
    };

export type GetClientDBHandlers<ClientSchema = void> = <NarrowedClientSchema = ClientSchema>(
  clientReq: ClientDBHandlerRequest,
  scope: PermissionScope | undefined,
) => Promise<ClientHandlers<NarrowedClientSchema>>;

export const getClientDBHandlers = async <ClientSchema = void>(
  prostgles: Prostgles,
  clientReq: ClientDBHandlerRequest,
  scope: PermissionScope | undefined,
) => {
  if ("userId" in clientReq) {
    if ("socket" in clientReq || "httpReq" in clientReq || "res" in clientReq) {
      throw new Error("userId cannot be combined with a client request");
    }
    return getClientHandlers<ClientSchema>(
      prostgles,
      createServerSideRequest(prostgles, clientReq.userId),
      scope,
    );
  }
  return getClientHandlers<ClientSchema>(prostgles, clientReq, scope);
};

export const getClientHandlers = async <S = void>(
  prostgles: Prostgles,
  clientReq: AuthClientRequest,
  scope: PermissionScope | undefined,
): Promise<ClientHandlers<S>> => {
  prostgles.checkNotDestroyed();
  const clientSchema =
    (scope ? undefined : clientReq.socket?.prostgles?.get(prostgles.appId)) ??
    (await getClientSchema.bind(prostgles)(clientReq, scope));

  const sqlHandler: SQLHandler | undefined = ((
    query: string,
    params?: unknown,
    options?: SQLOptions,
  ) => runClientSqlRequest.bind(prostgles)({ query, params, options }, clientReq)) as SQLHandler;

  const getTableHandlers = (
    transactionHandlers?: DbTxTableHandlers,
    onRequestError?: (error: unknown) => void,
  ) =>
    Object.fromEntries(
      clientSchema.tableSchema.map((table) => {
        const allowedMethods = getAllowedTableMethods(table);
        const methods = tableMethods.filter((command) => allowedMethods.includes(command));
        const handlers = Object.fromEntries(
          methods.map((command) => {
            const method = async (param1: unknown, param2: unknown, param3: unknown) => {
              if (transactionHandlers) {
                prostgles.dboBuilder.getTransactionForHandlers(transactionHandlers);
              }
              return runClientRequest
                .bind(prostgles)(
                  { command, tableName: table.name, param1, param2, param3 },
                  clientReq,
                  scope,
                  transactionHandlers,
                )
                .catch((error: unknown) => {
                  onRequestError?.(error);
                  throw error;
                });
            };
            return [command, method];
          }),
        );
        return [table.name, handlers];
      }),
    );

  const clientSql = ((query: string, params?: AnyObject, options?: SQLOptions) => {
    if (scope && !scope.allowSql) {
      throw new Error("SQL is disallowed by PermissionScope");
    }

    return sqlHandler(query, params, options);
  }) as SQLHandler;

  const clientDb = getTableHandlers() as unknown as DBHandlerServerRestricted<S>;

  const getClientDbForTransaction = (transactionDb: object) => {
    prostgles.checkNotDestroyed();
    const transaction = prostgles.dboBuilder.getTransactionForHandlers(transactionDb);
    const handlers = getTableHandlers(transaction.dbTX, (error) => {
      prostgles.dboBuilder.failTransaction(transaction.t, error);
    }) as unknown as DBHandlerServerRestricted<S>;
    prostgles.dboBuilder.registerTransactionHandlers(handlers, transaction.dbTX);
    return handlers;
  };

  const withClientDbTx: ClientHandlers<S>["withClientDbTx"] = async (callback) => {
    prostgles.checkNotDestroyed();
    if (!prostgles.opts.transactions) {
      throw new Error("Transactions are not enabled");
    }
    return prostgles.dboBuilder.getTX((transactionHandlers) =>
      callback(getClientDbForTransaction(transactionHandlers)),
    );
  };

  const clientMethods: ServerFunctionHandler = Object.fromEntries(
    clientSchema.methods.map(({ name, ...metadata }) => {
      const methodHandler = (input?: unknown) => {
        if (scope && !scope.methods?.[name]) {
          throw new Error(`Method ${name} is not allowed by PermissionScope`);
        }
        return runClientMethod.bind(prostgles)({ name, input }, clientReq);
      };
      return [name, { name, ...metadata, run: methodHandler }];
    }),
  );

  return {
    clientDb,
    clientSql,
    clientMethods,
    clientSchema,
    withClientDbTx,
    getClientDbForTransaction,
  };
};

const tableMethods = getKeys({
  count: 1,
  find: 1,
  findOne: 1,
  getColumns: 1,
  getInfo: 1,
  size: 1,
  subscribe: 1,
  subscribeOne: 1,
  delete: 1,
  insert: 1,
  update: 1,
  upsert: 1,
  updateBatch: 1,
  insertMany: 1,
} satisfies Record<keyof TableHandler, 1>);

import {
  getKeys,
  type AnyObject,
  type SQLHandler,
  type SQLOptions,
  type TableHandler,
  type ViewHandler,
} from "prostgles-types";
import type { AuthClientRequest } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { Prostgles } from "../Prostgles";
import { runClientMethod, runClientRequest, runClientSqlRequest } from "../runClientRequest";
import { getClientSchema } from "./getClientSchema";
import type { PermissionScope } from "../PublishParser/publishTypesAndUtils";
import type { ServerFunctionDefinition } from "../PublishParser/defineServerFunction";

export type ClientHandlers<S = void> = {
  clientSql: SQLHandler | undefined;
  clientDb: DBOFullyTyped<S, false>;
  clientMethods: Record<string, ServerFunctionDefinition>;
};
export const getClientHandlers = async <S = void>(
  prostgles: Prostgles,
  clientReq: AuthClientRequest,
  scope: PermissionScope | undefined,
): Promise<ClientHandlers> => {
  const clientSchema =
    clientReq.socket?.prostgles ?? (await getClientSchema.bind(prostgles)(clientReq, scope));
  const sql: SQLHandler | undefined = ((query: string, params?: unknown, options?: SQLOptions) =>
    runClientSqlRequest.bind(prostgles)({ query, params, options }, clientReq)) as SQLHandler;
  const tableHandlers = Object.fromEntries(
    prostgles.dboBuilder.tablesOrViews!.map((table) => {
      const methods = table.is_view ? viewMethods : [...viewMethods, ...tableMethods];
      const handlers = Object.fromEntries(
        methods.map((command) => {
          const method = (param1: unknown, param2: unknown, param3: unknown) =>
            runClientRequest.bind(prostgles)(
              { command, tableName: table.name, param1, param2, param3 },
              clientReq,
              scope,
            );
          return [command, method];
        }),
      );
      return [table.name, handlers];
    }),
  );

  const txNotAllowed: {} = {
    tx: () => {
      throw new Error("Transactions are not allowed in client handlers");
    },
  };
  const sqlPermission = scope?.sql;
  const sqlHandlerRolledBack = ((query: string, params?: AnyObject, options?: SQLOptions) =>
    sql(query, params, { ...options, returnType: "default-with-rollback" })) as SQLHandler;
  const clientSql: SQLHandler | undefined =
    !sqlPermission ?
      () => {
        throw new Error("SQL is dissallowed by PermissionScope");
      }
    : sqlPermission === "commited" ? sql
    : sqlHandlerRolledBack;

  const clientDb = {
    ...tableHandlers,
    ...txNotAllowed,
  } as DBOFullyTyped<S, false>;

  //@ts-ignore
  const clientMethods: Record<string, ServerFunctionDefinition> = Object.fromEntries(
    clientSchema.methods.map(({ name, input, description, output }) => {
      const methodHandler = (input?: unknown) => {
        if (scope && !scope.methods?.[name]) {
          throw new Error(`Method ${name} is not allowed by PermissionScope`);
        }
        return runClientMethod.bind(prostgles)({ name, input }, clientReq);
      };
      return [name, { name, input, description, output, run: methodHandler }];
    }),
  );

  return { clientDb, clientSql, clientMethods };
};

const viewMethods = getKeys({
  count: 1,
  find: 1,
  findOne: 1,
  getColumns: 1,
  getInfo: 1,
  size: 1,
  subscribe: 1,
  subscribeOne: 1,
} satisfies Record<keyof ViewHandler, 1>);

const tableMethods = getKeys({
  delete: 1,
  insert: 1,
  update: 1,
  upsert: 1,
  updateBatch: 1,
} satisfies Record<Exclude<keyof TableHandler, keyof ViewHandler>, 1>);

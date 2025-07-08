import {
  getKeys,
  type Method,
  type SQLHandler,
  type SQLOptions,
  type TableHandler,
  type ViewHandler,
} from "prostgles-types";
import type { AuthClientRequest } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder";
import type { Prostgles } from "../Prostgles";
import { runClientMethod, runClientRequest, runClientSqlRequest } from "../runClientRequest";
import { getClientSchema } from "./getClientSchema";

export const getClientHandlers = async <S = void>(
  prostgles: Prostgles,
  clientReq: AuthClientRequest
): Promise<{
  clientDb: DBOFullyTyped<S, false>;
  clientMethods: Record<string, Method>;
}> => {
  const clientSchema =
    clientReq.socket?.prostgles ?? (await getClientSchema.bind(prostgles)(clientReq));
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
              clientReq
            );
          return [command, method];
        })
      );
      return [table.name, handlers];
    })
  );

  const txNotAllowed: {} = {
    tx: () => {
      throw new Error("Transactions are not allowed in client handlers");
    },
  };
  const clientDb = {
    ...tableHandlers,
    ...txNotAllowed,
    sql,
  } as DBOFullyTyped<S, false>;

  const clientMethods: Record<string, Method> = Object.fromEntries(
    clientSchema.methods.map((method) => {
      const methodName = typeof method === "string" ? method : method.name;
      return [
        methodName,
        (...params: any[]) =>
          runClientMethod.bind(prostgles)({ method: methodName, params }, clientReq),
      ];
    })
  );

  return { clientDb, clientMethods };
};
export type ClientHandlers<S = void> = Awaited<ReturnType<typeof getClientHandlers<S>>>;

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

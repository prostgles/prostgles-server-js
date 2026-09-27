import type { DB } from "../../initProstgles";
import { QUERY_ID_PREFIX, type LocalParams } from "../DboBuilder";
import type { ViewHandler } from "./ViewHandler";
import type pgPromise from "pg-promise";
import { getServerSideUserId } from "../../Auth/utils/serverSideRequest";
import type { Prostgles } from "../../Prostgles";

type Params = { abortSignal: AbortSignal | undefined; abortSignalId: string | undefined };

export const getDbHandlerWithAbort = (
  viewHandler: ViewHandler,
  localParams: LocalParams | undefined,
  params: Params,
): Pick<DB | pgPromise.ITask<{}>, "any" | "one" | "many" | "manyOrNone" | "none" | "oneOrNone"> => {
  if (params.abortSignal && params.abortSignalId) {
    throw new Error("Cannot provide both abortSignal and abortSignalId");
  }

  if (params.abortSignal?.aborted) {
    throw new Error("Query aborted before execution");
  }

  if (params.abortSignal !== undefined && !(params.abortSignal instanceof AbortSignal)) {
    throw new Error("abortSignal must be an instance of AbortSignal");
  }

  const { clientReq } = localParams ?? {};
  const abortSignal = params.abortSignal ?? AbortSignal.timeout(clientReq ? 7_000 : 120_000);
  const { prostgles } = viewHandler.dboBuilder;
  const handler = viewHandler.getTransaction(localParams)?.t ?? viewHandler.db;
  const { adminClient } = prostgles;
  if (!adminClient) {
    throw new Error(
      "adminClient not available. Ensure prostgles.adminClient is initialized before using abortable queries.",
    );
  }

  const signalKeys = getAbortSignalKeys(prostgles, params, localParams);
  const { abortSignalKey } = signalKeys;
  if (viewHandler.activeQueries.has(abortSignalKey)) {
    throw new Error(
      `A query with abortSignalId ${params.abortSignalId} is already active. Ensure that each query has a unique abortSignalId.`,
    );
  }

  const withAbortQuery = <Args extends unknown[], R extends Promise<any>>(
    func: (query: string, ...args: Args) => R,
  ) => {
    return (query: string, ...args: Args) => {
      const queryIdPrefix = query.split("\n", 1)[0];

      const queryHasIdPrefix = queryIdPrefix?.startsWith(QUERY_ID_PREFIX);
      if (!queryIdPrefix || !queryHasIdPrefix) {
        throw new Error(
          "Query does not have a prostgles query id prefix. Ensure that the query is generated using prostgles methods that include the query id.",
        );
      }

      const abort = () => {
        void viewHandler._log({
          data: { query, abortSignalId: signalKeys.abortSignalId },
          command: "abort",
          localParams,
          duration:
            Date.now() - (viewHandler.activeQueries.get(abortSignalKey)?.start ?? Date.now()),
          error: new Error("Query aborted"),
        });
        /** Only terminate if there is exactly one matching query with a query id prefix */

        viewHandler.abortRequests.delete(abortSignalKey);
        void adminClient
          .query(
            `
            SELECT pg_cancel_backend(pid), * 
            FROM pg_stat_activity 
            WHERE query LIKE $1 AND pid <> pg_backend_pid()
            `,
            [`${queryIdPrefix}%`],
          )
          .catch((_err) => {
            // ignore error
          });
      };

      if (viewHandler.abortRequests.has(abortSignalKey)) {
        viewHandler.abortRequests.delete(abortSignalKey);
        throw new Error("Abort already requested");
      }

      const sid = prostgles.authHandler.getSIDNoError(clientReq);
      viewHandler.activeQueries.set(abortSignalKey, {
        query,
        start: Date.now(),
        sid,
        abort,
        socketId: localParams?.clientReq?.socket?.id,
      });
      abortSignal.addEventListener("abort", abort);
      return func(query, ...args).finally(() => {
        abortSignal.removeEventListener("abort", abort);
        viewHandler.activeQueries.delete(abortSignalKey);
        viewHandler.abortRequests.delete(abortSignalKey);
      });
    };
  };

  return {
    manyOrNone: withAbortQuery(handler.manyOrNone.bind(handler)),
    one: withAbortQuery(handler.one.bind(handler)),
    oneOrNone: withAbortQuery(handler.oneOrNone.bind(handler)),
    any: withAbortQuery(handler.any.bind(handler)),
    none: withAbortQuery(handler.none.bind(handler)),
    many: withAbortQuery(handler.many.bind(handler)),
  };
};

export const getAbortSignalKeys = (
  prostgles: Prostgles,
  params: Pick<Params, "abortSignalId">,
  localParams: LocalParams | undefined,
) => {
  const clientIdentifier = (() => {
    const { clientReq } = localParams ?? {};
    if (!clientReq) {
      if (params.abortSignalId !== undefined) {
        throw new Error(
          "abortSignalId must not be provided for local requests. Use abortSignal instead.",
        );
      }
      return ["<local-request>", "local"];
    }
    const sid = prostgles.authHandler.getSIDNoError(clientReq);
    if (sid) return [sid, "sid"];
    const userId = getServerSideUserId(prostgles, clientReq);
    if (userId) return [userId, "userId"];
    throw new Error(
      "Cannot get SID or userId from client request. Ensure that the client is authenticated before using abortable queries.",
    );
  })();
  const abortSignalId = params.abortSignalId ?? crypto.randomUUID();

  const MAX_LENGTH = 36;
  if (abortSignalId.length > MAX_LENGTH) {
    throw new Error(`abortSignalId length must not exceed ${MAX_LENGTH} characters`);
  }
  const abortSignalKey = JSON.stringify([...clientIdentifier, abortSignalId]);
  return {
    abortSignalId,
    abortSignalKey,
  };
};

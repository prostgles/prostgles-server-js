import type { DB } from "../../initProstgles";
import { QUERY_ID_PREFIX, type LocalParams } from "../DboBuilder";
import type { ViewHandler } from "./ViewHandler";
import { getServerSideUserId } from "../../Auth/utils/serverSideRequest";
import type { Prostgles } from "../../Prostgles";
import { fromEntries, isObject } from "prostgles-types";

type Params = { abortSignal: AbortSignal | undefined; abortSignalId: string | undefined };
const METHODS = ["any", "one", "many", "manyOrNone", "none", "oneOrNone"] as const;
type QueryHandler = Pick<DB, (typeof METHODS)[number]>;
const QUERY_CANCELLED_CODE = "57014";

export const getDbHandlerWithAbort = (
  viewHandler: ViewHandler,
  localParams: LocalParams | undefined,
  params: Params,
): QueryHandler => {
  if (params.abortSignal && params.abortSignalId) {
    throw new Error("Cannot provide both abortSignal and abortSignalId");
  }

  if (params.abortSignal !== undefined && !(params.abortSignal instanceof AbortSignal)) {
    throw new Error("abortSignal must be an instance of AbortSignal");
  }

  const { clientReq } = localParams ?? {};
  const defaultTimeoutMs = clientReq ? 7_000 : 120_000;
  const abortSignal = params.abortSignal ?? AbortSignal.timeout(defaultTimeoutMs);
  const { prostgles } = viewHandler.dboBuilder;
  const transaction = viewHandler.getTransaction(localParams)?.t;
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

  const withAbortQuery = (method: keyof QueryHandler) => {
    return async (query: string, ...args: unknown[]) => {
      if (abortSignal.aborted) throw new Error("Query aborted before execution");
      const queryIdPrefix = query.split("\n", 1)[0];

      if (!queryIdPrefix?.startsWith(QUERY_ID_PREFIX)) {
        throw new Error(
          "Query does not have a prostgles query id prefix. Ensure that the query is generated using prostgles methods that include the query id.",
        );
      }

      const start = Date.now();
      const logAbort = (error: unknown) =>
        viewHandler._log({
          data: { query, abortSignalId: signalKeys.abortSignalId },
          command: "abort",
          localParams,
          duration: Date.now() - start,
          error,
        });
      let abortError: Error | undefined;
      let rejectCheckout: ((error: Error) => void) | undefined;
      const abort = () => {
        if (abortError) return;
        const abortReason: unknown = abortSignal.reason;
        const reasonMessage =
          abortReason instanceof Error ? abortReason.message
          : typeof abortReason === "string" ? abortReason
          : "";
        const message =
          !abortSignal.aborted ? "Query cancelled by client abort request"
          : params.abortSignal ?
            `Query cancelled by abortSignal${reasonMessage ? `: ${reasonMessage}` : ""}`
          : `Query cancelled because the default ${clientReq ? "client" : "server"} query timeout of ${defaultTimeoutMs}ms was exceeded`;
        abortError = Object.assign(new Error(message), { code: QUERY_CANCELLED_CODE });
        void logAbort(abortError);
        if (rejectCheckout) {
          rejectCheckout(abortError);
          return;
        }
        void adminClient
          .query(
            `SELECT pg_cancel_backend((
               SELECT pid FROM pg_stat_activity
               WHERE datname = current_database()
               AND backend_type = 'client backend'
               AND state = 'active'
               AND starts_with(query, $1)
             ))`,
            [queryIdPrefix + "\n"],
          )
          .catch((error: unknown) =>
            logAbort(new Error("Failed to cancel query", { cause: error })),
          );
      };

      const sid = prostgles.authHandler.getSIDNoError(clientReq);
      viewHandler.activeQueries.set(abortSignalKey, {
        query,
        start,
        sid,
        abort,
        socketId: localParams?.clientReq?.socket?.id,
      });
      abortSignal.addEventListener("abort", abort);
      try {
        if (transaction) {
          return await transaction[method](query, ...args);
        }
        const cancelledDuringCheckout = new Promise<never>((_, reject) => {
          rejectCheckout = reject;
        });
        const result = viewHandler.db.task((connection) => {
          rejectCheckout = undefined;
          /* A cancelled checkout still drains through the pool. Skip its SQL. */
          if (abortError) {
            return Promise.reject(abortError);
          }
          return connection[method](query, ...args);
        });
        return await Promise.race([result, cancelledDuringCheckout]);
      } catch (error) {
        if (abortError && isObject(error) && error.code === QUERY_CANCELLED_CODE) {
          error.message = abortError.message;
        }
        throw error;
      } finally {
        abortSignal.removeEventListener("abort", abort);
        viewHandler.activeQueries.delete(abortSignalKey);
      }
    };
  };

  return fromEntries(METHODS.map((method) => [method, withAbortQuery(method)]));
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

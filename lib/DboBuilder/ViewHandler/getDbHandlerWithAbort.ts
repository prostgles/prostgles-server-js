import type { DB } from "../../initProstgles";
import { QUERY_ID_PREFIX, type LocalParams } from "../DboBuilder";
import type { ViewHandler } from "./ViewHandler";
import type * as pgPromise from "pg-promise";

export function getDbHandlerWithAbort(
  this: ViewHandler,
  localParams: LocalParams | undefined,
  params: { abortSignal: AbortSignal | undefined; abortSignalId: string | undefined },
): Pick<DB | pgPromise.ITask<{}>, "any" | "one" | "many" | "manyOrNone" | "none" | "oneOrNone"> {
  if (params.abortSignal && params.abortSignalId) {
    throw new Error("Cannot provide both abortSignal and abortSignalId");
  }

  if (params.abortSignal?.aborted) {
    throw new Error("Query aborted before execution");
  }

  const abortSignal =
    params.abortSignal ?? AbortSignal.timeout(localParams?.clientReq ? 7_000 : 120_000);
  const abortSignalId = params.abortSignalId ?? crypto.randomUUID();

  if (this.activeQueries.has(abortSignalId)) {
    throw new Error(
      `A query with abortSignalId ${params.abortSignalId} is already active. Ensure that each query has a unique abortSignalId.`,
    );
  }
  const handler = this.getTransaction(localParams)?.t ?? this.db;
  const { adminClient } = this.dboBuilder.prostgles;
  if (!adminClient) {
    throw new Error(
      "adminClient not available. Ensure prostgles.adminClient is initialized before using abortable queries.",
    );
  }
  const sid = this.dboBuilder.prostgles.authHandler.getSIDNoError(localParams?.clientReq);
  if (!sid && localParams?.clientReq) {
    throw new Error(
      "Cannot get SID from client request. Ensure that the client is authenticated before using abortable queries.",
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
        /** Only terminate if there is exactly one matching query with a query id prefix */

        void adminClient
          .query(
            `
            SELECT pg_terminate_backend(pid), * 
            FROM pg_stat_activity 
            WHERE query LIKE $1 AND pid <> pg_backend_pid()
            `,
            [`${queryIdPrefix}%`],
          )
          .then((res) => {
            // if (params.abortSignalId) {
            //   console.log(JSON.stringify(res.rows));
            //   process.exit(1);
            // }
          })
          .catch((err) => {
            // ignore error
          });
      };
      this.activeQueries.set(abortSignalId, {
        query,
        start: Date.now(),
        sid,
        abort,
      });
      abortSignal.addEventListener("abort", abort);
      return func(query, ...args).finally(() => {
        abortSignal.removeEventListener("abort", abort);
        this.activeQueries.delete(abortSignalId);
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
}

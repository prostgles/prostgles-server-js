import { asName as _asName } from "prostgles-types";
import type { Prostgles } from "../Prostgles";
import { EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID, log } from "../PubSubManager/PubSubManagerUtils";

const makeQuery = (q: string[]) =>
  q
    .filter((v) => v.trim().length)
    .map((v) => (v.trim().endsWith(";") ? v : `${v};`))
    .join("\n");

export const getSchemaUtils = async (prostgles: Pick<Prostgles, "db" | "opts">) => {
  const { db, opts } = prostgles;
  if (!db) throw "db missing";

  let changedSchema = false;
  const failedQueries: { query: string; error: any }[] = [];
  const queryHistory: string[] = [];
  let queries: string[] = [];
  const runQueries = async (_queries = queries) => {
    let q = makeQuery(queries);
    if (!_queries.some((q) => q.trim().length)) {
      return 0;
    }
    q = `/* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */ \n\n` + q;
    queryHistory.push(q);
    await opts.onLog?.({
      type: "debug",
      command: "TableConfig.runQueries.start",
      data: { q },
      duration: -1,
    });
    const now = Date.now();
    await db.multi(q).catch((err) => {
      log({ err, q });
      failedQueries.push({ query: q, error: err });
      return Promise.reject(err);
    });
    await opts.onLog?.({
      type: "debug",
      command: "TableConfig.runQueries.end",
      duration: Date.now() - now,
      data: { q },
    });
    changedSchema = true;
    _queries = [];
    queries = [];
    return 1;
  };

  const MAX_IDENTIFIER_LENGTH = +(
    await db.one<{ max_identifier_length: number }>("SHOW max_identifier_length;")
  ).max_identifier_length;

  if (!Number.isFinite(MAX_IDENTIFIER_LENGTH))
    throw `Could not obtain a valid max_identifier_length`;
  const asName = (v: string) => {
    if (v.length > MAX_IDENTIFIER_LENGTH - 1) {
      throw `The identifier name provided (${v}) is longer than the allowed limit (max_identifier_length - 1 = ${MAX_IDENTIFIER_LENGTH - 1} characters )\n Longest allowed: ${_asName(v.slice(0, MAX_IDENTIFIER_LENGTH - 1))} `;
    }

    return _asName(v);
  };

  return {
    asName,
    runQueries,
    changedSchema,
    failedQueries,
    queryHistory,
    queries,
    db,
  };
};

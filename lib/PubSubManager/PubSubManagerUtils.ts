import * as pgPromise from "pg-promise";
import pg from "pg-promise/typescript/pg-subset";

export const NOTIF_TYPE = {
  data: "data_has_changed",
  data_trigger_change: "data_watch_triggers_have_changed",
  schema: "schema_has_changed",
} as const;

export type NotifTypeName = (typeof NOTIF_TYPE)[keyof typeof NOTIF_TYPE];
export const NOTIF_CHANNEL = {
  preffix: "prostgles_" as const,
  getFull: (appID: string | undefined) => {
    if (!appID) throw "No appID";
    return NOTIF_CHANNEL.preffix + appID;
  },
};

export const parseCondition = (condition: string): string =>
  condition && condition.trim().length ? condition : "TRUE";

export const DELIMITER = "|$prstgls$|";

export const EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID =
  "prostgles internal query that should be excluded from schema watch ";

type PGP = pgPromise.IMain<{}, pg.IClient>;
export const pgp: PGP = pgPromise({});
export const asValue = (v: any) => pgp.as.format("$1", [v]);
export const DEFAULT_SYNC_BATCH_SIZE = 50;

export const log = (...args: any[]) => {
  if (process.env.TEST_TYPE) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.log(...args);
  }
};

import * as pgPromise from "pg-promise";
import type { ProstglesInitOptions } from "./ProstglesTypes";
import type { DB, PGP } from "./initProstgles";
import type pg from "pg-promise/typescript/pg-subset";

type GetDbConnectionArgs = Pick<
  ProstglesInitOptions,
  "DEBUG_MODE" | "onQuery" | "dbConnection" | "onNotice" | "onConnectionError"
>;
export const getDbConnection = function ({
  dbConnection,
  onQuery,
  onConnectionError,
  DEBUG_MODE,
  onNotice,
}: GetDbConnectionArgs): { db: DB; pgp: PGP } {
  const onQueryOrError:
    | undefined
    | ((error: any, ctx: pgPromise.IEventContext<pg.IClient>) => void) =
    !onQuery && !DEBUG_MODE ?
      undefined
    : (error, ctx) => {
        if (onQuery) {
          onQuery(error, ctx);
        } else if (DEBUG_MODE) {
          if (error) {
            console.error(error, ctx);
          } else {
            console.log(ctx);
          }
        }
      };

  const pgp: PGP = pgPromise({
    ...(onQueryOrError && {
      query: (ctx) => onQueryOrError(undefined, ctx),
    }),
    error: (err: Error, ctx) => {
      if (ctx.cn) {
        onConnectionError?.(err, ctx);
      }
      onQueryOrError?.(err, ctx);
    },
    ...((onNotice || DEBUG_MODE) && {
      connect: function ({ client, useCount }) {
        const isFresh = !useCount;
        if (isFresh && !client.listeners("notice").length) {
          client.on("notice", function (msg) {
            if (onNotice) {
              onNotice(msg, msg?.message);
            } else {
              console.log("notice: %j", msg?.message);
            }
          });
        }
        if (isFresh && !client.listeners("error").length) {
          client.on("error", function (msg) {
            if (onNotice) {
              onNotice(msg, msg?.message);
            } else {
              console.log("error: %j", msg?.message);
            }
          });
        }
      },
    }),
  });
  // pgp.pg.defaults.max = 70;

  // /* Casts count/sum/max to bigint. Needs rework to remove casting "+count" and other issues; */
  // pgp.pg.types.setTypeParser(20, BigInt);

  /**
   * Prevent timestamp casting to ensure we don't lose the microseconds.
   * This is needed to ensure the filters work as expected for a given row
   * 
  register(1114, parseTimestamp) // timestamp without time zone
  register(1184, parseTimestampTz) // timestamp with time zone
   */
  // pgp.pg.types.setTypeParser(1114, v => v); // timestamp without time zone
  // pgp.pg.types.setTypeParser(1184, v => v); // timestamp with time zone
  // pgp.pg.types.setTypeParser(1182, v => v); // date
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMP, (v) => v); // timestamp without time zone
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.TIMESTAMPTZ, (v) => v); // timestamp with time zone
  pgp.pg.types.setTypeParser(pgp.pg.types.builtins.DATE, (v) => v); // date

  return {
    db: pgp(dbConnection),
    pgp,
  };
};

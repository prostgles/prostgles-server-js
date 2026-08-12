import * as pg from "pg";
import type { DB } from "../../initProstgles";

export const getAdminClient = async (db: DB, onDbDropped?: () => void) => {
  const adminClient = new pg.Pool({
    ...getConnectionDetails(db),
    application_name: "prostgles-admin-client",
    keepAlive: true,
  });
  if (onDbDropped) {
    adminClient.on("error", (err) => {
      if (
        err.message.includes("terminating connection due to administrator command") ||
        (err.message.includes("database") && err.message.includes("does not exist"))
      ) {
        onDbDropped();
      }
    });
  }

  /**
   * validate the connection and let the pool acquire/release its client internally
   */
  await adminClient.query("SELECT 1");
  return adminClient;
};

export const getConnectionDetails = (db: DB) => {
  const opts = db.$pool.options as pg.ClientConfig;
  return {
    ...opts,
    password: opts.password,
    keepAlive: true,
  } satisfies pg.ClientConfig;
};

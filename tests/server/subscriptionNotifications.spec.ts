import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import prostgles, { type ProstglesInitOptions } from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { Server } from "socket.io";
import type prostglesClient from "../client/node_modules/prostgles-client";
import {
  DELIMITER,
  NOTIF_TYPE,
} from "prostgles-server/dist/PubSubManager/PubSubManagerUtils";

export const testSubscriptionNotifications = async (db: DB) => {
  await test(
    "subscription notifications handle rollbacks, out-of-order commits and multiple apps",
    { timeout: 15_000 },
    async (context) => {
      const schema = "subscription_notifications_test";
      const tableName = "subscription_notifications_test.records";
      const retryPayload = `${NOTIF_TYPE.data_trigger_change}${DELIMITER}retry-test`;
      let notificationAttempts = 0;
      await db.none(
        `CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.records (id int PRIMARY KEY)`,
      );
      const createInstance = () =>
        prostgles<{
          "subscription_notifications_test.records": {
            columns: { id: number };
          };
        }>({
          dbConnection: getConnectionDetails(
            db,
          ) as unknown as ProstglesInitOptions["dbConnection"],
          schemaFilter: { [schema]: 1 },
          onReady: () => {},
          onLog: (event) => {
            if (
              event.type === "syncOrSub" &&
              event.command === "notifListener" &&
              event.dataArr.join(DELIMITER) === retryPayload &&
              ++notificationAttempts === 1
            ) {
              throw new Error("Transient notification failure");
            }
          },
        });
      const instances: Awaited<ReturnType<typeof createInstance>>[] = [];
      const appIds: string[] = [];
      const notificationConnection = await db.connect({ direct: true });
      let notifyCount = 0;
      notificationConnection.client.on("notification", () => notifyCount++);
      const deliveries: string[][] = [[], []];
      const waitForBothApps = (expectedIds: string) =>
        waitFor(
          () => deliveries.every((received) => received.includes(expectedIds)),
          `Missing subscription state ${expectedIds}`,
        );
      try {
        for (const received of deliveries) {
          const instance = await createInstance();
          instances.push(instance);
          const app = await instance._db.one<{ id: string }>(
            "SELECT split_part(current_setting('application_name'), ' ', 2) AS id",
          );
          appIds.push(app.id);
          await notificationConnection.none("LISTEN $1~", [
            `prostgles_${app.id}`,
          ]);
          await instance.db[tableName].subscribe(
            {},
            { orderBy: { id: 1 }, limit: null },
            (rows) => {
              received.push(rows.map(({ id }) => id).join(","));
            },
          );
        }
        await waitForBothApps("");
        assert.equal(
          await db.one(
            "SELECT relpersistence FROM pg_class WHERE oid = 'prostgles.data_notifications'::regclass",
            [],
            ({ relpersistence }: { relpersistence: string }) => relpersistence,
          ),
          "u",
          "The notification queue must be unlogged",
        );
        await db.tx(async (slowTransaction) => {
          await slowTransaction.none(
            `INSERT INTO ${schema}.records VALUES (1)`,
          );
          // This higher queue ID commits and is consumed before the lower one.
          await db.none(`INSERT INTO ${schema}.records VALUES (2)`);
          await waitForBothApps("2");
          assert(deliveries.every((received) => received.length === 2));
        });
        await waitForBothApps("1,2");

        const rollbackError = new Error("Roll back subscription write");
        await assert.rejects(
          db.tx(async (transaction) => {
            // A writer that could call pg_notify must not need queue table privileges.
            const writerRole = `subscription_notifications_writer_${process.pid}`;
            await transaction.none(`
              CREATE ROLE ${writerRole};
              GRANT USAGE ON SCHEMA ${schema}, prostgles TO ${writerRole};
              GRANT SELECT ON prostgles.v_triggers TO ${writerRole};
              GRANT INSERT ON ${tableName} TO ${writerRole};
              SET LOCAL ROLE ${writerRole};
            `);
            await transaction.none(`INSERT INTO ${schema}.records VALUES (3)`);
            throw rollbackError;
          }),
          rollbackError,
        );
        await delay(150);
        assert(deliveries.every((received) => received.length === 3));

        await context.test(
          "retries failed notifications and delivers the remaining batch",
          async () => {
            await db.tx((transaction) =>
              transaction.none(
                `
              INSERT INTO prostgles.data_notifications (app_id, payload) VALUES ($1, $2), ($1, $2);
              INSERT INTO ${tableName} VALUES (3);
            `,
                [appIds[0], retryPayload],
              ),
            );
            await waitForBothApps("1,2,3");
            await waitFor(
              () => notificationAttempts === 2,
              "Failed notification was not retried",
            );
          },
        );

        await context.test(
          "orphan cleanup does not abort concurrent writes",
          async () => {
            const orphanAppId = `subscription-notifications-orphan-${process.pid}`;
            let concurrentWrite: Promise<unknown> | undefined;
            try {
              await db.none(
                `
              INSERT INTO prostgles.apps (id, check_frequency_ms, application_name)
              VALUES ($1, 10000, $1);
              INSERT INTO prostgles.app_triggers (app_id, table_name, condition, condition_hash, columns_info)
              SELECT $1, table_name, condition, condition_hash, columns_info
              FROM prostgles.app_triggers WHERE app_id = $2;
            `,
                [orphanAppId, appIds[0]],
              );
              await db.tx(async (transaction) => {
                // This write deletes the orphan app; leave that deletion uncommitted.
                await transaction.none(`INSERT INTO ${tableName} VALUES (4)`);
                concurrentWrite = db
                  .none(
                    `INSERT INTO ${tableName} VALUES (5) /* subscription orphan cleanup */`,
                  )
                  .then(
                    () => undefined,
                    (error: unknown) => error,
                  );
                await waitFor(
                  () =>
                    db
                      .one<{ waiting: boolean }>(
                        `
                  SELECT EXISTS (
                    SELECT 1 FROM pg_stat_activity
                    WHERE datname = current_database()
                    AND query LIKE 'INSERT%subscription orphan cleanup%'
                    AND wait_event_type = 'Lock'
                  ) AS waiting
                `,
                      )
                      .then(({ waiting }) => waiting),
                  "Concurrent write did not wait for orphan cleanup",
                );
              });
              assert.equal(await concurrentWrite, undefined);
              await waitForBothApps("1,2,3,4,5");
              assert.equal(
                await db.one(
                  "SELECT count(*)::int AS count FROM prostgles.data_notifications WHERE app_id = $1",
                  [orphanAppId],
                  ({ count }: { count: number }) => count,
                ),
                0,
                "Deleted apps must not retain notifications",
              );
            } finally {
              await concurrentWrite;
              await db.none(
                `DELETE FROM prostgles.app_triggers WHERE app_id = $1;
               DELETE FROM prostgles.apps WHERE id = $1`,
                [orphanAppId],
              );
            }
          },
        );

        // More than one poll batch must drain completely, including after a rollback.
        await db.tx(async (transaction) => {
          for (let id = 6; id <= 1006; id++) {
            await transaction.none(
              `INSERT INTO ${schema}.records VALUES ($1)`,
              [id],
            );
          }
        });
        await waitForBothApps(
          Array.from({ length: 1006 }, (_, index) => index + 1).join(","),
        );
        await waitFor(
          () =>
            db
              .one<{ count: number }>(
                "SELECT count(*)::int AS count FROM prostgles.data_notifications WHERE app_id = ANY($1)",
                [appIds],
              )
              .then(({ count }) => count === 0),
          "Subscription notification batches did not drain",
        );
        assert.equal(
          notifyCount,
          0,
          "Subscriptions must not issue PostgreSQL NOTIFY",
        );
      } finally {
        await notificationConnection.done();
        await Promise.all(instances.map((instance) => instance.destroy()));
        await db.none(
          `
          DELETE FROM prostgles.app_triggers WHERE app_id = ANY($1);
          DELETE FROM prostgles.apps WHERE id = ANY($1);
          DROP SCHEMA ${schema} CASCADE;
        `,
          [appIds],
        );
      }
    },
  );

  await test(
    "subscription notifications recover subscriptions and syncs after reconnection",
    { timeout: 20_000 },
    async () => {
      const schema = "subscription_reconnect_test";
      const tableName = "subscription_reconnect_test.records";
      const http = createServer();
      const io = new Server(http);
      let failRefresh = false;
      let failedRefreshes = 0;
      await db.none(`
        CREATE SCHEMA ${schema};
        CREATE TABLE ${tableName} (id int PRIMARY KEY, last_updated int NOT NULL);
        INSERT INTO ${tableName} VALUES (1, 1);
      `);
      const server = new Prostgles({
        dbConnection: getConnectionDetails(
          db,
        ) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 },
        io,
        publish: "*",
        auth: {
          sidKeyName: "token",
          getUser: (sid) => {
            if (!sid) return;
            const user = { id: sid, type: "test" };
            return { user, clientUser: user };
          },
          findUser: () => undefined,
        },
        tableConfig: {
          [tableName]: {
            syncConfig: { id_fields: ["id"], synced_field: "last_updated" },
          },
        },
        onReady: () => {},
        onLog: (event) => {
          if (
            failRefresh &&
            event.type === "syncOrSub" &&
            event.command === "refreshTriggers"
          ) {
            failRefresh = false;
            failedRefreshes++;
            throw new Error("Transient reconnect refresh failure");
          }
        },
      });
      const instance = await server.init(() => {}, { type: "init" });
      const connectClient = createRequire(
        path.resolve("../client/package.json"),
      )("prostgles-client").default as typeof prostglesClient;
      let client: Awaited<ReturnType<typeof connectClient>> | undefined;
      const received = { subscription: 0, sync: 0 };
      try {
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        client = await connectClient({
          endpoint: `http://127.0.0.1:${address.port}`,
          socketOptions: {
            path: "/socket.io",
            transports: ["websocket"],
            reconnection: false,
            query: { token: "reconnect-test" },
          },
        });
        await client.db[tableName]!.subscribe!({}, {}, ([row]) => {
          received.subscription = Number(row?.last_updated);
        });
        await client.db[tableName]!.sync!({}, {}, (rows) => {
          received.sync = Number(rows[0]?.last_updated);
        });
        await waitFor(
          () => received.subscription === 1 && received.sync === 1,
          "Initial subscription and sync data missing",
        );
        const manager = await server.dboBuilder.getPubSubManager();
        const listener = manager.postgresNotifListenManager;
        assert(listener);
        await waitFor(
          () => !!listener.connection,
          "Notification listener did not connect",
        );
        const { pid } = await listener.connection!.one<{ pid: number }>(
          "SELECT pg_backend_pid() AS pid",
        );
        // Discard the committed notification, as an unlogged queue does after a crash.
        await db.tx((transaction) =>
          transaction.none(
            `
          UPDATE ${tableName} SET last_updated = 2;
          DELETE FROM prostgles.data_notifications WHERE app_id = $1;
        `,
            [server.appId],
          ),
        );
        await delay(150);
        assert.deepEqual(received, { subscription: 1, sync: 1 });
        failRefresh = true;
        await db.one("SELECT pg_terminate_backend($1)", [pid]);
        await waitFor(
          () => received.subscription === 2 && received.sync === 2,
          "Lost notifications were not recovered after reconnection",
          10_000,
        );
        assert.equal(
          failedRefreshes,
          1,
          "Recovery must retry a failed refresh",
        );
        assert.equal(
          client.socket.connected,
          true,
          "Database recovery must preserve the client socket",
        );
        await db.none(`UPDATE ${tableName} SET last_updated = 3`);
        await waitFor(
          () => received.subscription === 3 && received.sync === 3,
          "Notifications stopped after reconnection",
        );
      } finally {
        client?.socket.disconnect();
        await instance.destroy();
        await io.close();
        await db.none(
          `
          DELETE FROM prostgles.app_triggers WHERE app_id = $1;
          DELETE FROM prostgles.apps WHERE id = $1;
          DROP SCHEMA ${schema} CASCADE;
        `,
          [server.appId],
        );
      }
    },
  );
};

const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  message: string,
  timeout = 3000,
) => {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    assert(Date.now() < deadline, message);
    await delay(20);
  }
};

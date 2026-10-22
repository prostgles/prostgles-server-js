import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import prostgles, {
  type DBHandlerServerInternal,
  type ProstglesInitOptions,
} from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { DB } from "prostgles-server/dist/Prostgles";
import type { AnyObject } from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient } from "socket.io-client";
import type prostglesClient from "../client/node_modules/prostgles-client";

export const testSyncSchema = async (db: DB, dbo: DBHandlerServerInternal) => {
  await test(
    "Sync schema changes refresh existing subscriptions",
    { timeout: 30_000 },
    async () => {
      const schema = "sync_schema_test";
      const tableName = "sync_schema_test.records";
      const http = createServer();
      const io = new Server(http);
      let socket: ReturnType<typeof createClient> | undefined;
      let instance: Awaited<ReturnType<typeof prostgles>> | undefined;
      try {
        /* Initialize shared subscription infrastructure before adding another instance. */
        const subscription = await dbo.planes!.subscribe({}, {}, () => {});
        await subscription.unsubscribe();
        await db.none(`CREATE SCHEMA ${schema};
        CREATE TABLE ${tableName} (
          id integer PRIMARY KEY,
          identity text UNIQUE NOT NULL,
          value integer NOT NULL,
          synced bigint NOT NULL,
          synced_next bigint NOT NULL
        );
        INSERT INTO ${tableName} VALUES (1, 'first', 1, 1, 1);`);
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        const syncConfig = {
          id_fields: ["id"],
          synced_field: "synced",
          throttle: 10,
        };
        const user = { id: "sync-schema-test", type: "test" };
        let beforeSync: (() => Promise<void>) | undefined;
        instance = await prostgles({
          dbConnection: getConnectionDetails(
            db,
          ) as unknown as ProstglesInitOptions["dbConnection"],
          io,
          schemaFilter: { [schema]: 1 },
          publish: "*",
          auth: {
            sidKeyName: "token",
            getUser: () => ({ user, clientUser: user }),
            findUser: () => user,
          },
          tableConfig: { [tableName]: { syncConfig } },
          onReady: () => {},
          onLog: async (event) => {
            if (event.type === "sync" && event.command === "addSync") {
              await beforeSync?.();
            }
          },
        });
        const connectClient = createRequire(
          path.resolve("../client/package.json"),
        )("prostgles-client").default as typeof prostglesClient;
        socket = createClient(`http://127.0.0.1:${address.port}`, {
          autoConnect: false,
          transports: ["websocket"],
          query: { token: user.id },
        });
        let readyCount = 0;
        const connecting = connectClient({
          socket,
          onReady: () => {
            readyCount++;
          },
        });
        socket.connect();
        const client = await connecting;
        const table = client.db[tableName]!;
        const received: AnyObject[][] = [[], []];
        let singleRow: AnyObject | undefined;
        const errors: unknown[] = [];
        const subscriptions = await Promise.all(
          received.map((_, index) =>
            table.sync!(
              {},
              { handlesOnData: true },
              (rows) => {
                received[index] = rows;
              },
              (error: unknown) => errors.push(error),
            ),
          ),
        );
        const single = await table.syncOne!<SyncRow, { handlesOnData: true }>(
          { id: 1 },
          { handlesOnData: true },
          (row) => {
            singleRow = row;
          },
          (error: unknown) => errors.push(error),
        );
        const waitForValue = (value: number) =>
          waitFor(
            () =>
              received.every((rows) => rows[0]?.value === value) &&
              singleRow?.value === value,
          );
        const refresh = async (update: () => Promise<unknown>) => {
          const previousReadyCount = readyCount;
          await update();
          await waitFor(() => readyCount > previousReadyCount);
        };
        await waitForValue(1);

        const queuedSyncConfig = { ...syncConfig, throttle: 60_000, batch_size: 1 };
        await refresh(() =>
          instance!.update({
            tableConfig: { [tableName]: { syncConfig: queuedSyncConfig } },
          }),
        );
        await single.$update({ value: 90 });
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 90,
        );
        await single.$update({ value: 91 });
        await refresh(() =>
          instance!.update({
            tableConfig: {
              [tableName]: {
                syncConfig: { ...queuedSyncConfig, batch_size: 2 },
              },
            },
          }),
        );
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 91,
        );
        await waitForValue(91);
        await single.$update({ value: 92 });
        await refresh(() =>
          instance!.update({
            tableConfig: {
              [tableName]: {
                syncConfig: { ...syncConfig, batch_size: 2 },
              },
            },
          }),
        );
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 92,
        );
        await waitForValue(92);

        await db.none(`ALTER TABLE ${tableName} ADD COLUMN added text`);
        await refresh(() => instance!.restart());
        await single.$update({ added: "new column", value: 2 });
        await waitForValue(2);
        await waitFor(
          async () =>
            (
              await db.one<{ added: string }>(
                `SELECT added FROM ${tableName} WHERE id = 1`,
              )
            ).added === "new column",
        );

        await refresh(() =>
          instance!.update({
            tableConfig: {
              [tableName]: {
                syncConfig: {
                  id_fields: ["identity"],
                  synced_field: "synced_next",
                  throttle: 20,
                  batch_size: 1,
                },
              },
            },
          }),
        );
        await single.$update({ value: 3 });
        await waitForValue(3);
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 3,
        );
        assert.equal(single.$get()?.identity, "first");

        let resumeSync = () => {};
        const syncPaused = new Promise<void>((resolve) => {
          beforeSync = () => {
            resolve();
            return new Promise<void>((resume) => {
              resumeSync = resume;
            });
          };
        });
        const refreshing = refresh(() =>
          instance!.update({ publishRawSQL: () => true }),
        );
        await syncPaused;
        try {
          await single.$update({ value: 4 });
          await delay(50);
        } finally {
          beforeSync = undefined;
          resumeSync();
        }
        await refreshing;
        await waitForValue(4);
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 4,
        );
        assert.equal(errors.length, 0);

        await refresh(() => instance!.update({ publish: {} }));
        assert.equal(errors.length, 3);
        assert.equal(single.$get(), undefined);
        assert.deepEqual(
          subscriptions.map((subscription) => subscription.getItems()),
          [[], []],
        );
        await assert.rejects(single.$update({ value: 99 }));
        await assert.rejects(async () =>
          subscriptions[0]!.$upsert([{ id: 1, value: 99 }]),
        );
        await assert.rejects(table.sync!({}, {}, () => {}));
        const deliveriesAfterRevocation = received.map((rows) => rows);
        await db.none(
          `UPDATE ${tableName} SET value = 5, synced_next = $1 WHERE id = 1`,
          [Date.now()],
        );
        await delay(100);
        received.forEach((rows, index) =>
          assert.strictEqual(rows, deliveriesAfterRevocation[index]),
        );

        await refresh(() => instance!.update({ publish: "*" }));
        await waitForValue(5);
        await single.$update({ value: 6 });
        await waitForValue(6);
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 6,
        );
        await db.none(`ALTER TABLE ${tableName} DROP COLUMN added`);
        await refresh(() => instance!.restart());
        await waitFor(() =>
          received.every((rows) => rows[0] && !("added" in rows[0])),
        );
        const lateSubscription = await table.syncOne!<
          SyncRow,
          { handlesOnData: true }
        >({ identity: "first" }, { handlesOnData: true }, () => {});
        await lateSubscription.$update({ value: 7 });
        await waitForValue(7);
        await waitFor(
          async () =>
            (
              await db.one<{ value: number }>(
                `SELECT value FROM ${tableName} WHERE id = 1`,
              )
            ).value === 7,
        );
        lateSubscription.$unsync();
        single.$unsync();
        subscriptions.forEach((subscription) => subscription.$unsync());
      } finally {
        socket?.close();
        await instance?.destroy();
        await io.close();
        await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      }
    },
  );
};

type SyncRow = {
  id: number;
  identity: string;
  value: number;
  synced: number;
  synced_next: number;
  added: string | null | undefined;
};

const waitFor = async (condition: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 5000;
  while (!(await condition())) {
    assert(Date.now() < deadline, "Timed out waiting for sync schema update");
    await delay(10);
  }
};

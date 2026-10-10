import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { EventInfo } from "./server/node_modules/prostgles-server/dist/Logging";
import type { DBHandlerClient } from "./client";
import type { SQLHandler } from "prostgles-types";

export const testSyncTriggerCleanup = async (db: DBHandlerClient, sql: SQLHandler) => {
  await test("subscription receives an update immediately after another trigger is deleted", async () => {
    const table = db.various!;
    const oldSub = await table.subscribe!({ id: 510 }, {}, () => {});
    const MAX_INT4 = 2 ** 31 - 1;
    // Advance the identity sequence so the next subscription tests notifications beyond INTEGER's limit.
    await sql(`SELECT setval(
      pg_get_serial_sequence('prostgles.app_triggers', 'table_condition_id'),
      ${MAX_INT4}
    )`);
    await table.insert!({ id: 511, name: "before" });
    const results: string[] = [];
    const sub = await table.subscribe!({ id: 511 }, {}, ([row]) => {
      if (row) results.push(row.name);
    });
    try {
      await delay(300);
      assert.equal(results.at(-1), "before");
      await oldSub.unsubscribe();
      // Commit cleanup and a data change together: the data notification must work
      // even while the notification for the registration change is being handled.
      await sql(`
        BEGIN;
        DELETE FROM prostgles.app_triggers
        WHERE table_name = 'various' AND condition = '"id" = 510';
        UPDATE various SET name = 'after' WHERE id = 511;
        COMMIT;
      `);
      for (let attempt = 0; attempt < 100 && results.at(-1) !== "after"; attempt++) {
        await delay(20);
      }
      assert.equal(results.at(-1), "after");
    } finally {
      await sub.unsubscribe();
      await table.delete!({ id: 511 });
    }
  });

  await test("unsubscribe cleanup preserves a sync being registered", { timeout: 10000 }, async () => {
    const planes = db.planes!;
    const oldFilter = { flight_number: "cleanup-old" };
    const filter = { flight_number: SYNC_TRIGGER_CLEANUP_FLIGHT };
    const subscription = await planes.subscribe!(oldFilter, {}, () => {});
    await subscription.unsubscribe();

    const received = { insert: false };
    const sync = await planes.sync!(filter, {}, (rows) => {
      received.insert = rows.some((row) => row.flight_number === SYNC_TRIGGER_CLEANUP_FLIGHT);
    });
    try {
      // Let the queued cleanup finish before the insert that must reach the client.
      await delay(1100);
      await planes.insert!({ id: -10001, ...filter, last_updated: Date.now() });
      for (let attempt = 0; attempt < 150 && !received.insert; attempt++) {
        await delay(20);
      }
      assert(received.insert, "The new sync lost its trigger during unsubscribe cleanup");
    } finally {
      await sync.$unsync();
    }
  });
};

// Hold the registration between its database INSERT and its in-memory sync entry.
// The unsubscribe cleanup timer fires after one second during this interval.
export const delaySyncTriggerRegistration = async (event: EventInfo) => {
  if (
    event.type === "syncOrSub" && event.command === "addTrigger" &&
    event.tableName === "planes" &&
    event.condition === `"flight_number" = '${SYNC_TRIGGER_CLEANUP_FLIGHT}'`
  ) {
    await delay(1500);
  }
};

const SYNC_TRIGGER_CLEANUP_FLIGHT = "cleanup-new-sync";

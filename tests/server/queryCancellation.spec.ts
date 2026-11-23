import { strict as assert } from "node:assert";
import { test } from "node:test";
import { setImmediate, setTimeout as delay } from "node:timers/promises";
import { ABORTABLE_METHODS } from "prostgles-types";
import type { DB, DBHandlerServerInternal } from "./serverTypes";

export const testQueryCancellation = async (db: DBHandlerServerInternal, pgDb: DB) => {
  for (const expireCheckout of [false, true]) {
    await test(`aborted reads skip queued SQL after ${expireCheckout ? "checkout timeout" : "connection release"}`, async (t) => {
      const pool = pgDb.$pool;
      const originalTimeout = pool.options.connectionTimeoutMillis;
      assert(!originalTimeout, "Pool checkout should have no timeout by default");
      const connections = await Promise.all(
        Array.from({ length: Number(pool.options.max) }, () => pgDb.connect()),
      );
      try {
        if (expireCheckout) pool.options.connectionTimeoutMillis = 200;
        const items = db.items!;
        const controller = new AbortController();
        const reads = ABORTABLE_METHODS.map((method) =>
          assert.rejects(items[method]({}, { abortSignal: controller.signal }), {
            code: "57014",
            message: "Query cancelled by abortSignal: checkout",
          }),
        );
        await setImmediate();
        assert.equal(pool.waitingCount, reads.length);
        const queuedSql = [...items.activeQueries.values()].map(({ query }) => query);
        assert.equal(queuedSql.length, reads.length);
        controller.abort("checkout");
        assert(
          await Promise.race([Promise.all(reads), delay(1000, false, { ref: false })]),
          "The callers must settle while every connection is still checked out",
        );
        assert.equal(items.activeQueries.size, 0);
        if (expireCheckout) {
          await delay(250);
          assert.equal(pool.waitingCount, 0, "Abandoned checkouts must expire without a release");
        }

        const nextConnection = connections.pop();
        assert(nextConnection);
        const submitted = t.mock.method(nextConnection.client, "query").mock;
        await nextConnection.done();
        const probe = "SELECT 1";
        await pgDb.one(probe);
        assert.equal(pool.waitingCount, 0);
        const submittedSql = submitted.calls.map(({ arguments: [sql] }) => sql);
        assert(submittedSql.includes(probe));
        for (const sql of submittedSql) {
          if (typeof sql === "string") assert(!queuedSql.some((query) => sql.startsWith(query)));
        }
      } finally {
        pool.options.connectionTimeoutMillis = originalTimeout;
        await Promise.all(connections.map((connection) => connection.done()));
      }
    });
  }

  await test("concurrent read cancellation reuses one admin connection", async () => {
    const slowItems = db.slow_items!;
    const adminClient = slowItems.dboBuilder.prostgles.adminClient;
    assert(adminClient);
    const controller = new AbortController();
    const reads = Array.from({ length: 4 }, () =>
      assert.rejects(slowItems.find({}, { abortSignal: controller.signal }), {
        code: "57014",
      }),
    );
    await delay(100);
    controller.abort();
    await Promise.all(reads);
    await adminClient.query("SELECT 1");
    assert.equal(adminClient.totalCount, 1);
    assert.equal(adminClient.idleCount, 1);
    assert.equal(slowItems.activeQueries.size, 0);
  });

  await test("read cancellation reports admin query failures", async (t) => {
    const slowItems = db.slow_items!;
    const adminClient = slowItems.dboBuilder.prostgles.adminClient;
    assert(adminClient);
    const failure = new Error("Cancellation connection unavailable");
    const logged = t.mock.method(slowItems, "_log").mock;
    const cancellation = t.mock.method(adminClient, "query", () => Promise.reject(failure));
    const controller = new AbortController();
    const read = assert.rejects(slowItems.find({}, { abortSignal: controller.signal }), {
      code: "57014",
    });
    try {
      await delay(100);
      controller.abort();
      await setImmediate();
      assert(
        logged.calls.some(
          ({ arguments: [event] }) =>
            event.command === "abort" &&
            event.error instanceof Error &&
            event.error.message === "Failed to cancel query" &&
            event.error.cause === failure,
        ),
      );
    } finally {
      cancellation.mock.restore();
      for (const { query } of slowItems.activeQueries.values()) {
        await pgDb.any(
          "SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE starts_with(query, $1)",
          [query],
        );
      }
      await read;
    }
  });
};

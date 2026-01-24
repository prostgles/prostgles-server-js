import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { useProstglesClient, type UseProstglesClientProps } from "prostgles-client";
import type { DBHandlerClient } from "./index";
import { renderReactHook, renderReactHookManual } from "./renderReactHook";
import type { SQLHandler } from "prostgles-types";

export const newly_created_table = "newly_created_table";
export const useProstglesTest = async (
  db: DBHandlerClient,
  sql: SQLHandler,
  getSocketOptions: (watchSchema?: boolean) => UseProstglesClientProps,
) => {
  await sql(`DROP TABLE IF EXISTS ${newly_created_table};`);
  await describe("useProstgles hook", async (t) => {
    const clientOptions = getSocketOptions();
    await test("useProstglesClient", async (t) => {
      const {
        results: [res1, res2],
      } = await renderReactHook({
        hook: useProstglesClient,
        props: [clientOptions],
        expectedRerenders: 2,
      });
      assert.deepStrictEqual(res1, { isLoading: true, hasError: false });
      assert.equal(typeof res2?.db.items4.useFind, "function");
      assert.equal(typeof res2?.db[newly_created_table], "undefined");
    });

    await test("useProstglesClient with schema reload", async (t) => {
      await sql(`select pg_sleep(1)`);
      await renderReactHookManual({
        hook: useProstglesClient,
        initialProps: [getSocketOptions(true)],
        renderDuration: 1000,
        onRender: async (results) => {
          if (results.length !== 1) return;
          sql(`CREATE TABLE ${newly_created_table}(id integer);`);
        },
        onEnd: async (results) => {
          const [res1, res2, res3] = results;
          assert.deepStrictEqual(res1, { isLoading: true, hasError: false });
          assert.equal(res2.isLoading, false);
          assert.equal(res2.hasError, false);
          assert.equal(res3.isLoading, false);
          assert.equal(typeof res2?.db[newly_created_table]?.useFind, "undefined");
          assert.equal(res3.hasError, false);
          assert.equal(typeof res3?.db[newly_created_table].useFind, "function");
          assert.equal(results.length, 3);

          const count = await res3?.db[newly_created_table].count();
          assert.equal(count, 0);
        },
      });
    });

    await test("useProstglesClient with initial skip", async (t) => {
      const { setProps } = await renderReactHookManual({
        hook: useProstglesClient,
        initialProps: [{ ...clientOptions, skip: true }],
        onEnd: async (results) => {
          assert.deepStrictEqual(results, [{ isLoading: true, hasError: false }]);
        },
      });
      await setProps([clientOptions], {
        onEnd: async (results) => {
          assert.equal(results.length, 3);
          const [res1, res2, res3] = results;
          assert.deepStrictEqual(
            [res1, res2],
            [
              { isLoading: true, hasError: false },
              { isLoading: true, hasError: false },
            ],
          );
          if (res3.isLoading) throw "Still loading";
          if (res3.hasError || !("db" in res3)) throw res3.error;
          const count = await res3?.db.items4.count();
          assert.equal(count, 0);

          assert.equal(res3.isLoading, false);
          if ("error" in res3) throw res3.error;
          assert.equal(typeof res3.db[newly_created_table]?.useFind, "undefined");
        },
      });

      await setProps([getSocketOptions(true)], {
        onEnd: async (results) => {
          assert.equal(results.length, 5);
          const [res1, res2, res3, res4, res5] = results;
          assert.equal(results.length, 5);
          assert.equal(res5.isLoading, false);
          if ("error" in res5) throw res5.error;

          const count = await res5.db.items4.count();
          assert.equal(count, 0);

          assert.equal(typeof res5.db[newly_created_table].useFind, "function");
          const count0 = await res5.db[newly_created_table].count();
          assert.equal(count0, 0);
        },
      });
    });
  });
};

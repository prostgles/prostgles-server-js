import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { useProstglesClient } from "prostgles-client/dist/prostgles";
import { AnyObject } from "prostgles-types";
import type { DBHandlerClient } from "./index";
import { renderReactHook, renderReactHookManual } from "./renderReactHook";

export const useProstglesTest = async (db: DBHandlerClient, getSocketOptions: (watchSchema?: boolean) => AnyObject) => {
  await describe("useProstgles hook", async (t) => {
    const socketOptions = getSocketOptions();
    await test("useProstglesClient", async (t) => {
      const { results: [res1, res2] } = await renderReactHook({
        hook: useProstglesClient,
        props: [{ socketOptions }],
        expectedRerenders: 2
      });
      assert.deepStrictEqual(
        res1,
        { isLoading: true }
      ); 
      assert.equal(
        typeof (res2 as any)?.dbo.items4.useFind,
        "function"
      );
    });
    
    const newTableName = "newly_created_table";
    await test("useProstglesClient with schema reload", async (t) => {
      await db.sql(`DROP TABLE IF EXISTS ${newTableName}; DROP TABLE IF EXISTS will_delete;`);
      await db.sql(`select pg_sleep(1)`);
      let rerenders = 0
      const { results: [res1, res2, res3], rerender } = await renderReactHook({
        hook: useProstglesClient,
        props: [{ socketOptions: getSocketOptions(true) }],
        expectedRerenders: 3,
        onResult: () => {
          rerenders++;
          if(rerenders < 2) return;
          rerenders = -2;
          db.sql(`CREATE TABLE ${newTableName}(id integer);`);
        }
      });
      assert.deepStrictEqual(
        res1,
        { isLoading: true }
      );
      assert.equal(
        res2.isLoading,
        false
      );
      assert.equal(
        typeof (res2 as any)?.dbo[newTableName]?.useFind,
        "undefined"
      );
      assert.equal(
        typeof (res3 as any)?.dbo[newTableName].useFind,
        "function"
      );

      const count = await (res3 as any)?.dbo[newTableName].count();
      assert.equal(count, 0);
    });

    await test("useProstglesClient with initial skip", async (t) => {
      const { setProps } = await renderReactHookManual({
        hook: useProstglesClient,
        initialProps: [{ socketOptions, skip: true }],
        onEnd: async (results) => {
          assert.deepStrictEqual(results, [{ isLoading: true }]);
        }
      });
      await setProps([{ socketOptions }], {
        onEnd: async (results) => {
          assert.equal(results.length, 3);
          const [res1, res2, res3] = results;
          assert.deepStrictEqual([res1, res2], [{ isLoading: true }, { isLoading: true }]);
          const count = await (res3 as any)?.dbo.items4.count();
          assert.equal(count, 0);

          assert.equal(res3.isLoading, false);
          if("error" in res3) throw res3.error;
          assert.equal(
            typeof res3.dbo[newTableName]?.useFind,
            "undefined"
          );
        }
      });

      await setProps([{ socketOptions: getSocketOptions(true) }], {
        onEnd: async (results) => {
          assert.equal(results.length, 5);
          const [res1, res2, res3, res4, res5] = results;
          assert.equal(results.length, 5);
          assert.equal(res5.isLoading, false);
          if("error" in res5) throw res5.error;
          
          const count = await res5.dbo.items4.count();
          assert.equal(count, 0);
 
          assert.equal(
            typeof res5.dbo[newTableName].useFind,
            "function"
          );
          const count0 = await res5.dbo[newTableName].count();
          assert.equal(count0, 0);
        }
      });
    });
  
  });

}
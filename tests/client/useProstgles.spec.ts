import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { useProstglesClient } from "prostgles-client/dist/prostgles";
import { AnyObject } from "prostgles-types";
import type { DBHandlerClient } from "./index";
import { renderReactHook } from "./renderReactHook";

export const useProstglesTest = async (db: DBHandlerClient, getSocketOptions: (watchSchema?: boolean) => AnyObject) => {
  await describe("useProstgles hook", async (t) => {
    
    await test("useProstglesClient with schema reload", async (t) => {
      const newTableName = "newly_created_table";
      await db.sql(`DROP TABLE IF EXISTS ${newTableName};`);
      await db.sql(`select pg_sleep(1)`);
      let rerenders = 0
      const { results: [res1, res2, res3] } = await renderReactHook({
        hook: useProstglesClient,
        props: [{ socketOptions:  getSocketOptions(true) }],
        expectedRerenders: 3,
        onResult: () => {
          rerenders++;
          if(rerenders < 2) return;
          rerenders = -2;
          db.sql(`CREATE TABLE ${newTableName}();`);
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
    });
  
  });

}
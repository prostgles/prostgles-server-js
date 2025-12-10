//@ts-ignore
import { describe, test } from "node:test";
import type { DBHandlerServer } from "../dist/Prostgles";
import { assert } from "console";

export const serverOnlyQueries = async (db: DBHandlerServer) => {
  await describe("Server Only Queries", async () => {
    await test('Parallel subscription at init causing crash in getPubSubManager: duplicate key value violates unique constraint "apps_pkey"', async () => {
      let results: any[] = [];
      const sub1 = db.rec.subscribe!({}, {}, (res) => {
        results.push(res);
      });
      const sub2 = db.items.subscribe!({}, {}, (res) => {
        results.push(res);
      });
      const timeout = 5_000;
      while (results.length < 2 && timeout > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(results.length === 2, "Did not receive both subscription initial results");
      (await sub1).unsubscribe();
      (await sub2).unsubscribe();
    });
    await test("Self reference recursion bug", async () => {
      await db.rec.findOne!({ id: 1 }, { select: { "*": 1, rec_ref: "*" } });
    });
    await test("Transactions", async () => {
      await db.tx!(async (t) => {
        await t.items.insert!({ name: "tx_" });
        const expect1 = await t.items.count!({ name: "tx_" });
        const expect0 = await db.items.count!({ name: "tx_" });
        if (expect0 !== 0 || expect1 !== 1) throw "db.tx failed";

        //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
      });
      const expect1 = await db.items.count!({ name: "tx_" });
      if (expect1 !== 1) throw "db.tx failed";
    });

    await test("TableConfig onMount works", async () => {
      await db.api_table.findOne!({ id: 1 });
      const newRow = await db.api_table.insert!({}, { returning: "*" });
      if (newRow.col1 !== null) {
        throw "api_table onMount failed: col1 missing. Got: " + JSON.stringify(newRow);
      }
    });
  });
};

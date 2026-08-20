//@ts-ignore
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { getJSONBSchemaValidationErrorAsync } from "prostgles-types";
import type { DBHandlerServer } from "../dist/Prostgles";

export const serverOnlyQueries = async (db: DBHandlerServer) => {
  await describe("Server Only Queries", async () => {
    await test("getJSONBSchemaValidationErrorAsync with real db handlers", async () => {
      const dbMap = new Map(Object.entries(db));

      assert.deepEqual(
        await getJSONBSchemaValidationErrorAsync({ type: "TableLookup" }, "items", dbMap),
        { data: "items" },
      );
      assert.deepEqual(
        await getJSONBSchemaValidationErrorAsync({ type: "TableLookup" }, "missing", dbMap),
        { error: 'value references an unknown table "missing"' },
      );

      const column = { table: "items", column: "name" };
      assert.deepEqual(
        await getJSONBSchemaValidationErrorAsync({ type: "ColumnLookup" }, column, dbMap),
        { data: column },
      );
      assert.deepEqual(
        await getJSONBSchemaValidationErrorAsync(
          { type: "ColumnLookup" },
          { table: "items", column: "missing" },
          dbMap,
        ),
        { error: 'value references an unknown or disallowed column "items.missing"' },
      );

      assert.deepEqual(
        await getJSONBSchemaValidationErrorAsync(
          { type: "RowLookup", table: "users" },
          { id: 1 },
          dbMap,
        ),
        { data: { id: 1 } },
      );
      assert.deepEqual(
        await getJSONBSchemaValidationErrorAsync(
          { type: "ValueLookup", table: "users", column: "id" },
          -1,
          dbMap,
        ),
        { error: 'value does not reference an existing row in "users"' },
      );
    });

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
      const rowData = { name: "tx_" };
      await db.tx!(async (t) => {
        await t.items.insert!(rowData);
        const expect1 = await t.items.count!(rowData);
        const expect0count = await db.items.count!(rowData);
        const expect0find = await db.items.findOne!(rowData);
        if (expect0count !== 0 || expect0find || expect1 !== 1) {
          throw "db.tx failed: " + JSON.stringify({ expect0count, expect0find, expect1 });
        }

        //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
      });
      const expect1 = await db.items.count!(rowData);
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

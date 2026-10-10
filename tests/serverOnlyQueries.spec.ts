import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { getJSONBSchemaValidationErrorAsync, type TableHandler } from "prostgles-types";
import type { DB, DBHandlerServerInternal } from "./server/node_modules/prostgles-server/dist/Prostgles";
import { testWithUserRLS } from "./server/withUserRLS.spec";
import { testAudit } from "./server/audit.spec";
import { testSocketLifecycle } from "./server/socketLifecycle.spec";
import { testJoins } from "./server/joins.spec";
import { testFileStorage } from "./server/fileStorage.spec";
import type { withUserRLS as WithUserRLS } from "./server/node_modules/prostgles-server/dist/DboBuilder/dboBuilderUtils";
import { testSchemaTypes } from "./server/schemaTypes.spec";
import { testClientSchemaTypes } from "./server/clientSchemaTypes.spec";
import { testExecutionContext } from "./server/executionContext.spec";
import { testTableHookRecursion } from "./server/tableHookRecursion.spec";
import { testTableConfigValidation } from "./server/tableConfig.spec";
import { testBackgroundJobs } from "./server/backgroundJobs.spec";
import { testFileJobs } from "./server/fileJobs.spec";
import { testConflictUpdates } from "./server/conflictUpdates.spec";
import type { DBOFullyTyped } from "./server/node_modules/prostgles-server/dist/DBSchemaBuilder/DBSchemaBuilder";
import type { DBGeneratedSchema } from "./DBGeneratedSchema";

export const serverOnlyQueries = async (
  db: DBHandlerServerInternal,
  pgDb: DB,
  withUserRLS: typeof WithUserRLS,
) => {
  await describe("Server Only Queries", async () => {
    await testTableConfigValidation(pgDb);
    await testExecutionContext(pgDb);
    await testTableHookRecursion(pgDb);
    await testConflictUpdates(pgDb);
    await testBackgroundJobs(pgDb);
    await testFileJobs(pgDb);
    await testSchemaTypes(db, pgDb);
    await testClientSchemaTypes(pgDb);
    await testFileStorage(db, pgDb);
    await testJoins(pgDb);
    await testSocketLifecycle(pgDb);
    await testAudit(pgDb);
    await test("getJSONBSchemaValidationErrorAsync with real db handlers", async () => {
      const dbMap = new Map(Object.entries(db)) as Map<string, TableHandler>;

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
      const results: any[] = [];
      const sub1 = db.rec!.subscribe({}, {}, (res) => {
        results.push(res);
      });
      const sub2 = db.items!.subscribe({}, {}, (res) => {
        results.push(res);
      });
      while (results.length < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert(results.length === 2, "Did not receive both subscription initial results");
      await (await sub1).unsubscribe();
      await (await sub2).unsubscribe();
    });
    await testWithUserRLS(db, pgDb, withUserRLS);
    await test("Self reference recursion bug", async () => {
      await db.rec!.findOne({ id: 1 }, { select: { "*": 1, rec_ref: "*" } });
    });
    await test("Transactions", async () => {
      const rowData = { name: "tx_" };
      await db.tx?.(async (t) => {
        await t.items!.insert(rowData);
        const expect1 = await t.items!.count(rowData);
        const expect0count = await db.items!.count(rowData);
        const expect0find = await db.items!.findOne(rowData);
        if (expect0count !== 0 || expect0find || expect1 !== 1) {
          throw "db.tx failed: " + JSON.stringify({ expect0count, expect0find, expect1 });
        }

        //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
      });
      const expect1 = await db.items!.count(rowData);
      if (expect1 !== 1) throw "db.tx failed";
    });

    await test("forUpdate locks selected rows until commit or rollback", async () => {
      const typedDb = db as unknown as DBOFullyTyped<DBGeneratedSchema>;
      const rows = await typedDb.items.insertMany(
        [{ name: "lock first" }, { name: "lock second" }],
        { returning: "*" },
      );
      const ids = rows.map((row) => row.id);
      const filter = { id: { $in: ids } };
      const lockRow = (id: number) =>
        pgDb.any("SELECT id FROM items WHERE id = $1 FOR UPDATE NOWAIT", [id]);
      const hasMessage = (message: string) => (error: unknown) =>
        JSON.stringify(error).includes(message);
      try {
        await assert.rejects(
          typedDb.items.find(filter, { forUpdate: true }),
          hasMessage("requires a transaction"),
        );
        assert.equal((await typedDb.items.find(filter, { forUpdate: false })).length, 2);
        const linked = await typedDb.items2.insert(
          { items_id: ids[0], name: rows[0]!.name },
          { returning: "*" },
        );
        for (const rollback of [false, true]) {
          const rollbackError = new Error("rollback locked rows");
          const transaction = typedDb.tx(async (dbx) => {
            const selected = await dbx.items.find(filter, {
              select: { id: 1 },
              orderBy: { id: 1 },
              limit: 1,
              forUpdate: true,
            });
            selected satisfies { id: number }[];
            // @ts-expect-error Locked reads preserve the selected return type.
            selected[0]!.name;
            assert.deepEqual(selected, [{ id: ids[0] }]);
            await assert.rejects(lockRow(ids[0]!), { code: "55P03" });
            await lockRow(ids[1]!);
            const second = await dbx.items.findOne(
              { id: ids[1] },
              { select: { id: 1 }, forUpdate: true },
            );
            second satisfies { id: number } | undefined;
            assert.deepEqual(second, { id: ids[1] });
            await assert.rejects(lockRow(ids[1]!), { code: "55P03" });
            const joined = await dbx.items.findOne(
              { id: ids[0] },
              {
                select: { id: 1, items2: "*" },
                forUpdate: true,
              },
            );
            assert.equal(joined?.items2[0]?.id, linked.id);
            await pgDb.any("SELECT id FROM items2 WHERE id = $1 FOR UPDATE NOWAIT", [linked.id]);
            assert.equal(await dbx.items.findOne({ id: -1 }, { forUpdate: true }), undefined);
            if (rollback) throw rollbackError;
          });
          if (rollback) await assert.rejects(transaction, (error) => error === rollbackError);
          else await transaction;
          await lockRow(ids[0]!);
          await lockRow(ids[1]!);
        }
        await db.tx!(async (dbx) => {
          await assert.rejects(
            dbx.items!.find(filter, { forUpdate: "yes" as unknown as boolean }),
            hasMessage("forUpdate"),
          );
          await assert.rejects(
            dbx.items!.find(filter, { select: { count: { $countAll: [] } }, forUpdate: true }),
            hasMessage("aggregations"),
          );
          await assert.rejects(
            dbx.items!.find(filter, { groupBy: true, forUpdate: true }),
            hasMessage("groupBy"),
          );
          await assert.rejects(
            dbx.v_items!.find({}, { forUpdate: true }),
            hasMessage("only supported on tables"),
          );
          await assert.rejects(
            dbx.items!.find(filter, { select: { items_multi: "*" }, forUpdate: true }),
            hasMessage("OR joins"),
          );
        });
      } finally {
        await typedDb.items2.delete({ items_id: { $in: ids } });
        await typedDb.items.delete(filter);
      }
    });

    await test("TableConfig onMount works", async () => {
      await db.api_table!.findOne({ id: 1 });
      const newRow = await db.api_table!.insert({}, { returning: "*" });
      if (newRow.col1 !== null) {
        throw "api_table onMount failed: col1 missing. Got: " + JSON.stringify(newRow);
      }
    });
  });
};

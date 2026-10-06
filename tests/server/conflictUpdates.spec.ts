import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import prostgles, { type InitResult, type ProstglesInitOptions } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type {
  UpdateRule,
  ValidateRowBasic,
} from "prostgles-server/dist/PublishParser/PublishParser";
import type { InsertParams } from "prostgles-types";

export const testConflictUpdates = async (db: DB) => {
  await test("DoUpdate enforces update rules and dispatches after hooks", async (t) => {
    const schema = `conflict_${randomUUID().replaceAll("-", "")}`;
    const table = `${schema}.records`;
    const events: { phase: string; command: string; ids: number[] }[] = [];
    let instance: InitResult | undefined;
    let rejectHook = false;
    let rejectPostValidate = false;
    let updateRule: UpdateRule | undefined;
    let insertValidate: ValidateRowBasic | undefined;
    const resetRule = () => {
      updateRule = {
        fields: ["value", "owner", "stamp"],
        filterFields: ["id"],
        returningFields: ["id", "value", "owner", "stamp"],
        forcedFilter: { owner: "alice" },
        forcedData: { stamp: "updated" },
        checkFilter: { value: { $ne: "invalid" } },
        postValidate: () => {
          if (rejectPostValidate) throw new Error("Rejected update postValidate");
        },
      };
      events.length = 0;
      rejectHook = false;
      rejectPostValidate = false;
      insertValidate = undefined;
    };
    resetRule();
    try {
      await db.none(`CREATE SCHEMA ${schema}; CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY, value TEXT, owner TEXT DEFAULT 'alice', stamp TEXT,
        secret TEXT DEFAULT 'hidden'
      );`);
      instance = await prostgles({
        dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 },
        transactions: true,
        auth: { getUser: () => undefined, findUser: () => ({ id: "alice", type: "user" }) },
        publish: () => ({
          [table]: {
            insert: {
              fields: "*",
              returningFields: "*",
              forcedData: { stamp: "inserted" },
              checkFilter: { value: { $ne: "insert-invalid" } },
              validate: insertValidate,
            },
            update: updateRule,
          },
        }),
        tableHooks: {
          [table]: {
            afterEach: [
              {
                commands: { insert: 1, update: 1 },
                validate: ({ row, command }) => {
                  events.push({ phase: "each", command, ids: [row.id] });
                  if (rejectHook && command === "update") throw new Error("Rejected update hook");
                },
              },
              {
                commands: { update: 1 },
                changedFields: ["owner"],
                validate: ({ row, command }) => {
                  events.push({ phase: "owner", command, ids: [row.id] });
                },
              },
            ],
            afterAll: [
              {
                commands: { insert: 1, update: 1 },
                validate: ({ rows, command, data }) => {
                  events.push({ phase: "all", command, ids: rows.map((row) => row.id) });
                  if (command === "update") {
                    const inputs = Array.isArray(data) ? data : [data];
                    assert(inputs.every((row) => !Object.hasOwn(row, "id")));
                  }
                  return Promise.resolve();
                },
              },
            ],
            afterCommit: [
              {
                commands: { insert: 1, update: 1 },
                run: ({ rows, command }) => {
                  events.push({ phase: "commit", command, ids: rows.map((row) => row.id) });
                },
              },
            ],
          },
        },
        onReady: () => {},
      });
      const client = async () =>
        (await instance!.getClientDBHandlers({ userId: "alice" }, undefined)).clientDb[table]!;
      const seed = async () => {
        resetRule();
        await db.none(`TRUNCATE ${table}; INSERT INTO ${table} (id, value, owner) VALUES
          (1, 'old', 'alice'), (2, 'private', 'bob'), (3, 'old', 'alice')`);
      };
      for (const onConflict of [
        "DoUpdate",
        { action: "DoUpdate", conflictColumns: ["id"] },
      ] satisfies InsertParams["onConflict"][]) {
        await t.test(`mixed batches: ${JSON.stringify(onConflict)}`, async () => {
          await seed();
          const rows = await (
            await client()
          ).insertMany!(
            [
              { id: 1, value: "one" },
              { id: 4, value: "four" },
              { id: 3, value: "three" },
              { id: 5, value: "five" },
            ],
            { onConflict, returning: ["id", "value", "stamp"] },
          );
          assert.deepEqual(rows, [
            { id: 1, value: "one", stamp: "updated" },
            { id: 4, value: "four", stamp: "inserted" },
            { id: 3, value: "three", stamp: "updated" },
            { id: 5, value: "five", stamp: "inserted" },
          ]);
          assert.deepEqual(
            events.filter((event) => event.phase === "all"),
            [
              { phase: "all", command: "update", ids: [1, 3] },
              { phase: "all", command: "insert", ids: [4, 5] },
            ],
          );
          assert.deepEqual(
            events.filter((event) => event.phase === "commit").map((event) => event.ids),
            [
              [1, 3],
              [4, 5],
            ],
          );
          assert.equal(events.filter((event) => event.phase === "each").length, 4);
        });
      }
      await t.test("insert validation returns the conflict keys and update values", async () => {
        await seed();
        insertValidate = async ({ row }) => ({
          ...row,
          id: row.id - 10,
          value: (await db.one("SELECT 'validated' AS value")).value,
        });
        const input = [
          { id: 11, value: "one" },
          { id: 14, value: "four" },
        ];
        const rows = await (
          await client()
        ).insertMany!(input, { onConflict: "DoUpdate", returning: ["id", "value"] });
        assert.deepEqual(rows, [
          { id: 1, value: "validated" },
          { id: 4, value: "validated" },
        ]);
        assert.deepEqual(input, [
          { id: 11, value: "one" },
          { id: 14, value: "four" },
        ]);
      });
      await t.test(
        "forcedFilter protects the existing row before ownership can change",
        async () => {
          await seed();
          const result = await (
            await client()
          ).insert!(
            { id: 2, owner: "alice", value: "stolen" },
            { onConflict: "DoUpdate", returning: ["id"] },
          );
          assert.equal(result, undefined);
          assert.equal((await db.one(`SELECT owner FROM ${table} WHERE id = 2`)).owner, "bob");
          assert.deepEqual(events, []);
        },
      );
      await t.test("duplicate conflict keys roll back the batch", async () => {
        await seed();
        await assert.rejects(
          (await client()).insertMany!(
            [
              { id: 4, value: "first" },
              { id: 4, value: "second" },
            ],
            { onConflict: "DoUpdate" },
          ),
        );
        assert.equal(
          (await db.one(`SELECT count(*)::int AS count FROM ${table} WHERE id = 4`)).count,
          0,
        );
        assert.deepEqual(events, []);
      });
      await t.test("insert checks are not applied to updated rows", async () => {
        await seed();
        await (
          await client()
        ).insert!({ id: 1, value: "insert-invalid" }, { onConflict: "DoUpdate" });
        assert.equal(
          (await db.one(`SELECT value FROM ${table} WHERE id = 1`)).value,
          "insert-invalid",
        );
        assert(events.every((event) => event.command === "update"));
      });
      await t.test("changedFields hooks only receive matching update inputs", async () => {
        await seed();
        await (
          await client()
        ).insertMany!(
          [
            { id: 1, value: "one", owner: "alice" },
            { id: 3, value: "three" },
          ],
          { onConflict: "DoUpdate" },
        );
        assert.deepEqual(
          events.filter((event) => event.phase === "owner"),
          [{ phase: "owner", command: "update", ids: [1] }],
        );
      });
      await t.test(
        "missing update permissions, fields, and returning fields are enforced",
        async () => {
          await seed();
          await assert.rejects(
            (await client()).insert!(
              { id: 1, value: "bad", secret: "changed" },
              { onConflict: "DoUpdate" },
            ),
          );
          await assert.rejects(
            (await client()).insert!(
              { id: 1, value: "bad" },
              { onConflict: "DoUpdate", returning: ["secret"] },
            ),
          );
          updateRule = undefined;
          await assert.rejects(
            (await client()).insert!({ id: 1, value: "bad" }, { onConflict: "DoUpdate" }),
          );
          assert.equal((await db.one(`SELECT value FROM ${table} WHERE id = 1`)).value, "old");
          assert.deepEqual(events, []);
        },
      );
      await t.test("returning star respects both rules for inserted and updated rows", async () => {
        await seed();
        const rows = await (
          await client()
        ).insertMany!(
          [
            { id: 1, value: "updated" },
            { id: 4, value: "inserted" },
          ],
          { onConflict: "DoUpdate", returning: "*" },
        );
        assert(rows.every((row) => !Object.hasOwn(row, "secret")));
      });
      for (const rejection of ["checkFilter", "postValidate", "hook", "insertCheck"]) {
        await t.test(`${rejection} failure rolls back the entire mixed batch`, async () => {
          await seed();
          rejectHook = rejection === "hook";
          rejectPostValidate = rejection === "postValidate";
          await assert.rejects(
            (await client()).insertMany!(
              [
                { id: 4, value: rejection === "insertCheck" ? "insert-invalid" : "new" },
                { id: 1, value: rejection === "checkFilter" ? "invalid" : "changed" },
              ],
              { onConflict: "DoUpdate" },
            ),
          );
          assert.equal((await db.one(`SELECT count(*)::int AS count FROM ${table}`)).count, 3);
          assert.equal((await db.one(`SELECT value FROM ${table} WHERE id = 1`)).value, "old");
          assert(!events.some((event) => event.phase === "commit"));
        });
      }
      await t.test(
        "update validation and dynamic fields use the existing update path",
        async () => {
          await seed();
          updateRule!.validate = ({ update }) => ({ ...update, value: "validated" });
          updateRule!.dynamicFields = [{ filter: { id: 1 }, fields: ["value", "stamp"] }];
          const result = await (
            await client()
          ).insert!({ id: 1, value: "input" }, { onConflict: "DoUpdate", returning: ["value"] });
          assert.deepEqual(result, { value: "validated" });
        },
      );
      await t.test("server calls without returning still run update-only hooks", async () => {
        await seed();
        await instance!.update({
          tableHooks: {
            [table]: {
              afterEach: [
                {
                  commands: { update: 1 },
                  validate: ({ row, command }) => {
                    events.push({ phase: "each", command, ids: [row.id] });
                  },
                },
              ],
            },
          },
        });
        await instance!.db[table]!.insert!({ id: 1, value: "server" }, { onConflict: "DoUpdate" });
        assert.deepEqual(events, [{ phase: "each", command: "update", ids: [1] }]);
      });
      await t.test(
        "concurrent conflict waits, updates, and survives a concurrent delete",
        async () => {
          await seed();
          const handler = await client();
          for (const deleting of [false, true]) {
            let release!: () => void;
            let ready!: () => void;
            const held = new Promise<void>((resolve) => {
              ready = resolve;
            });
            const gate = new Promise<void>((resolve) => {
              release = resolve;
            });
            const blocker = db.tx(async (tx) => {
              await tx.none(
                deleting ?
                  `DELETE FROM ${table} WHERE id = 9`
                : `INSERT INTO ${table} (id, value) VALUES (9, 'concurrent')`,
              );
              ready();
              await gate;
            });
            await held;
            const pending = handler.insert!(
              { id: 9, value: "ours" },
              { onConflict: "DoUpdate", returning: ["id", "value"] },
            );
            try {
              // Wait until the insert is blocked by the other transaction, rather than racing a timer.
              for (let attempt = 0; ; attempt++) {
                const { blocked } = await db.one(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND query LIKE '%${schema}%' AND query LIKE '%INSERT INTO%') AS blocked`);
                if (blocked) break;
                if (attempt === 200) throw new Error("Insert did not wait for concurrent writer");
                await new Promise((resolve) => setTimeout(resolve, 10));
              }
            } finally {
              release();
              await blocker;
            }
            assert.deepEqual(await pending, { id: 9, value: "ours" });
          }
        },
      );
    } finally {
      await instance?.destroy();
      await db.none(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
};

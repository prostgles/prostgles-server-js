import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import prostgles, { type InitResult, type ProstglesInitOptions } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { UpdateRule } from "prostgles-server/dist/PublishParser/PublishParser";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
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
    let transformInsert = false;
    const beforeCommands: string[] = [];
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
      transformInsert = false;
      beforeCommands.length = 0;
    };
    resetRule();
    try {
      await db.none(`CREATE SCHEMA ${schema}; CREATE TABLE ${table} (
        id INTEGER PRIMARY KEY, value TEXT, owner TEXT DEFAULT 'alice', stamp TEXT,
        secret TEXT DEFAULT 'hidden'
      ); CREATE TABLE ${schema}.children (id INTEGER PRIMARY KEY, record_id INTEGER REFERENCES ${table}(id));`);
      instance = await prostgles({
        dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 },
        transactions: true,
        joins: "inferred",
        auth: { getUser: () => undefined, findUser: () => ({ id: "alice", type: "user" }) },
        publish: () => ({
          [`${schema}.children`]: "*",
          [table]: {
            insert: {
              fields: "*",
              returningFields: "*",
              forcedData: { stamp: "inserted" },
              checkFilter: { value: { $ne: "insert-invalid" } },
            },
            update: updateRule,
          },
        }),
        tableHooks: {
          [table]: {
            beforeEach: [
              {
                commands: { insert: 1, update: 1 },
                validate: async ({ data, tx, command }) => {
                  beforeCommands.push(command);
                  if (!transformInsert) return;
                  return {
                    row: {
                      ...data,
                      id: data.id - 10,
                      value: (await tx.one("SELECT 'validated' AS value")).value,
                    },
                  };
                },
              },
            ],
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
                    assert(inputs.every((row) => Object.hasOwn(row, "id")));
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
        await db.none(`TRUNCATE ${table} CASCADE; INSERT INTO ${table} (id, value, owner) VALUES
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
          assert.deepEqual(beforeCommands, Array(4).fill("insertOnConflictDoUpdate"));
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
      await t.test("beforeEach transforms the conflict keys and update values", async () => {
        await seed();
        transformInsert = true;
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
        assert.deepEqual(beforeCommands, ["insertOnConflictDoUpdate", "insertOnConflictDoUpdate"]);
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
      await t.test("joined ownership filters remain native upsert conditions", async () => {
        await seed();
        await db.none(`INSERT INTO ${schema}.children VALUES (10, 1)`);
        const ownership = { $existsJoined: { [`${schema}.children`]: { id: 10 } } };
        updateRule!.forcedFilter = ownership;
        updateRule!.checkFilter = ownership;
        const handler = await client();
        const updated = await handler.insert!(
          { id: 1, value: "allowed" },
          { onConflict: "DoUpdate", returning: ["id", "value"] },
        );
        assert.deepEqual(updated, { id: 1, value: "allowed" });
        events.length = 0;
        assert.equal(
          await handler.insert!({ id: 3, value: "blocked" }, { onConflict: "DoUpdate" }),
          undefined,
        );
        assert.deepEqual(events, []);
        assert.equal((await db.one(`SELECT value FROM ${table} WHERE id = 3`)).value, "old");
      });
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
      await t.test("changedFields ignores same-value assignments", async () => {
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
          [],
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
            (await client()).insert!({ id: 99, secret: "new" }, { onConflict: "DoUpdate" }),
          );
          assert.equal(
            (await db.one(`SELECT count(*)::int AS count FROM ${table} WHERE id = 99`)).count,
            0,
          );
          await assert.rejects(
            (await client()).insert!(
              { id: 1, value: "bad" },
              { onConflict: "DoUpdate", returning: ["secret"] },
            ),
          );
          updateRule!.filterFields = [];
          await assert.rejects(
            (await client()).insert!({ id: 99, value: "new" }, { onConflict: "DoUpdate" }),
            { message: /update.filterFields/ },
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
        "postValidate sees stored conflict updates; dynamic fields are rejected upfront",
        async () => {
          await seed();
          updateRule!.postValidate = async ({ row, dbx, command }) => {
            assert.equal(command, "update");
            assert.equal(row.value, "input");
            assert.equal((await dbx[table]!.findOne({ id: row.id })).value, "input");
          };
          const result = await (
            await client()
          ).insert!({ id: 1, value: "input" }, { onConflict: "DoUpdate", returning: ["value"] });
          assert.deepEqual(result, { value: "input" });
          updateRule!.dynamicFields = [{ filter: { id: 1 }, fields: ["value", "stamp"] }];
          for (const id of [1, 99]) {
            await assert.rejects(
              (await client()).insert!({ id, value: "blocked" }, { onConflict: "DoUpdate" }),
              { message: /update.dynamicFields/ },
            );
          }
          assert.equal(
            (await db.one(`SELECT count(*)::int AS count FROM ${table} WHERE id = 99`)).count,
            0,
          );
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
      await t.test("ordinary inserts, updates and DoNothing keep their commands", async () => {
        await seed();
        await instance!.update({
          tableHooks: {
            [table]: {
              beforeEach: [
                {
                  commands: { insert: 1, update: 1 },
                  validate: ({ command }) => {
                    beforeCommands.push(command);
                  },
                },
              ],
            },
          },
        });
        const handler = instance!.db[table]!;
        await handler.insert!({ id: 4, value: "insert" });
        await handler.update!({ id: 4 }, { value: "update" });
        await handler.insert!({ id: 4, value: "ignored" }, { onConflict: "DoNothing" });
        assert.deepEqual(beforeCommands, ["insert", "update", "insert"]);
      });
      for (const target of ["insert", "update", "both"] as const) {
        await t.test(
          `before-only hooks targeted at ${target} enforce conflict outcomes`,
          async () => {
            await seed();
            const callbacks: string[] = [];
            await instance!.update({
              tableHooks: {
                [table]: {
                  beforeEach: [
                    {
                      commands: target === "both" ? { insert: 1, update: 1 } : { [target]: 1 },
                      changedFields: ["value"],
                      validate: ({ command, data, onCommit, onRollback }) => {
                        beforeCommands.push(command);
                        onCommit(() => {
                          callbacks.push("commit");
                        });
                        onRollback(() => {
                          callbacks.push("rollback");
                        });
                        return { row: { ...data, value: `${data.value}!` } };
                      },
                    },
                  ],
                },
              },
            });
            const handler = instance!.db[table]!;
            const fresh = handler.insert!({ id: 4, value: "new" }, { onConflict: "DoUpdate" });
            if (target === "both") await fresh;
            else await assert.rejects(fresh, { message: /beforeEach hooks to target both/ });
            assert.deepEqual(beforeCommands, target === "both" ? ["insertOnConflictDoUpdate"] : []);
            beforeCommands.length = 0;
            callbacks.length = 0;
            const batch = handler.insert!(
              [
                { id: 5, value: "new" },
                { id: 1, value: "changed" },
              ],
              { onConflict: "DoUpdate" },
            );
            if (target === "both") {
              await batch;
              assert.equal(
                (await db.one(`SELECT value FROM ${table} WHERE id = 1`)).value,
                "changed!",
              );
              assert.deepEqual(beforeCommands, [
                "insertOnConflictDoUpdate",
                "insertOnConflictDoUpdate",
              ]);
              assert.deepEqual(callbacks, ["commit", "commit"]);
            } else {
              await assert.rejects(batch, (error: { message: string }) => {
                assert.match(error.message, /beforeEach hooks to target both/);
                return true;
              });
              assert.equal((await db.one(`SELECT value FROM ${table} WHERE id = 1`)).value, "old");
              assert.equal(
                (await db.one(`SELECT count(*)::int AS count FROM ${table} WHERE id = 5`)).count,
                0,
              );
              assert.deepEqual(callbacks, []);
            }
            if (target !== "both") {
              await instance!.db.tx(async (tx) => {
                await tx[table]!.insert!({ id: 6, value: "new" });
                await assert.rejects(
                  tx[table]!.insert!({ id: 1, value: "caught" }, { onConflict: "DoUpdate" }),
                );
              });
              assert.equal(
                (await db.one(`SELECT count(*)::int AS count FROM ${table} WHERE id = 6`)).count,
                1,
              );
            }
            beforeCommands.length = 0;
            const nested = handler.insert!(
              {
                id: 1,
                value: "nested",
                [`${schema}.children`]: [{ id: 1 }],
              },
              { onConflict: "DoUpdate" },
            );
            if (target === "both") {
              await nested;
              assert.deepEqual(beforeCommands, ["insertOnConflictDoUpdate"]);
              assert.equal(
                (await db.one(`SELECT value FROM ${table} WHERE id = 1`)).value,
                "nested!",
              );
              assert.equal(
                (await db.one(`SELECT record_id FROM ${schema}.children WHERE id = 1`)).record_id,
                1,
              );
            } else {
              await assert.rejects(nested, { message: /beforeEach hooks to target both/ });
              assert.equal(
                (await db.one(`SELECT count(*)::int AS count FROM ${schema}.children`)).count,
                0,
              );
            }
            // A hook whose watched fields are absent does not restrict the conflict outcome.
            await handler.insert!({ id: 1, stamp: "unwatched" }, { onConflict: "DoUpdate" });
            assert.equal(
              (await db.one(`SELECT stamp FROM ${table} WHERE id = 1`)).stamp,
              "unwatched",
            );
          },
        );
      }
    } finally {
      await instance?.destroy();
      await db.none(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
  await test("conflict updates normalize forcedData like ordinary updates", async () => {
    const schema = `conflict_normalized_${randomUUID().replaceAll("-", "")}`;
    let instance: InitResult | undefined;
    await db.none(`CREATE SCHEMA ${schema}`);
    try {
      instance = await prostgles({
        dbConnection: {
          ...getConnectionDetails(db),
          options: `-c search_path=${schema},public`,
        } as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 },
        tableConfig: {
          records: {
            columns: {
              id: "INTEGER PRIMARY KEY",
              value: { isText: true, trimmed: true, lowerCased: true },
            },
          },
        },
        onReady: () => {},
      });
      const handler = instance.db.records as TableHandler;
      await handler.insert([
        { id: 1, value: "old" },
        { id: 2, value: "old" },
      ]);
      const rules = {
        insert: { fields: "*" as const, returningFields: "*" as const },
        update: {
          fields: "*" as const,
          filterFields: "*" as const,
          returningFields: "*" as const,
          forcedData: { value: "  NORMALIZED  " },
        },
      };
      const updated = await handler.update(
        { id: 1 },
        { value: "input" },
        { returning: ["value"], multi: false },
        rules,
        {},
      );
      const upserted = await handler.insert(
        { id: 2, value: "input" },
        { onConflict: "DoUpdate", returning: ["value"] },
        undefined,
        rules,
        {},
      );
      assert.deepEqual(updated, { value: "normalized" });
      assert.deepEqual(upserted, updated);
    } finally {
      await instance?.destroy();
      await db.none(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
};

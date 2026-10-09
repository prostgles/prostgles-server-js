import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { asName, type AnyObject } from "prostgles-types";
import prostgles, {
  type InitResult,
  type ProstglesInitOptions,
  type TableHooks,
} from "prostgles-server";
import type { DB, DBHandlerServer } from "prostgles-server/dist/Prostgles";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";

export const testTableHookRecursion = async (db: DB) => {
  await test(
    "after-hook recursion protection is opt-in and per hook",
    { timeout: 30_000 },
    async (t) => {
      const schema = `hook_recursion_${randomUUID().replaceAll("-", "")}`;
      const table = `${schema}.records`;
      const otherTable = `${schema}.other_records`;
      const tableHooks: TableHooks = { [table]: {}, [otherTable]: {} };
      const setHooks = async (hooks: TableHooks) => {
        for (const name of [table, otherTable]) {
          Object.assign(
            tableHooks[name]!,
            {
              afterEach: undefined,
              afterAll: undefined,
              afterCommit: undefined,
            },
            hooks[name],
          );
        }
        await instance!.update({ tableHooks }, true);
      };
      let instance: InitResult | undefined;
      try {
        await db.none(`CREATE SCHEMA ${schema};
        CREATE TABLE ${table} (id INTEGER, value INTEGER, payload JSONB, amount BIGINT DEFAULT 9007199254740992, location GEOMETRY(Point, 4326) DEFAULT ST_GeomFromText('POINT(1 2)', 4326));
        CREATE TABLE ${otherTable} (id INTEGER, value INTEGER);
        INSERT INTO ${table} (id, value) VALUES (1, 0), (2, 0), (3, 0);
        INSERT INTO ${otherTable} VALUES (2, 0);`);
        instance = await prostgles({
          dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
          schemaFilter: { [schema]: 1 },
          transactions: true,
          tableHooks,
          onReady: () => {},
        });
        const dbo = instance.db as DBHandlerServer;

        for (const phase of ["afterEach", "afterAll", "afterCommit"] as const) {
          for (const preventRecursion of [undefined, false, true]) {
            await t.test(`${phase}: preventRecursion=${preventRecursion}`, async () => {
              const calls: number[] = [];
              const siblings: number[] = [];
              const mutate = async (row: AnyObject, dbx: DBHandlerServer) => {
                calls.push(row.value);
                if (row.value < 2) {
                  await dbx[table]!.update({ id: row.id }, { value: row.value + 1 });
                }
              };
              const commands = { insert: 1, update: 1 } as const;
              const hooks: TableHooks = {
                [table]:
                  phase === "afterEach" ?
                    {
                      afterEach: [
                        {
                          commands,
                          preventRecursion,
                          validate: ({ row, dbx }) => mutate(row, dbx),
                        },
                        {
                          commands,
                          preventRecursion: true,
                          validate: ({ row }) => {
                            siblings.push(row.value);
                          },
                        },
                      ],
                    }
                  : phase === "afterAll" ?
                    {
                      afterAll: [
                        {
                          commands,
                          preventRecursion,
                          validate: ({ rows, dbx }) => mutate(rows[0]!, dbx),
                        },
                        {
                          commands,
                          preventRecursion: true,
                          validate: ({ rows }) => {
                            siblings.push(rows[0]!.value);
                            return Promise.resolve();
                          },
                        },
                      ],
                    }
                  : {
                      afterCommit: [
                        {
                          commands,
                          preventRecursion,
                          run: ({ rows, dbo }) => mutate(rows[0]!, dbo),
                        },
                        {
                          commands,
                          preventRecursion: true,
                          run: ({ rows }) => {
                            siblings.push(rows[0]!.value);
                          },
                        },
                      ],
                    },
              };
              await setHooks(hooks);
              await dbo[table]!.update({ id: 1 }, { value: 0 });
              assert.deepEqual(calls, preventRecursion ? [0] : [0, 1, 2]);
              assert.deepEqual(siblings, preventRecursion ? [1, 0] : [2, 1, 0]);
              assert.equal((await dbo[table]!.findOne({ id: 1 }))!.value, preventRecursion ? 1 : 2);

              // The same hook is guarded across commands, but can run again on a later mutation.
              calls.length = 0;
              siblings.length = 0;
              await db.none(`DELETE FROM ${table} WHERE id = 1`);
              await dbo[table]!.insert({ id: 1, value: 0 });
              assert.deepEqual(calls, preventRecursion ? [0] : [0, 1, 2]);
              assert.deepEqual(siblings, preventRecursion ? [1, 0] : [2, 1, 0]);
            });
          }
        }

        await t.test(
          "indirect recursion skips only the original hook and preserves postValidate",
          async () => {
            const calls: number[] = [];
            const siblings: number[] = [];
            const validated: number[] = [];
            let reject = false;
            const hook: NonNullable<TableHooks[string]["afterEach"]>[number] = {
              commands: { update: 1 } as const,
              preventRecursion: true,
              validate: async ({ row, dbx }) => {
                calls.push(row.id);
                if (row.id === 1) await dbx[otherTable]!.update({ id: 2 }, { value: 1 });
                if (row.id === 2) {
                  await (dbx[table] as TableHandler).update(
                    { id: 3 },
                    { value: 2 },
                    undefined,
                    {
                      update: {
                        fields: "*",
                        filterFields: "*",
                        returningFields: "*",
                        postValidate: ({ row }) => {
                          validated.push(row.id);
                          if (reject) throw new Error("Nested validation rejected");
                        },
                      },
                    },
                    {},
                  );
                }
              },
            };
            await setHooks({
              [table]: {
                afterEach: [
                  hook,
                  {
                    commands: { update: 1 },
                    validate: ({ row }) => {
                      siblings.push(row.id);
                    },
                  },
                ],
              },
              [otherTable]: { afterEach: [hook] },
            });
            await dbo[table]!.update({ id: 1 }, { value: 0 });
            assert.deepEqual(calls, [1, 2]);
            assert.deepEqual(siblings, [3, 1]);
            assert.deepEqual(validated, [3]);
            reject = true;
            await assert.rejects(dbo[table]!.update({ id: 1 }, { value: 9 }), (error: unknown) =>
              JSON.stringify(error).includes("Nested validation rejected"),
            );
            assert.deepEqual(validated, [3, 3]);
            assert.equal((await dbo[table]!.findOne({ id: 1 }))!.value, 0);
          },
        );

        await t.test(
          "parallel and sequential writes in one transaction are independent",
          async () => {
            const calls: number[] = [];
            let entered!: () => void;
            let release!: () => void;
            const started = new Promise<void>((resolve) => {
              entered = resolve;
            });
            const proceed = new Promise<void>((resolve) => {
              release = resolve;
            });
            await setHooks({
              [table]: {
                afterEach: [
                  {
                    commands: { update: 1 },
                    preventRecursion: true,
                    validate: async ({ row }) => {
                      calls.push(row.id);
                      if (row.id === 1) {
                        entered();
                        await proceed;
                      }
                    },
                  },
                ],
              },
            });
            await dbo.tx!(async (dbx) => {
              const first = dbx[table]!.update({ id: 1 }, { value: 1 });
              await started;
              try {
                await dbx[table]!.update({ id: 2 }, { value: 1 });
                assert.deepEqual(calls, [1, 2]);
              } finally {
                release();
                await first;
              }
              await dbx[table]!.update({ id: 1 }, { value: 2 });
              assert.deepEqual(calls, [1, 2, 1]);
            });
          },
        );
        await t.test(
          "actual changed fields work without keys and preserve bigint precision",
          async () => {
            const each: AnyObject[] = [];
            const all: AnyObject[][] = [];
            const committed: AnyObject[][] = [];
            await setHooks({
              [table]: {
                afterEach: [
                  {
                    commands: { insert: 1, update: 1, delete: 1 },
                    changedFields: ["amount"],
                    validate: ({ row }) => {
                      each.push(row);
                    },
                  },
                ],
                afterAll: [
                  {
                    commands: { update: 1 },
                    changedFields: ["amount"],
                    validate: ({ rows }) => {
                      all.push(rows);
                      return Promise.resolve();
                    },
                  },
                ],
                afterCommit: [
                  {
                    commands: { update: 1 },
                    changedFields: ["amount"],
                    run: ({ rows }) => {
                      committed.push(rows);
                    },
                  },
                ],
              },
            });
            await dbo[table]!.update({ id: 1 }, { amount: "9007199254740992" });
            assert.equal(each.length, 0);
            await dbo[table]!.update({ id: 1 }, { id: 101, amount: "9007199254740993" });
            assert.equal(each.length, 1);
            assert.equal(each[0]!.id, 101);
            assert.equal(each[0]!.amount, "9007199254740993");
            assert.equal(
              each[0]!.location,
              (await db.one(`SELECT location FROM ${table} WHERE id = 101`)).location,
            );
            assert.deepEqual(all, [each]);
            assert.deepEqual(committed, [each]);
            each.length = 0;
            all.length = 0;
            committed.length = 0;
            await dbo[table]!.update({}, { amount: "9007199254740993" });
            assert.deepEqual(each.map((row) => row.id).sort(), [2, 3]);
            assert.equal(all[0]!.length, 2);
            assert.equal(committed[0]!.length, 2);
            each.length = 0;
            await dbo[table]!.delete({ id: 101 });
            assert.equal(each[0]!.amount, "9007199254740993");
            assert.equal(each[0]!.id, 101);
          },
        );

        await t.test("database BEFORE triggers contribute actual changed fields", async () => {
          const changed: string[] = [];
          const jsonChanges: number[] = [];
          await setHooks({
            [table]: {
              afterEach: [
                {
                  commands: { update: 1 },
                  changedFields: ["amount"],
                  validate: ({ row }) => {
                    changed.push(row.amount);
                  },
                },
                {
                  commands: { update: 1 },
                  changedFields: ["payload"],
                  validate: ({ row }) => {
                    jsonChanges.push(row.id);
                  },
                },
              ],
            },
          });
          await db.none(`CREATE FUNCTION ${schema}.change_amount() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN NEW.amount := OLD.amount + 1; NEW.payload := 'null'::jsonb; RETURN NEW; END $$;
            CREATE TRIGGER change_amount BEFORE UPDATE ON ${table}
            FOR EACH ROW EXECUTE FUNCTION ${schema}.change_amount();`);
          await dbo[table]!.update({ id: 2 }, { value: 17 });
          assert.deepEqual(changed, ["9007199254740994"]);
          assert.deepEqual(jsonChanges, [2]);
          await dbo[table]!.update({ id: 2 }, { value: 17 });
          assert.deepEqual(jsonChanges, [2]);
          await db.none(`DROP TRIGGER change_amount ON ${table}`);
        });

        await t.test(
          "empty writes, rollback, raw SQL and trigger writes keep their boundaries",
          async () => {
            const rows: AnyObject[] = [];
            const batches: number[] = [];
            await setHooks({
              [table]: {
                afterEach: [
                  {
                    commands: { insert: 1, update: 1 },
                    validate: ({ row }) => {
                      rows.push(row);
                    },
                  },
                ],
                afterAll: [
                  {
                    commands: { update: 1 },
                    validate: ({ rows }) => {
                      batches.push(rows.length);
                      return Promise.resolve();
                    },
                  },
                ],
              },
            });
            await dbo[table]!.update({ id: -1 }, { value: 0 });
            assert.deepEqual(batches, [0]);
            await db.none(`CREATE FUNCTION ${schema}.extra_update() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN UPDATE ${table} SET value = NEW.value + 1 WHERE id = NEW.id; RETURN NULL; END $$;
            CREATE TRIGGER extra_update AFTER INSERT ON ${table}
            FOR EACH ROW EXECUTE FUNCTION ${schema}.extra_update();`);
            await dbo[table]!.insert({ id: 200, value: 1 });
            assert.deepEqual(
              rows.map((row) => row.value),
              [1],
            );
            assert.equal((await dbo[table]!.findOne({ id: 200 }))!.value, 2);
            await db.none(`UPDATE ${table} SET value = 3 WHERE id = 200`);
            assert.equal(rows.length, 1);
            await assert.rejects(
              dbo.tx!(async (dbx) => {
                await dbx[table]!.update({ id: 200 }, { value: 4 });
                throw new Error("Rollback capture");
              }),
              { message: "Rollback capture" },
            );
            rows.length = 0;
            await dbo[table]!.update({ id: 200 }, { value: 5 });
            assert.deepEqual(
              rows.map((row) => row.value),
              [5],
            );
          },
        );
        await t.test(
          "delete row/value return types reject multiple rows and roll back",
          async () => {
            const captured: number[] = [];
            await setHooks({
              [otherTable]: {
                afterEach: [
                  {
                    commands: { delete: 1 },
                    validate: ({ row }) => {
                      captured.push(row.id);
                    },
                  },
                ],
              },
            });
            await db.none(`INSERT INTO ${otherTable} VALUES (901, 0), (902, 0)`);
            for (const returnType of ["row", "value"] as const) {
              await assert.rejects(
                dbo[otherTable]!.delete(
                  { id: { $in: [901, 902] } },
                  { returning: "*", returnType },
                ),
                { message: "More than 1 row deleted: 2 rows affected" },
              );
              assert.equal(await dbo[otherTable]!.count({ id: { $in: [901, 902] } }), 2);
              assert.deepEqual(captured, []);
            }
            const deleted = await dbo[otherTable]!.delete(
              { id: 901 },
              { returning: "*", returnType: "row" },
            );
            assert.equal(deleted.id, 901);
            assert.deepEqual(await dbo[otherTable]!.delete({ id: 902 }), []);
            assert.deepEqual(captured, [901, 902]);
          },
        );

        await t.test("table config repairs disabled and modified capture triggers", async () => {
          const captured: number[] = [];
          await setHooks({
            [otherTable]: {
              afterEach: [
                {
                  commands: { delete: 1 },
                  validate: ({ row }) => {
                    captured.push(row.id);
                  },
                },
              ],
            },
          });
          const trigger = await db.one<{ name: string; function_name: string }>(
            `
            SELECT tgname AS name, tgfoid::regproc::text AS function_name FROM pg_trigger
            WHERE tgrelid = $1::regclass AND tgname LIKE 'prostgles_capture_%' AND (tgtype & 8) = 8`,
            [otherTable],
          );
          await db.none(`INSERT INTO ${otherTable} VALUES (903, 0), (904, 0);
            ALTER TABLE ${otherTable} DISABLE TRIGGER ${asName(trigger.name)}`);
          await instance!.update({ tableHooks }, true);
          await dbo[otherTable]!.delete({ id: 903 });
          await db.none(`CREATE OR REPLACE FUNCTION ${trigger.function_name}() RETURNS trigger
            LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
          await instance!.update({ tableHooks }, true);
          await dbo[otherTable]!.delete({ id: 904 });
          assert.deepEqual(captured, [903, 904]);
        });

        await t.test(
          "fresh tables install capture only for after hooks or upsert checks",
          async () => {
            const checkedRules = {
              insert: { fields: "*", checkFilter: { value: { $gt: 0 } } },
              update: { fields: "*", filterFields: "*", checkFilter: { value: { $gt: 0 } } },
            } as const;
            const cases: {
              name: string;
              hooks: TableHooks[string] | undefined;
              publish: (tableName: string) => ProstglesInitOptions["publish"];
              expectedCapture: boolean;
            }[] = [
              { name: "empty hooks", hooks: {}, publish: () => undefined, expectedCapture: false },
              {
                name: "before hooks",
                expectedCapture: false,
                publish: () => undefined,
                hooks: { beforeEach: [{ commands: { insert: 1, update: 1 }, validate: () => {} }] },
              },
              {
                name: "instead of delete suppresses delete after hooks",
                expectedCapture: false,
                publish: () => undefined,
                hooks: {
                  onInsteadOfDelete: () => Promise.resolve(undefined),
                  afterEach: [
                    {
                      commands: { delete: 1 },
                      validate: () => {
                        throw new Error("Unexpected delete hook");
                      },
                    },
                  ],
                },
              },
              {
                name: "empty and inactive after hooks",
                expectedCapture: false,
                publish: () => undefined,
                hooks: {
                  afterEach: [],
                  afterAll: [{ commands: {}, validate: () => Promise.resolve() }],
                  afterCommit: [],
                },
              },
              {
                name: "afterEach",
                expectedCapture: true,
                publish: () => undefined,
                hooks: { afterEach: [{ commands: { insert: 1 }, validate: () => {} }] },
              },
              {
                name: "afterAll",
                expectedCapture: true,
                publish: () => undefined,
                hooks: {
                  afterAll: [{ commands: { delete: 1 }, validate: () => Promise.resolve() }],
                },
              },
              {
                name: "afterCommit",
                expectedCapture: true,
                publish: () => undefined,
                hooks: { afterCommit: [{ commands: { update: 1 }, run: () => {} }] },
              },
              {
                name: "unrestricted publish",
                hooks: undefined,
                publish: () => "*",
                expectedCapture: false,
              },
              {
                name: "all-tables publish tuple",
                hooks: undefined,
                expectedCapture: false,
                publish: () => ["*", { select: true, insert: true, update: true }],
              },
              {
                name: "read-only and unpublished tables",
                hooks: undefined,
                expectedCapture: false,
                publish: (tableName) => ({
                  [tableName]: { select: { fields: "*" } },
                  [table]: checkedRules,
                }),
              },
              {
                name: "insert-only checks",
                hooks: undefined,
                expectedCapture: false,
                publish: (tableName) => ({ [tableName]: { insert: checkedRules.insert } }),
              },
              {
                name: "update-only validation",
                hooks: undefined,
                expectedCapture: false,
                publish: (tableName) => ({
                  [tableName]: {
                    update: {
                      ...checkedRules.update,
                      postValidate: ({ row }) => {
                        assert(row.value > 0);
                      },
                    },
                  },
                }),
              },
              {
                name: "upsert checkFilter",
                hooks: undefined,
                expectedCapture: true,
                publish: (tableName) => ({ [tableName]: checkedRules }),
              },
              {
                name: "upsert postValidate",
                hooks: undefined,
                expectedCapture: true,
                publish: (tableName) => ({
                  [tableName]: {
                    insert: {
                      fields: "*",
                      postValidate: ({ row }) => {
                        assert(row.value > 0);
                      },
                    },
                    update: { fields: "*", filterFields: "*" },
                  },
                }),
              },
              {
                name: "read-only publish profiles",
                hooks: undefined,
                expectedCapture: false,
                publish: (tableName) => [
                  { userTypes: ["writer"], publish: { [tableName]: { select: "*" } } },
                ],
              },
              {
                name: "checked publish profiles",
                hooks: undefined,
                expectedCapture: true,
                publish: (tableName) => [
                  { userTypes: ["reader"], publish: "*" },
                  { userTypes: ["writer"], publish: { [tableName]: checkedRules } },
                ],
              },
              {
                name: "request-dependent publish",
                hooks: undefined,
                expectedCapture: true,
                publish: () => () => "*",
              },
            ];
            for (const [index, { name, hooks, publish, expectedCapture }] of cases.entries()) {
              const tableName = `${schema}.capture_requirements_${index}`;
              await db.none(`CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, value INTEGER)`);
              const configuredPublish = publish(tableName);
              const configured = await prostgles({
                dbConnection: getConnectionDetails(
                  db,
                ) as unknown as ProstglesInitOptions["dbConnection"],
                schemaFilter: { [schema]: 1 },
                tableHooks: hooks && { [tableName]: hooks },
                publish: configuredPublish,
                auth:
                  configuredPublish ?
                    { getUser: () => undefined, findUser: () => ({ id: "writer", type: "writer" }) }
                  : undefined,
                onReady: () => {},
              });
              try {
                const { count } = await db.one<{ count: number }>(
                  `SELECT count(*)::int FROM pg_trigger
                  WHERE tgrelid = $1::regclass AND tgname LIKE 'prostgles_capture_%'`,
                  [tableName],
                );
                assert.equal(count, expectedCapture ? 4 : 0, name);
                await configured.db[tableName]!.insert!({ id: 0, value: 1 });
                await configured.db[tableName]!.update!({ id: 0 }, { value: 1 });
                const clientTable =
                  configuredPublish ?
                    (await configured.getClientDBHandlers({ userId: "writer" }, undefined))
                      .clientDb[tableName]
                  : undefined;
                if (clientTable?.insert && clientTable.update) {
                  await Promise.all(
                    [1, 2].map(async (id) => {
                      const params = {
                        onConflict: { action: "DoUpdate" as const, conflictColumns: ["id"] },
                      };
                      await clientTable.insert!({ id, value: 1 }, params);
                      await clientTable.insert!({ id, value: 2 }, params);
                    }),
                  );
                } else if (clientTable?.insert) {
                  await clientTable.insert({ id: 1, value: 1 });
                } else if (clientTable?.update) {
                  await clientTable.update({ id: 0 }, { value: 1 });
                }
                await configured.db[tableName]!.delete!({ id: 0 });
              } finally {
                await configured.destroy();
              }
            }
          },
        );

        await t.test(
          "read-only publishing does not require capture trigger privileges",
          async () => {
            const readOnlyTable = `${schema}.read_only_records`;
            const readerRole = `hook_reader_${randomUUID().replaceAll("-", "")}`;
            let reader: InitResult | undefined;
            try {
              await db.none(`CREATE TABLE ${readOnlyTable} (id INTEGER PRIMARY KEY);
              INSERT INTO ${readOnlyTable} VALUES (1);
              CREATE ROLE ${readerRole} LOGIN PASSWORD 'read_only';
              GRANT USAGE ON SCHEMA ${schema} TO ${readerRole};
              GRANT SELECT ON ${readOnlyTable} TO ${readerRole};`);
              reader = await prostgles({
                dbConnection: {
                  ...getConnectionDetails(db),
                  user: readerRole,
                  password: "read_only",
                } as unknown as ProstglesInitOptions["dbConnection"],
                schemaFilter: { [schema]: 1 },
                auth: {
                  getUser: () => undefined,
                  findUser: () => ({ id: "reader", type: "user" }),
                },
                publish: { [readOnlyTable]: { select: { fields: "*" } } },
                onReady: () => {},
              });
              const { clientDb } = await reader.getClientDBHandlers(
                { userId: "reader" },
                undefined,
              );
              assert.deepEqual(await clientDb[readOnlyTable]!.find!({}), [{ id: 1 }]);
              await reader.update({ publish: () => ({ [readOnlyTable]: "*" }) });
              const { count } = await db.one<{ count: number }>(
                `SELECT count(*)::int FROM pg_trigger
                WHERE tgrelid = $1::regclass AND tgname LIKE 'prostgles_capture_%'`,
                [readOnlyTable],
              );
              assert.equal(count, 0);
            } finally {
              await reader?.destroy();
              await db.none(`DROP TABLE IF EXISTS ${readOnlyTable};
              DROP OWNED BY ${readerRole}; DROP ROLE ${readerRole};`);
            }
          },
        );

        await t.test("publish capture is configured before concurrent upserts", async () => {
          await setHooks({});
          await instance!.update({ tableHooks: undefined }, true);
          const validated: number[] = [];
          await (dbo[otherTable] as TableHandler).update(
            { id: 2 },
            { value: 1 },
            undefined,
            {
              update: {
                fields: "*",
                filterFields: "*",
                returningFields: "*",
                checkFilter: { value: 1 },
                postValidate: ({ row }) => {
                  validated.push(row.id);
                },
              },
            },
            {},
          );
          assert.deepEqual(validated, [2]);
          assert.equal(
            (
              await db.one<{ count: number }>(
                `SELECT count(*)::int FROM pg_trigger
            WHERE tgrelid = $1::regclass AND tgname LIKE 'prostgles_capture_%'`,
                [otherTable],
              )
            ).count,
            4,
          );
          await db.none(`ALTER TABLE ${otherTable} ADD PRIMARY KEY (id)`);
          await instance!.update({
            publish: {
              [otherTable]: {
                insert: { fields: "*", checkFilter: { value: 1 } },
                update: { fields: "*", filterFields: "*", checkFilter: { value: 1 } },
              },
            },
          });
          assert.equal(
            (
              await db.one<{ count: number }>(
                `SELECT count(*)::int FROM pg_trigger
            WHERE tgrelid = $1::regclass AND tgname LIKE 'prostgles_capture_%'`,
                [otherTable],
              )
            ).count,
            4,
          );
          const results = await Promise.allSettled(
            [905, 906].map((id) =>
              dbo.tx!(async (dbx) => {
                await (dbx[otherTable] as TableHandler).insert(
                  { id, value: 1 },
                  { onConflict: { action: "DoUpdate", conflictColumns: ["id"] } },
                  undefined,
                  {
                    insert: { fields: "*", returningFields: "*", checkFilter: { value: 1 } },
                    update: {
                      fields: "*",
                      filterFields: "*",
                      returningFields: "*",
                      checkFilter: { value: 1 },
                    },
                  },
                  {},
                );
                await new Promise((resolve) => setTimeout(resolve, 100));
              }),
            ),
          );
          assert.deepEqual(
            results.filter((result) => result.status === "rejected"),
            [],
          );
          assert.equal(await dbo[otherTable]!.count({ id: { $in: [905, 906] } }), 2);
          await instance!.update({ publish: undefined, tableHooks }, true);
        });

        await t.test("instances with different hooks share capture triggers", async () => {
          const captured: number[] = [];
          const otherCaptured: number[] = [];
          await instance!.update({
            tableHooks: {
              [table]: {
                afterEach: [
                  {
                    commands: { update: 1 },
                    validate: ({ row }) => {
                      captured.push(row.id);
                    },
                  },
                ],
              },
            },
          });
          const otherInstance = await prostgles({
            dbConnection: {
              ...getConnectionDetails(db),
              options: `-c search_path=${schema},public`,
            } as unknown as ProstglesInitOptions["dbConnection"],
            schemaFilter: { [schema]: 1 },
            tableHooks: {
              records: {
                afterEach: [
                  {
                    commands: { update: 1 },
                    validate: ({ row }) => {
                      otherCaptured.push(row.id);
                    },
                  },
                ],
              },
            },
            onReady: () => {},
          });
          try {
            await instance!.db.tx(async (dbx) => {
              await dbx[table]!.update!({ id: 3 }, { value: 7 });
            });
            assert.deepEqual(captured, [3]);
            await otherInstance.db.records!.update!({ id: 3 }, { value: 8 });
            assert.deepEqual(otherCaptured, [3]);
            assert.deepEqual(captured, [3]);
          } finally {
            await otherInstance.destroy();
          }
        });

        await t.test(
          "capture triggers share table config setup and survive hook removal",
          async () => {
            await setHooks({
              [table]: {
                afterEach: [
                  { commands: { update: 1 }, changedFields: ["amount"], validate: () => {} },
                ],
              },
            });
            await instance!.update(
              {
                tableHooks,
                tableConfig: {
                  [table]: {
                    triggers: {
                      application_insert: {
                        functionSchema: schema,
                        type: "after",
                        actions: ["insert"],
                        forEach: "row",
                        query: "BEGIN RETURN NULL; END;",
                      },
                    },
                  },
                },
              },
              true,
            );
            const getTriggers = () =>
              db.any<{ oid: number; name: string }>(
                "SELECT oid, tgname AS name FROM pg_trigger WHERE tgrelid = $1::regclass ORDER BY oid",
                [table],
              );
            const before = await getTriggers();
            assert.equal(
              before.filter(({ name }) => name.startsWith("prostgles_capture_")).length,
              4,
            );
            instance = await instance!.restart();
            assert.deepEqual(await getTriggers(), before);
            await instance.db[table]!.update!({ id: 2 }, { amount: "9007199254741999" });
            // Changing the requested fields does not replace triggers or lose application triggers.
            await setHooks({
              [table]: {
                afterEach: [{ commands: { update: 1 }, validate: () => {} }],
              },
            });
            await instance.db[table]!.update!({ id: 2 }, { value: 2 });
            assert.deepEqual(await getTriggers(), before);
            const updatedRows: number[] = [];
            await instance.update({
              tableHooks: {
                [table]: {
                  afterEach: [
                    {
                      commands: { update: 1 },
                      validate: ({ row }) => {
                        updatedRows.push(row.id);
                      },
                    },
                  ],
                },
              },
            });
            await instance.db[table]!.update!({ id: 3 }, { value: 3 });
            assert.deepEqual(updatedRows, [3]);
            await instance.update({ tableHooks: undefined }, true);
            assert.deepEqual(await getTriggers(), before);
            await instance.db[table]!.update!({ id: 3 }, { value: 4 });
            assert.deepEqual(updatedRows, [3]);
          },
        );
      } finally {
        await instance?.destroy();
        await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      }
    },
  );
};

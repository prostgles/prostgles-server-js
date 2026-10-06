import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { AnyObject } from "prostgles-types";
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
      const setHooks = (hooks: TableHooks) => {
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
      };
      let instance: InitResult | undefined;
      try {
        await db.none(`CREATE SCHEMA ${schema};
        CREATE TABLE ${table} (id INTEGER, value INTEGER);
        CREATE TABLE ${otherTable} (id INTEGER, value INTEGER);
        INSERT INTO ${table} VALUES (1, 0), (2, 0), (3, 0);
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
              setHooks(hooks);
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
            setHooks({
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
            setHooks({
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
      } finally {
        await instance?.destroy();
        await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      }
    },
  );
};

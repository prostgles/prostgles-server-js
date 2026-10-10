import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import pgPromise from "pg-promise";
import prostgles, { type ProstglesInitOptions } from "prostgles-server";
import { fetchSyncServerData } from "prostgles-server/dist/PubSubManager/SyncReplication/fetchSyncServerData";
import type { Subscription } from "prostgles-server/dist/PubSubManager/PubSubManager";
import type { DB, DBHandlerServerInternal } from "prostgles-server/dist/Prostgles";
import type { LocalParams } from "prostgles-server/dist/DboBuilder/DboBuilderTypes";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import type { withUserRLS as WithUserRLS } from "prostgles-server/dist/DboBuilder/dboBuilderUtils";
import type { ParsedTableRule } from "prostgles-server/dist/PublishParser/PublishParser";

export const testWithUserRLS = async (
  dbo: DBHandlerServerInternal,
  db: DB,
  withUserRLS: typeof WithUserRLS,
) => {
  const requestUser = {
    id: "00000000-0000-0000-0000-000000000002",
    type: "admin",
    tenant_id: 42,
  };
  const localParams: LocalParams = {
    isRemoteRequest: { user: requestUser, clientInfo: undefined },
  };
  const anonymousParams: LocalParams = {
    isRemoteRequest: { clientInfo: undefined },
  };
  const readUser = `SELECT prostgles.user()::jsonb AS "user"`;
  const assertUser = async (tx: Pick<pgPromise.ITask<{}>, "one">, user: object = requestUser) => {
    assert.deepEqual((await tx.one(readUser)).user, user);
  };

  await test("RLS context is isolated across implicit transactions, commit, rollback and pool reuse", async () => {
    const pgp = pgPromise();
    const pool = pgp({ ...db.$pool.options, password: db.$pool.options.password, max: 1 });
    try {
      const { pid } = await pool.one<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const assertReset = async () => {
        assert.deepEqual(await pool.one(`${readUser}, pg_backend_pid() AS pid`), {
          user: {},
          pid,
        });
      };
      assert.deepEqual(
        await pool.one(
          withUserRLS(
            localParams,
            `SELECT prostgles.user_id()::text AS id,
          prostgles.user_type() AS type, prostgles.user('tenant_id') AS tenant`,
          ),
        ),
        { id: requestUser.id, type: requestUser.type, tenant: "42" },
      );
      await assertReset();

      for (const rollback of [false, true]) {
        const abort = new Error("rollback RLS test");
        const transaction = pool.tx(async (tx) => {
          await tx.none(withUserRLS(localParams, ""));
          // Separate statements and local dbx-style calls must keep the transaction's user.
          await assertUser(tx);
          await tx.one(withUserRLS(undefined, "SELECT 1", true));
          await assertUser(tx);
          if (rollback) throw abort;
        });
        if (rollback) await assert.rejects(transaction, (error) => error === abort);
        else await transaction;
        await assertReset();
      }
      await assert.rejects(
        pool.tx(async (tx) => {
          await tx.none(withUserRLS(localParams, ""));
          await tx.one("SELECT 1 / 0");
        }),
        { code: "22012" },
      );
      await assertReset();

      const secondUser = {
        ...requestUser,
        id: "00000000-0000-0000-0000-000000000003",
      };
      await pool.tx(async (tx) => {
        await tx.none(
          withUserRLS({ isRemoteRequest: { user: secondUser, clientInfo: undefined } }, ""),
        );
        await assertUser(tx, secondUser);
        await tx.none(withUserRLS(anonymousParams, "", true));
        await assertUser(tx, {});
      });
      await assertReset();
    } finally {
      await pool.$pool.end();
    }
  });

  const table = dbo.rec!;
  await test("locking, subscription and sync reads isolate users with a real RLS policy", async () => {
    const manager = await table.dboBuilder.getPubSubManager();
    const rollback = new Error("rollback RLS fixture");
    await assert.rejects(
      db.tx(async (tx) => {
        // The suite connects as a superuser; use an unprivileged role to exercise RLS.
        const role = pgPromise.as.name(`rls_test_${process.pid}_${Date.now()}`);
        await tx.none(`
        CREATE ROLE ${role};
        GRANT USAGE ON SCHEMA public, prostgles TO ${role};
        GRANT SELECT, UPDATE ON rec TO ${role};
        INSERT INTO rec (id) VALUES (-42001), (-42002);
        ALTER TABLE rec ENABLE ROW LEVEL SECURITY;
        CREATE POLICY rls_test ON rec USING (id = prostgles.user('tenant_id')::integer);
        SET LOCAL ROLE ${role};
      `);
        for (const tenantId of [-42001, -42002, undefined]) {
          const params: LocalParams = {
            isRemoteRequest: {
              clientInfo: undefined,
              user: tenantId === undefined ? undefined : { ...requestUser, tenant_id: tenantId },
            },
            tx: { t: tx, dbTX: table.dboBuilder.dbo },
          };
          const expected = tenantId === undefined ? [] : [{ id: tenantId }];
          const table_rules = {
            select: { fields: "*", filterFields: "*", orderByFields: "*" },
          } as const;
          for (const forUpdate of [false, true]) {
            const selectParams = { select: ["id"], forUpdate };
            for (const command of ["find", "findOne"] as const) {
              await assert.rejects(
                () => table[command]({}, selectParams, undefined, undefined, params),
                (error: unknown) =>
                  JSON.stringify(error).includes(
                    "localParams isRemoteRequest and missing tableRule",
                  ),
              );
              assert.deepEqual(
                await table[command]({}, selectParams, undefined, table_rules, params),
                command === "find" ? expected : expected[0],
              );
            }
          }
          const result = await manager.getSubData({
            table_info: { name: "rec" },
            filter: {},
            selectParams: { select: ["id"] },
            onData: () => {},
            localParams: params,
            table_rules,
          } as unknown as Subscription);
          assert.deepEqual(result, { data: expected });
          assert.deepEqual(
            await fetchSyncServerData(
              {
                tableHandler: table,
                localParams: params,
                from_synced: undefined,
                offset: undefined,
              },
              {
                filter: {},
                id_fields: ["id"],
                synced_field: "id",
                batch_size: 10,
                params: { select: ["id"] },
                table_rules,
              },
            ),
            expected,
          );
        }
        throw rollback;
      }),
      (error) => error === rollback,
    );
  });

  await test("ordinary beforeEach hooks transform inputs before validation", async () => {
    await table.dboBuilder.getTX(async (dbx) => {
      const rec = dbx.rec as TableHandler;
      // Negative fixture IDs avoid collisions with generated positive IDs.
      const rows = {
        allowed: { id: -43001 },
        denied: { id: -43002 },
        transformed: { id: -43003 },
        stripped: { id: -43004 },
        statementOnly: { id: -43005 },
        missing: { id: -43999 },
      };
      await rec.insert([rows.allowed, rows.denied]);
      const calls: number[][] = [];
      const inputs: object[] = [];
      rec.hooks = {
        beforeEach: [
          {
            commands: { insert: 1, update: 1 },
            validate: async ({ data, command, filter, dbx }) => {
              inputs.push({ ...data });
              // Pre-validation hooks can consume fields that are not database columns.
              if ("parent" in data) {
                data.parent_id = data.parent;
                delete data.parent;
              }
              if (command === "update") {
                calls.push((await dbx.rec!.find(filter)).map((row) => row.id));
              } else {
                // Trusted hooks may add fields in place that clients cannot supply.
                data.parent_id = rows.allowed.id;
              }
              return { row: data };
            },
          },
        ],
      };
      const rules: ParsedTableRule = {
        insert: { fields: ["id"], returningFields: "*" },
        update: {
          fields: ["parent_id"],
          filterFields: "*",
          returningFields: "*",
          forcedFilter: rows.allowed,
        },
      };
      const inserted = await rec.insert(
        { ...rows.transformed, parent: rows.allowed.id },
        { returning: "*" },
        undefined,
        rules,
      );
      assert.equal(inserted.parent_id, rows.allowed.id);
      assert.deepEqual(inputs.at(-1), { ...rows.transformed, parent: rows.allowed.id });
      // Fields left by the hook still undergo the usual validation.
      await assert.rejects(() =>
        rec.insert({ ...rows.stripped, recf: null }, undefined, undefined, rules),
      );
      await assert.rejects(() => rec.update(rows.allowed, { recf: null }, undefined, rules));
      assert.equal(inputs.length, 3);
      calls.length = 0;
      assert.deepEqual(
        await rec.update(rows.denied, { parent: rows.allowed.id }, { returning: "*" }, rules),
        [],
      );
      assert.deepEqual(
        await rec.update(rows.missing, { parent: rows.allowed.id }, { returning: "*" }, rules),
        [],
      );
      await rec.update({}, { parent: rows.allowed.id }, undefined, rules);
      assert.deepEqual(calls, [[], [], [rows.allowed.id]]);
      assert.equal((await rec.findOne(rows.denied))!.parent_id, null);
      const stripped = await rec.insert(
        { ...rows.stripped, recf: null },
        { returning: "*", removeDisallowedFields: true },
        undefined,
        rules,
      );
      assert.equal(stripped.parent_id, rows.allowed.id);
      assert.deepEqual(inputs.at(-1), { ...rows.stripped, recf: null });
      const count = inputs.length;
      assert.equal(
        typeof (await rec.insert(
          { ...rows.statementOnly },
          { returnType: "statement" },
          undefined,
          rules,
        )),
        "string",
      );
      assert.equal(
        typeof (await rec.update(
          {},
          { parent: rows.allowed.id },
          { returnType: "statement" },
          rules,
        )),
        "string",
      );
      await rec.updateBatch([[{}, { parent: rows.denied.id }]], undefined, undefined, rules);
      assert.equal(inputs.length, count + 3);
      assert.equal((await rec.findOne(rows.allowed))!.parent_id, rows.denied.id);
      assert.equal(await rec.findOne(rows.statementOnly), undefined);
      await rec.delete({ id: { $in: Object.values(rows).map(({ id }) => id) } });
    });
  });

  await test("multi false is checked after beforeEach and rolls back the update", async () => {
    let calls = 0;
    const rows = [{ id: -43001 }, { id: -43002 }];
    const filter = { id: { $in: rows.map(({ id }) => id) } };
    await assert.rejects(
      table.dboBuilder.getTX(async (dbx) => {
        const rec = dbx.rec as TableHandler;
        await rec.insert(rows);
        rec.hooks = {
          beforeEach: [
            {
              commands: { update: 1 },
              validate: () => {
                calls++;
              },
            },
          ],
        };
        await rec.update(filter, { parent_id: rows[0]!.id }, { multi: false });
      }),
      (error: unknown) => JSON.stringify(error).includes("More than 1 row modified"),
    );
    assert.equal(calls, 1);
    assert.equal(await table.count(filter), 0);
  });

  await test("ordinary beforeEach hooks run before PostgreSQL UPDATE policy checks", async () => {
    const abort = new Error("rollback hook RLS fixture");
    await assert.rejects(
      table.dboBuilder.getTX(async (dbx, tx) => {
        const rec = dbx.rec as TableHandler;
        const row = { id: -43001 };
        await rec.insert(row);
        let calls = 0;
        rec.hooks = {
          beforeEach: [
            {
              commands: { update: 1 },
              validate: () => {
                calls++;
              },
            },
          ],
        };
        const role = pgPromise.as.name(`hook_rls_${process.pid}`);
        await tx.none(`
        CREATE ROLE ${role};
        GRANT USAGE ON SCHEMA public, prostgles TO ${role};
        -- Statement triggers still run when RLS prevents every row update.
        GRANT SELECT ON prostgles.v_triggers TO ${role};
        GRANT SELECT, UPDATE ON rec TO ${role};
        ALTER TABLE rec ENABLE ROW LEVEL SECURITY;
        CREATE POLICY hook_select ON rec FOR SELECT TO ${role} USING (true);
        CREATE POLICY hook_update ON rec FOR UPDATE TO ${role} USING (false);
        SET LOCAL ROLE ${role};
      `);
        assert.deepEqual(await rec.update(row, { parent_id: null }, { returning: "*" }), []);
        assert.equal(calls, 1);
        throw abort;
      }),
      (error) => error === abort,
    );
  });

  await test("before and after hooks preserve RLS across dbx and raw tx calls", async () => {
    await table.dboBuilder.getTX(async (dbx) => {
      const rec = dbx.rec as TableHandler;
      let beforeCalls = 0;
      let afterCalls = 0;
      rec.hooks = {
        beforeEach: [
          {
            commands: { insert: 1 },
            validate: async ({ tx, dbx }) => {
              await assertUser(tx);
              await dbx.rec!.find({});
              await assertUser(tx);
              beforeCalls++;
            },
          },
          {
            commands: { insert: 1 },
            validate: async ({ tx }) => {
              await assertUser(tx);
              beforeCalls++;
            },
          },
        ],
        afterEach: [
          {
            commands: { insert: 1 },
            validate: async ({ tx, dbx }) => {
              await assertUser(tx);
              await dbx.rec!.count({});
              await assertUser(tx);
              afterCalls++;
            },
          },
        ],
      };
      const row = await rec.insert({}, { returning: "*" }, undefined, undefined, localParams);
      await rec.delete({ id: row.id });
      assert.equal(beforeCalls, 2);
      assert.equal(afterCalls, 1);
    });
  });

  await test(
    "post-transaction hooks receive committed and authenticated context",
    { timeout: 15_000 },
    async (t) => {
      const schemaName = `delete_context_${process.pid}_${Date.now()}`;
      const tableName = `${schemaName}.rec`;
      const schema = pgPromise.as.name(schemaName);
      const app = express();
      const http = createServer(app);
      let instance:
        | Pick<Awaited<ReturnType<typeof prostgles>>, "db" | "destroy" | "getClientDBHandlers">
        | undefined;
      const afterCommitResults: {
        ids: number[];
        committedRowCount: number;
        hasTransactionalHandlers: boolean;
        context: unknown;
      }[] = [];
      const updateHooks: string[] = [];
      app.use(express.json());

      try {
        await db.none(
          `CREATE SCHEMA ${schema}; CREATE TABLE ${schema}.rec (
            id INTEGER PRIMARY KEY,
            value TEXT,
            other TEXT
          )`,
        );
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");

        instance = await prostgles({
          dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
          schemaFilter: { [schemaName]: 1 },
          transactions: true,
          publish: "*",
          tableHooks: {
            [tableName]: {
              beforeEach: [
                {
                  commands: { update: 1 },
                  changedFields: ["value"],
                  validate: () => {
                    updateHooks.push("beforeEach");
                    return Promise.resolve();
                  },
                },
              ],
              afterEach: [
                {
                  commands: { update: 1 },
                  changedFields: ["value"],
                  validate: ({ row }) => {
                    updateHooks.push("afterEach");
                    if (row.value === "reject afterEach") throw new Error("afterEach rejection");
                    return Promise.resolve();
                  },
                },
              ],
              afterAll: [
                {
                  commands: { update: 1 },
                  changedFields: ["value"],
                  validate: ({ rows }) => {
                    updateHooks.push("afterAll");
                    if (rows.some((row) => row.value === "reject afterAll")) {
                      throw new Error("afterAll rejection");
                    }
                    return Promise.resolve();
                  },
                },
              ],
              afterCommit: [
                {
                  commands: { insert: 1, update: 1 },
                  changedFields: ["value"],
                  run: async (args) => {
                    // @ts-expect-error afterCommit does not expose the completed transaction.
                    args.tx;
                    // @ts-expect-error afterCommit does not expose transaction-bound handlers.
                    args.dbx;
                    const ids = args.rows.map(({ id }) => id as number);
                    const { clientDb } = await args.getClientDBHandlers(
                      { userId: requestUser.id },
                      { tables: { [tableName]: { select: true } } },
                    );
                    afterCommitResults.push({
                      ids,
                      committedRowCount: await clientDb[tableName]!.count!({
                        id: { $in: ids },
                      }),
                      hasTransactionalHandlers: "tx" in args || "dbx" in args,
                      context: args.context,
                    });
                  },
                },
              ],
              onInsteadOfDelete: async ({ tx, dbx }) => {
                const before = (await tx.one(readUser)).user;
                await (dbx[tableName] as TableHandler).find({});
                const after = (await tx.one(readUser)).user;
                return [{ before, after }];
              },
            },
          },
          auth: {
            sessionFields: "*",
            sidKeyName: "token",
            findUser: () => requestUser,
            getUser: (sid) =>
              sid === "authenticated" ?
                {
                  user: requestUser,
                  clientUser: { id: requestUser.id, type: requestUser.type },
                }
              : undefined,
          },
          restApi: { expressApp: app, path: "/rls-context" },
          createContext: () => ({ source: "afterCommit" }),
          onReady: () => {},
        });

        await t.test(
          "afterCommit runs after commit, filters changed fields and skips rollback",
          async () => {
            assert(instance);
            const committedIds = [-44001, -44002];
            await instance.db[tableName]!.insertMany!(
              committedIds.map((id) => ({ id, value: "initial" })),
            );
            assert.deepEqual(afterCommitResults, [
              {
                ids: committedIds,
                committedRowCount: committedIds.length,
                hasTransactionalHandlers: false,
                context: { source: "afterCommit" },
              },
            ]);
            await instance.db[tableName]!.update!({ id: committedIds[0] }, { other: "ignored" });
            assert.equal(afterCommitResults.length, 1);
            await instance.db[tableName]!.update!({ id: committedIds[0] }, { value: "updated" });
            assert.deepEqual(afterCommitResults[1], {
              ids: [committedIds[0]],
              committedRowCount: 1,
              hasTransactionalHandlers: false,
              context: { source: "afterCommit" },
            });

            const rollback = new Error("rollback afterCommit test");
            await assert.rejects(
              instance.db.tx(async (dbx) => {
                await dbx[tableName]!.insert!({ id: -44003, value: "rolled back" });
                throw rollback;
              }),
              (error) => error === rollback,
            );
            assert.equal(afterCommitResults.length, 2);
          },
        );

        await t.test("clearing a watched field runs before, after and commit hooks", async () => {
          assert(instance);
          const previousCalls = afterCommitResults.length;
          updateHooks.length = 0;
          await instance.db[tableName]!.update!({ id: -44001 }, { value: null });
          assert.deepEqual(updateHooks, ["beforeEach", "afterEach", "afterAll"]);
          assert.equal(afterCommitResults.length, previousCalls + 1);
          assert.deepEqual(afterCommitResults.at(-1)!.ids, [-44001]);
        });

        await t.test(
          "client updateBatch runs hooks atomically in implicit and explicit transactions",
          async () => {
            assert(instance);
            const handlers = await instance.getClientDBHandlers(
              { userId: requestUser.id },
              undefined,
            );
            await assert.rejects(
              handlers.clientDb[tableName]!.updateBatch!(
                [[{ id: -44002 }, { value: "reject afterEach" }]],
                // Untrusted options must not bypass hooks by resembling a SQL-only request.
                { returnType: "statement-invalid" as "statement" },
              ),
            );
            for (const explicitTransaction of [false, true]) {
              const firstValue = explicitTransaction ? "first explicit" : "first";
              const secondValue = explicitTransaction ? "second explicit" : "second";
              const previousCalls = afterCommitResults.length;
              updateHooks.length = 0;
              const runBatch = async (clientDb: typeof handlers.clientDb) => {
                const result = await clientDb[tableName]!.updateBatch!([
                  [{ id: -44001 }, { value: firstValue }],
                  [{ id: -44002 }, { value: secondValue }],
                ]);
                assert.equal(result, null);
                if (explicitTransaction) assert.equal(afterCommitResults.length, previousCalls);
              };
              if (explicitTransaction) await handlers.withClientDbTx(runBatch);
              else await runBatch(handlers.clientDb);
              assert.deepEqual(updateHooks, [
                "beforeEach",
                "afterEach",
                "afterAll",
                "beforeEach",
                "afterEach",
                "afterAll",
              ]);
              assert.deepEqual(
                afterCommitResults.slice(previousCalls).map(({ ids }) => ids),
                [[-44001], [-44002]],
              );

              for (const hook of ["afterEach", "afterAll"]) {
                const runRejectedBatch = (clientDb: typeof handlers.clientDb) =>
                  clientDb[tableName]!.updateBatch!([
                    [{ id: -44001 }, { value: "must roll back" }],
                    [{ id: -44002 }, { value: `reject ${hook}` }],
                  ]);
                await assert.rejects(
                  explicitTransaction ?
                    handlers.withClientDbTx(runRejectedBatch)
                  : runRejectedBatch(handlers.clientDb),
                );
                const rows: { id: number; value: string | null }[] = await instance.db[tableName]!.find!(
                  {},
                  {
                    select: ["id", "value"],
                    orderBy: "id",
                  },
                );
                assert.deepEqual(rows, [
                  { id: -44002, value: secondValue },
                  { id: -44001, value: firstValue },
                ]);
                assert.equal(afterCommitResults.length, previousCalls + 2);
              }
            }
          },
        );

        const url = `http://127.0.0.1:${address.port}/rls-context/db/${tableName}/delete`;
        const deleteRequest = async (sid?: string) => {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(sid && {
                Authorization: `Bearer ${Buffer.from(sid).toString("base64")}`,
              }),
            },
            body: JSON.stringify([{ id: -1 }]),
          });
          const result = await response.json();
          assert.equal(response.status, 200, JSON.stringify(result));
          return result;
        };

        assert.deepEqual(await deleteRequest("authenticated"), [
          { before: requestUser, after: requestUser },
        ]);
        assert.deepEqual(await deleteRequest("anonymous"), [{ before: {}, after: {} }]);
        await t.test("server-user requests preserve tenant_id from sessionFields", async () => {
          assert(instance);
          // findUser returns the same user as getUser, whose sessionFields includes tenant_id.
          const serverUser = await instance.getClientDBHandlers(
            { userId: requestUser.id },
            undefined,
          );
          const result = await serverUser.clientDb[tableName]!.delete!({ id: -1 });
          assert.deepEqual(
            result,
            [{ before: requestUser, after: requestUser }],
            "PostgreSQL hooks must receive tenant_id for both HTTP and server-user requests",
          );
        });
      } finally {
        await instance?.destroy();
        if (http.listening) {
          await new Promise<void>((resolve, reject) =>
            http.close((error) => (error ? reject(error) : resolve())),
          );
        }
        await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      }
    },
  );
};

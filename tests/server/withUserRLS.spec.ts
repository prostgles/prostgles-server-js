import { strict as assert } from "node:assert";
import { test } from "node:test";
import pgPromise from "pg-promise";
import { fetchSyncServerData } from "prostgles-server/dist/PubSubManager/SyncReplication/fetchSyncServerData";
import type { Subscription } from "../../dist/PubSubManager/PubSubManager";
import type { DB, DBHandlerServer } from "../../dist/Prostgles";
import type { LocalParams } from "../../dist/DboBuilder/DboBuilderTypes";
import type { TableHandler } from "../../dist/DboBuilder/TableHandler/TableHandler";
import type { withUserRLS as WithUserRLS } from "../../dist/DboBuilder/dboBuilderUtils";
import type { ParsedTableRule } from "../../dist/PublishParser/PublishParser";

export const testWithUserRLS = async (
  dbo: DBHandlerServer,
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
  const assertUser = async (
    tx: Pick<pgPromise.ITask<{}>, "one">,
    user: object = requestUser,
  ) => {
    assert.deepEqual((await tx.one(readUser)).user, user);
  };

  await test("RLS context is isolated across implicit transactions, commit, rollback and pool reuse", async () => {
    const pgp = pgPromise();
    const pool = pgp({ ...db.$pool.options, password: db.$pool.options.password, max: 1 });
    try {
      const { pid } = await pool.one("SELECT pg_backend_pid() AS pid");
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

  const table = dbo.rec as unknown as TableHandler;
  await test("subscription and sync reads isolate users with a real RLS policy", async () => {
    const manager = await table.dboBuilder.getPubSubManager();
    const rollback = new Error("rollback RLS fixture");
    await assert.rejects(
      db.tx(async (tx) => {
        // The suite connects as a superuser; use an unprivileged role to exercise RLS.
        const role = pgPromise.as.name(`rls_test_${process.pid}_${Date.now()}`);
        await tx.none(`
        CREATE ROLE ${role};
        GRANT USAGE ON SCHEMA public, prostgles TO ${role};
        GRANT SELECT ON rec TO ${role};
        INSERT INTO rec (id) VALUES (-42001), (-42002);
        ALTER TABLE rec ENABLE ROW LEVEL SECURITY;
        CREATE POLICY rls_test ON rec USING (id = prostgles.user('tenant_id')::integer);
        SET LOCAL ROLE ${role};
      `);
        for (const tenantId of [-42001, -42002, undefined]) {
          const params: LocalParams = {
            isRemoteRequest: {
              clientInfo: undefined,
              user:
                tenantId === undefined ? undefined : { ...requestUser, tenant_id: tenantId },
            },
            tx: { t: tx, dbTX: table.dboBuilder.dbo },
          };
        const expected = tenantId === undefined ? [] : [{ id: tenantId }];
        const table_rules = { select: { fields: "*", filterFields: "*", orderByFields: "*" } } as const;
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
        await rec.update(filter, { parent_id: rows[0].id }, { multi: false });
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
        assert.deepEqual(
          await rec.update(row, { parent_id: null }, { returning: "*" }),
          [],
        );
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

  await test("onInsteadOfDelete receives the authenticated or anonymous request context", async () => {
    await table.dboBuilder.getTX(async (dbx, tx) => {
      const rec = dbx.rec as TableHandler;
      let expectedUser: object = requestUser;
      let calls = 0;
      rec.hooks = {
        onInsteadOfDelete: async ({ tx, dbx }) => {
          await assertUser(tx, expectedUser);
          await dbx.rec!.find({});
          await assertUser(tx, expectedUser);
          calls++;
          return [];
        },
      };
      await rec.delete({ id: -1 }, undefined, undefined, undefined, localParams);
      expectedUser = {};
      await rec.delete({ id: -1 }, undefined, undefined, undefined, anonymousParams);
      await assertUser(tx, {});
      assert.equal(calls, 2);
    });
  });
};

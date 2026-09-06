import { strict as assert } from "node:assert";
import { test } from "node:test";
import pgPromise from "pg-promise";
import { fetchSyncServerData } from "prostgles-server/dist/PubSubManager/SyncReplication/fetchSyncServerData";
import type { Subscription } from "../../dist/PubSubManager/PubSubManager";
import type { DB, DBHandlerServer } from "../../dist/Prostgles";
import type { LocalParams } from "../../dist/DboBuilder/DboBuilderTypes";
import type { TableHandler } from "../../dist/DboBuilder/TableHandler/TableHandler";
import type { withUserRLS as WithUserRLS } from "../../dist/DboBuilder/dboBuilderUtils";

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

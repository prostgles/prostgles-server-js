import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import prostgles, { type ProstglesInitOptions, type PublishObject } from "prostgles-server";
import { getAllowedTableMethods, type AnyObject, type SelectParams } from "prostgles-types";
import type { DB } from "prostgles-server/dist/Prostgles";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import type { ViewHandler } from "prostgles-server/dist/DboBuilder/ViewHandler/ViewHandler";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";

export const testSelectRules = async (db: DB) => {
  await test("select arrays enforce row-dependent fields across reads and subscriptions", async (t) => {
    await db.none(`
      CREATE SCHEMA select_rules_test;
      CREATE TABLE select_rules_test.members (
        id int PRIMARY KEY, 
        username text NOT NULL, 
        email text NOT NULL,
        balance int NOT NULL, 
        is_owner boolean NOT NULL, 
        secret text NOT NULL
      );
      CREATE TABLE select_rules_test.memberships (
        id int PRIMARY KEY, 
        member_id int REFERENCES select_rules_test.members,
        allowed boolean NOT NULL
      );
      CREATE TABLE select_rules_test.messages (
        id int PRIMARY KEY, 
        member_id int REFERENCES select_rules_test.members, 
        body text
      );
      CREATE TABLE select_rules_test.permissions (enabled boolean NOT NULL);
      INSERT INTO select_rules_test.permissions VALUES (true);
      CREATE VIEW select_rules_test.profiles AS SELECT * FROM select_rules_test.members;
      CREATE FUNCTION select_rules_test.round(value integer) RETURNS integer
      LANGUAGE plpgsql VOLATILE COST 0.0001 AS $body$
      BEGIN
        IF value IN (3, 99, 999) THEN
          RAISE EXCEPTION 'caller function received a hidden value: %', value;
        END IF;
        RETURN value;
      END;
      $body$;
    `);
    const select = [
      { fields: ["id", "email", "balance"], forcedFilter: { is_owner: true } },
      {
        fields: ["id", "username"],
        forcedFilter: {
          $existsJoined: {
            memberships: {
              $and: [{ allowed: true }, { $exists: { permissions: { enabled: true } } }],
            },
          },
        },
      },
    ];
    const publish: PublishObject = {
      members: {
        select,
        insert: { fields: "*" },
        update: { fields: ["username"] },
        delete: { filterFields: ["id"] },
      },
      memberships: { select: { fields: ["id", "member_id"] } },
      messages: { select: "*" },
    };
    const instance = await prostgles({
      dbConnection: {
        ...getConnectionDetails(db),
        options: "-c search_path=select_rules_test,public",
      } as unknown as ProstglesInitOptions["dbConnection"],
      schemaFilter: { select_rules_test: 1 },
      publish,
      audit: { tableName: "history", tables: { members: 1 } },
      joins: "inferred",
      onReady: () => {},
    });
    const clientRequest = {
      httpReq: {
        ip: "127.0.0.1",
        headers: { authorization: "Bearer dGVzdA==" },
        connection: { remoteAddress: "127.0.0.1" },
      },
      res: {},
    } as never;
    const members = instance.db.members as unknown as TableHandler;
    const parser = members.dboBuilder.publishParser!;
    const subscriptions: { unsubscribe: () => unknown }[] = [];
    try {
      await members.insert([
        {
          id: 1,
          username: "own",
          email: "own@private",
          balance: 10,
          is_owner: true,
          secret: "hidden1",
        },
        {
          id: 2,
          username: "other",
          email: "other@private",
          balance: 99,
          is_owner: false,
          secret: "hidden2",
        },
        {
          id: 3,
          username: "outsider",
          email: "outsider@private",
          balance: 999,
          is_owner: false,
          secret: "hidden3",
        },
      ]);
      await instance.db.memberships!.insert!([
        { id: 1, member_id: 1, allowed: true },
        { id: 2, member_id: 2, allowed: true },
        { id: 3, member_id: 3, allowed: false },
      ]);
      await instance.db.messages!.insert!([
        { id: 1, member_id: 1, body: "first" },
        { id: 2, member_id: 2, body: "second" },
        { id: 3, member_id: 3, body: "third" },
      ]);
      const { clientDb, clientSchema } = await instance.getClientDBHandlers(
        clientRequest,
        undefined,
      );
      assert.equal(clientSchema.err, undefined);
      const clientMembers = clientDb.members!;
      const expectedRows = [
        { id: 1, username: "own", email: "own@private", balance: 10 },
        { id: 2, username: "other", email: null, balance: null },
      ];
      await t.test(
        "matching grants union their fields; other rows and fields stay hidden",
        async () => {
          assert.deepEqual(await clientMembers.find!({}, { orderBy: "id" }), expectedRows);
          assert.deepEqual(await clientMembers.findOne!({ username: "other" }), expectedRows[1]);
          assert.equal(await clientMembers.findOne!({ id: 3 }), undefined);
          assert.deepEqual(await clientMembers.find!({ email: "other@private" }), []);
          assert.deepEqual(await clientMembers.find!({ email: null }, { select: ["id"] }), [
            { id: 2 },
          ]);
          assert.equal(await clientMembers.count!(), 2);
          assert.equal(await clientMembers.count!({ "balance.$gt": 10 }), 0);
          assert.deepEqual(
            await clientMembers.find!({}, { select: { total: { $sum: ["balance"] } } }),
            [{ total: "10" }],
          );
          assert.deepEqual(
            await clientMembers.find!({}, { select: ["id"], orderBy: { balance: -1 } }),
            [{ id: 2 }, { id: 1 }],
          );
          assert.deepEqual(
            await clientMembers.find!(
              {},
              { select: { email: 1, total: { $countAll: [] } }, groupBy: true, orderBy: "email" },
            ),
            [
              { email: "own@private", total: "1" },
              { email: null, total: "1" },
            ],
          );
          await assert.rejects(() => clientMembers.find!({}, { select: ["secret"] }));
          await assert.rejects(() => clientMembers.find!({ secret: "hidden2" }));
          const initialSize = await clientMembers.size!();
          await members.update({ id: 2 }, { email: "a much longer private value" });
          assert.equal(await clientMembers.size!(), initialSize);
          assert.deepEqual(await clientMembers.find!({}, { orderBy: "id" }), expectedRows);
          await members.update({ id: 2 }, { email: "other@private" });
          assert.equal(
            clientSchema.tableSchema.find((table) => table.name === "members")!.publishInfo.select!
              .disabledMethods?.sync,
            1,
          );
          assert.throws(
            () =>
              parser.validateRequestRule(
                { tableName: "members", command: "sync", clientReq: clientRequest },
                {
                  select: {
                    fields: "*",
                    filterFields: "*",
                    orderByFields: "*",
                    disableMethods: { sync: 1 },
                  },
                },
                undefined,
              ),
            /disallowed/,
          );
        },
      );

      await t.test(
        "guarded comparisons preserve masking and safe top-N results",
        async () => {
          const rules = await parser.getValidatedRequestRuleWusr(
            { tableName: "members", command: "find", clientReq: clientRequest },
            undefined,
          );
          const getStatement = async (filter: AnyObject, params: SelectParams) =>
            (await members.find(filter, params, undefined, rules, {
              clientReq: clientRequest,
              returnQuery: "noRLS",
            })) as unknown as string;
          for (const filter of [
            { id: 2 },
            { id: { $gt: 1 } },
            { id: { $gte: 2 } },
            { id: { $lt: 3 } },
            { id: { $lte: 2 } },
            { username: "other" },
          ]) {
            const params: SelectParams = { select: ["id"], orderBy: { id: -1 }, limit: 1 };
            assert.deepEqual(await clientMembers.find!(filter, params), [{ id: 2 }]);
            const sql = await getStatement(filter, params);
            assert(sql.includes("OPERATOR(pg_catalog."), sql);
            assert(sql.includes('ORDER BY members."id" DESC LIMIT 1 OFFSET 0'), sql);
          }
          assert.deepEqual(
            await clientMembers.find!({ email: { $eq: "other@private" } }, { limit: 1 }),
            [],
          );
          assert.deepEqual(
            await clientMembers.find!({ balance: { $gt: 10 } }, { limit: 1 }),
            [],
          );
          for (const field of ["id", "balance"]) {
            assert.deepEqual(
              await clientMembers.find!(
                { $filter: [{ $round: [field] }, "$gte", 1] },
                { select: ["id"], orderBy: "id" },
              ),
              field === "id" ? [{ id: 1 }, { id: 2 }] : [{ id: 1 }],
            );
          }
          // Each case leaves work outside the boundary that must precede the limit.
          const fallbackCases: {
            filter: AnyObject;
            params: SelectParams;
            expected: AnyObject[];
          }[] = [
            { filter: { email: null }, params: {}, expected: [{ id: 2 }] },
            { filter: { email: { $ne: "own@private" } }, params: {}, expected: [] },
            {
              filter: { $or: [{ id: 1 }, { email: null }] },
              params: { orderBy: { id: -1 } },
              expected: [{ id: 2 }],
            },
            {
              filter: { id: { $gt: 0 }, username: { $like: "other%" } },
              params: {},
              expected: [{ id: 2 }],
            },
            { filter: {}, params: { offset: 1 }, expected: [{ id: 2 }] },
            { filter: {}, params: { orderBy: { balance: -1 } }, expected: [{ id: 2 }] },
            {
              filter: {},
              params: { orderBy: { key: "id", nullEmpty: true } },
              expected: [{ id: 1 }],
            },
            {
              filter: { id: 5 },
              params: { select: { id: { $length: ["username"] } } },
              expected: [{ id: 5 }],
            },
            {
              filter: {},
              params: { select: { total: { $countAll: [] } }, orderBy: undefined },
              expected: [{ total: "2" }],
            },
            {
              filter: {},
              params: { select: ["id"], groupBy: true, having: { id: 2 }, orderBy: undefined },
              expected: [{ id: 2 }],
            },
            {
              filter: {},
              params: {
                select: {
                  id: 1,
                  messages: {
                    $innerJoin: "messages",
                    filter: { body: "second" },
                    select: ["id"],
                    limit: 1,
                  },
                },
              },
              expected: [{ id: 2, messages: [{ id: 2 }] }],
            },
            {
              filter: { $existsJoined: { messages: { body: "second" } } },
              params: {},
              expected: [{ id: 2 }],
            },
          ];
          for (const { filter, params, expected } of fallbackCases) {
            const selectParams: SelectParams = {
              select: ["id"],
              orderBy: "id",
              limit: 1,
              ...params,
            };
            assert.deepEqual(await clientMembers.find!(filter, selectParams), expected);
            const sql = await getStatement(filter, selectParams);
            assert(!sql.includes("LIMIT 1 OFFSET 0"), sql);
            assert(sql.includes(" OFFSET 0)"), sql);
          }
          const scoped = await instance.getClientDBHandlers(clientRequest, {
            tables: { members: { select: { forcedFilter: { id: 2 } } } },
          });
          assert.deepEqual(
            await scoped.clientDb.members!.find!(
              {},
              { select: ["id"], orderBy: "id", limit: 1 },
            ),
            [{ id: 2 }],
          );
          // Nested limits apply per parent, never to the whole joined source.
          assert.deepEqual(
            await clientDb.memberships!.find!(
              {},
              {
                select: {
                  id: 1,
                  members: { $leftJoin: "members", select: ["id"], orderBy: "id", limit: 1 },
                },
                orderBy: "id",
              },
            ),
            [
              { id: 1, members: [{ id: 1 }] },
              { id: 2, members: [{ id: 2 }] },
              { id: 3, members: [] },
            ],
          );
        },
      );

      await t.test("joins, exists and scopes use masked values", async () => {
        assert.deepEqual(
          await clientDb.memberships!.find!(
            {},
            {
              select: { id: 1, members: "*" },
              orderBy: "id",
            },
          ),
          [
            { id: 1, members: [expectedRows[0]] },
            { id: 2, members: [expectedRows[1]] },
            { id: 3, members: [] },
          ],
        );
        assert.deepEqual(
          await clientDb.memberships!.find!({
            $existsJoined: { members: { email: "other@private" } },
          }),
          [],
        );
        assert.deepEqual(
          await clientDb.memberships!.find!({
            $exists: { members: { email: "other@private" } },
          }),
          [],
        );
        // A hidden intermediate member must not connect a membership to its messages.
        assert.deepEqual(
          await clientDb.memberships!.find!(
            {},
            {
              select: { id: 1, messages: { $leftJoin: ["members", "messages"], select: ["body"] } },
              orderBy: "id",
            },
          ),
          [
            { id: 1, messages: [{ body: "first" }] },
            { id: 2, messages: [{ body: "second" }] },
            { id: 3, messages: [] },
          ],
        );
        assert.deepEqual(
          await clientDb.memberships!.find!({
            $existsJoined: { path: ["members", "messages"], filter: { body: "third" } },
          }),
          [],
        );
        const scoped = await instance.getClientDBHandlers(clientRequest, {
          tables: { members: { select: { fields: ["id", "email"], forcedFilter: { id: 2 } } } },
        });
        assert.deepEqual(await scoped.clientDb.members!.find!(), [{ id: 2, email: null }]);
        const scopedJoin = await instance.getClientDBHandlers(clientRequest, {
          tables: { memberships: { select: true }, messages: { select: true } },
        });
        await assert.rejects(() =>
          scopedJoin.clientDb.memberships!.find!(
            {},
            {
              select: { messages: { $leftJoin: ["members", "messages"], select: "*" } },
            },
          ),
        );
      });

      await t.test("intermediate tables enforce select rules on every hop", async () => {
        try {
          for (const select of [
            { fields: ["id"], forcedFilter: { id: 2 } },
            [
              { fields: ["id"], forcedFilter: { id: 2 } },
              { fields: ["username"], forcedFilter: { id: 1 } },
            ],
          ]) {
            await instance.update({ publish: { ...publish, members: { select } } });
            const { clientDb } = await instance.getClientDBHandlers(clientRequest, undefined);
            for (const path of [
              "messages",
              ["members", "messages"],
              ["members", "memberships", "members", "messages"],
            ]) {
              assert.deepEqual(
                await clientDb.memberships!.find!(
                  {},
                  {
                    select: { id: 1, messages: { $leftJoin: path, select: ["body"] } },
                    orderBy: "id",
                  },
                ),
                [
                  { id: 1, messages: [] },
                  { id: 2, messages: [{ body: "second" }] },
                  { id: 3, messages: [] },
                ],
              );
              const existsPath = typeof path === "string" ? ["**", path] : path;
              for (const body of ["first", "second", "third"]) {
                assert.deepEqual(
                  await clientDb.memberships!.find!(
                    { $existsJoined: { path: existsPath, filter: { body } } },
                    { select: ["id"] },
                  ),
                  body === "second" ? [{ id: 2 }] : [],
                );
              }
              assert.deepEqual(
                await clientDb.memberships!.find!(
                  { $notExistsJoined: { path: existsPath, filter: {} } },
                  { select: ["id"], orderBy: "id" },
                ),
                [{ id: 1 }, { id: 3 }],
              );
            }
            const scoped = await instance.getClientDBHandlers(clientRequest, {
              tables: {
                memberships: { select: true },
                members: { select: { forcedFilter: { id: 1 } } },
                messages: { select: true },
              },
            });
            assert.deepEqual(
              await scoped.clientDb.memberships!.find!({
                $existsJoined: { path: ["members", "messages"], filter: {} },
              }),
              [],
            );
          }
          for (const select of [undefined, []]) {
            await instance.update({ publish: { ...publish, members: { select } } });
            const { clientDb } = await instance.getClientDBHandlers(clientRequest, undefined);
            await assert.rejects(() =>
              clientDb.memberships!.find!({}, { select: { messages: { body: 1 } } }),
            );
            await assert.rejects(() =>
              clientDb.memberships!.find!({
                $existsJoined: { path: ["members", "messages"], filter: {} },
              }),
            );
          }
          assert.equal(
            await instance.db.memberships!.count!({
              $existsJoined: { path: ["members", "messages"], filter: {} },
            }),
            3,
          );
        } finally {
          await instance.update({ publish });
        }
      });

      await t.test("inferred audit snapshots respect each grant", async () => {
        const history = await clientDb.history!.find!({ operation: "INSERT" }, { orderBy: "id" });
        assert.deepEqual(
          history.map((row) => row.new_row),
          expectedRows.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)),
          ),
        );
        assert.deepEqual(await clientDb.history!.find!({ "new_row->>email": "other@private" }), []);
        for (const email of ["other@private", null]) {
          const scoped = await instance.getClientDBHandlers(clientRequest, {
            tables: {
              members: { select: { fields: ["id", "username"], forcedFilter: { email } } },
              history: { select: true },
            },
          });
          const rows = await scoped.clientDb.members!.find!();
          const history = await scoped.clientDb.history!.find!({ operation: "INSERT" });
          assert.deepEqual(
            rows.map(({ id }) => id),
            email ? [] : [2],
          );
          assert.deepEqual(
            history.map(({ new_row }) => new_row.id),
            rows.map(({ id }) => id),
          );
          assert(
            history.every(({ new_row }) =>
              Object.keys(new_row).every((field) => ["id", "username"].includes(field)),
            ),
          );
        }
      });

      await t.test("mutations default to fields shared by every select rule", async () => {
        await assert.rejects(() =>
          clientMembers.update!({ id: 2 }, { username: "other" }, { returning: ["email"] }),
        );
        await assert.rejects(() => clientMembers.delete!({ id: 3 }, { returning: ["email"] }));
        await assert.rejects(() =>
          clientMembers.update!({ username: "other" }, { username: "other" }),
        );
        await assert.rejects(() =>
          clientMembers.update!({ id: 2 }, { username: "other" }, { returning: ["username"] }),
        );
        assert.equal(await members.count({ id: 3 }), 1);
        try {
          assert.deepEqual(
            await clientMembers.insert!(
              {
                id: 4,
                username: "new",
                email: "private",
                balance: 0,
                is_owner: false,
                secret: "hidden",
              },
              { returning: "*" },
            ),
            { id: 4 },
          );
          assert.deepEqual(
            await clientMembers.update!(
              { id: 2 },
              { username: "other" },
              { returning: "*" },
            ),
            [{ id: 2 }],
          );
          assert.deepEqual(await clientMembers.delete!({ id: 4 }, { returning: ["id"] }), [
            { id: 4 },
          ]);
        } finally {
          await members.delete({ id: 4 });
        }
      });

      await t.test(
        "mutation intersections normalize fields and preserve explicit grants",
        async () => {
          try {
            await instance.update({
              publish: {
                members: {
                  select: [
                    { fields: "*" },
                    { fields: { email: 0, secret: 0 } },
                    { fields: { id: 1, username: 1 }, filterFields: ["id"] },
                  ],
                  update: { fields: ["username"] },
                },
              },
            });
            const { clientDb } = await instance.getClientDBHandlers(clientRequest, undefined);
            assert.deepEqual(
              await clientDb.members!.update!({ id: 2 }, { username: "other" }, { returning: "*" }),
              [{ id: 2, username: "other" }],
            );
            await assert.rejects(() =>
              clientDb.members!.update!({ username: "other" }, { username: "other" }),
            );
            for (const explicitGrants of [false, true]) {
              await instance.update({
                publish: {
                  members: {
                    select: [{ fields: ["id"] }, { fields: ["username"] }],
                    update: {
                      fields: ["username"],
                      ...(explicitGrants && { filterFields: ["id"], returningFields: ["email"] }),
                    },
                  },
                },
              });
              const { clientDb } = await instance.getClientDBHandlers(clientRequest, undefined);
              const update = () =>
                clientDb.members!.update!(
                  { id: 2 },
                  { username: "other" },
                  { returning: ["email"] },
                );
              if (explicitGrants) {
                assert.deepEqual(await update(), [{ email: "other@private" }]);
              } else {
                await assert.rejects(() =>
                  clientDb.members!.update!({ id: 2 }, { username: "other" }),
                );
                await assert.rejects(() =>
                  clientDb.members!.update!({}, { username: "other" }, { returning: ["username"] }),
                );
              }
            }
          } finally {
            await instance.update({ publish });
          }
        },
      );

      await t.test("subscriptions refresh on row and related permission changes", async () => {
        const rules = await parser.getValidatedRequestRuleWusr(
          {
            tableName: "members",
            command: "subscribe",
            clientReq: clientRequest,
          },
          undefined,
        );
        let observedRows: AnyObject[] | undefined;
        let observedMessages: string[] | undefined;
        let subscriptionError: unknown;
        const subscription = await members.subscribe(
          { email: null },
          { select: ["id", "email"], orderBy: "id", throttle: 0 },
          (rows, error) => {
            observedRows = rows;
            subscriptionError = error;
          },
          rules,
          { clientReq: clientRequest },
        );
        assert("unsubscribe" in subscription && typeof subscription.unsubscribe === "function");
        const { unsubscribe } = subscription;
        subscriptions.push({ unsubscribe: () => unsubscribe() });
        const memberships = instance.db.memberships as unknown as TableHandler;
        const joinRules = await parser.getValidatedRequestRuleWusr(
          { tableName: "memberships", command: "subscribe", clientReq: clientRequest },
          undefined,
        );
        const joinedSubscription = await memberships.subscribe(
          {},
          {
            select: { messages: { $leftJoin: ["members", "messages"], select: ["body"] } },
            orderBy: "id",
            throttle: 0,
          },
          (rows, error) => {
            observedMessages = rows.flatMap((row) =>
              (row.messages as { body: string }[]).map(({ body }) => body),
            );
            subscriptionError = error;
          },
          joinRules,
          { clientReq: clientRequest },
        );
        assert(
          "unsubscribe" in joinedSubscription && typeof joinedSubscription.unsubscribe === "function",
        );
        const { unsubscribe: unsubscribeJoined } = joinedSubscription;
        subscriptions.push({ unsubscribe: () => unsubscribeJoined() });
        const waitForRows = async (expected: AnyObject[], expectedMessages: string[]) => {
          const deadline = Date.now() + 10000;
          while (
            !isDeepStrictEqual(observedRows, expected) ||
            !isDeepStrictEqual(observedMessages, expectedMessages)
          ) {
            if (subscriptionError) throw subscriptionError;
            if (Date.now() > deadline) {
              assert.deepEqual(observedRows, expected);
              assert.deepEqual(observedMessages, expectedMessages);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        };
        await waitForRows([{ id: 2, email: null }], ["first", "second"]);
        await members.update({ id: 2 }, { is_owner: true });
        await waitForRows([], ["first", "second"]);
        await members.update({ id: 2 }, { is_owner: false });
        await waitForRows([{ id: 2, email: null }], ["first", "second"]);
        await instance.db.memberships!.update!({ id: 3 }, { allowed: true });
        await waitForRows(
          [
            { id: 2, email: null },
            { id: 3, email: null },
          ],
          ["first", "second", "third"],
        );
        await instance.db.memberships!.update!({ id: 2 }, { allowed: false });
        await waitForRows([{ id: 3, email: null }], ["first", "third"]);
        await instance.db.permissions!.update!({}, { enabled: false });
        await waitForRows([], ["first"]);
        await instance.db.permissions!.update!({}, { enabled: true });
        await waitForRows([{ id: 3, email: null }], ["first", "third"]);
        await subscriptions.pop()!.unsubscribe();
        await subscriptions.pop()!.unsubscribe();
      });

      await t.test(
        "empty arrays deny reads; masked view subscriptions refresh after writes",
        async () => {
          await instance.update({
            publish: {
              members: { select: [] },
              profiles: {
                select: [
                  { fields: { secret: 0 }, forcedFilter: { is_owner: true } },
                  { fields: ["id", "username"] },
                ],
              },
            },
          });
          const client = await instance.getClientDBHandlers(clientRequest, undefined);
          assert.equal(client.clientDb.members, undefined);
          const profiles = await client.clientDb.profiles!.find!({}, { orderBy: "id" });
          assert.equal(profiles.length, 3);
          assert.equal(profiles[0]!.email, "own@private");
          assert.equal(profiles[1]!.email, null);
          assert(profiles.every((row) => !("secret" in row)));

          const profilesHandler = instance.db.profiles as unknown as ViewHandler;
          const rules = await profilesHandler.dboBuilder.publishParser!.getValidatedRequestRuleWusr(
            {
              tableName: "profiles",
              command: "subscribe",
              clientReq: clientRequest,
            },
            undefined,
          );
          let observedRows: AnyObject[] | undefined;
          let subscriptionError: unknown;
          const subscription = await profilesHandler.subscribe(
            { email: null },
            { select: ["id", "email"], orderBy: "id", throttle: 0 },
            (rows, error) => {
              observedRows = rows;
              subscriptionError = error;
            },
            rules,
            { clientReq: clientRequest },
          );
          assert("unsubscribe" in subscription && typeof subscription.unsubscribe === "function");
          const { unsubscribe } = subscription;
          subscriptions.push({ unsubscribe: () => unsubscribe() });
          const waitForRows = async (ids: number[]) => {
            const expected = ids.map((id) => ({ id, email: null }));
            const deadline = Date.now() + 10000;
            while (!isDeepStrictEqual(observedRows, expected)) {
              if (subscriptionError) throw subscriptionError;
              if (Date.now() > deadline) assert.deepEqual(observedRows, expected);
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          };
          await waitForRows([2, 3]);
          await members.update({ id: 2 }, { is_owner: true });
          await waitForRows([3]);
          await members.update({ id: 2 }, { is_owner: false });
          await waitForRows([2, 3]);
          await subscriptions.pop()!.unsubscribe();
        },
      );

      await t.test("query-wide restrictions use the most restrictive rule", async () => {
        await instance.update({
          publish: {
            members: {
              select: [
                { fields: ["id"], maxLimit: 1, subscribeThrottle: 20 },
                {
                  fields: ["username"],
                  maxLimit: 3,
                  subscribeThrottle: 50,
                  disableMethods: { subscribe: 1 },
                },
                { fields: ["id"], disableMethods: { subscribe: undefined } },
              ],
            },
          },
        });
        const client = await instance.getClientDBHandlers(clientRequest, undefined);
        await assert.rejects(() => client.clientDb.members!.find!({}, { limit: 2 }));
        assert.deepEqual(await client.clientDb.members!.find!({}, { limit: 1, orderBy: "id" }), [
          { id: 1, username: "own" },
        ]);
        const info = await client.clientDb.members!.getInfo!();
        const commands = getAllowedTableMethods({
          publishInfo: {
            ...info.publishInfo,
            select: {
              ...info.publishInfo.select!,
              syncConfig: {
                id_fields: ["id"],
                synced_field: "balance",
                throttle: 0,
                batch_size: 50,
              },
            },
          },
        });
        for (const command of ["sync", "subscribe", "subscribeOne"] as const) {
          assert(!commands.includes(command));
        }
        const currentParser = (instance.db.members as unknown as TableHandler).dboBuilder
          .publishParser!;
        const rules = await currentParser.getValidatedRequestRuleWusr(
          { tableName: "members", command: "find", clientReq: clientRequest },
          undefined,
        );
        assert.equal(rules.select!.subscribeThrottle, 50);
        for (const command of ["subscribe", "subscribeOne"]) {
          assert.throws(
            () =>
              currentParser.validateRequestRule(
                { tableName: "members", command, clientReq: clientRequest },
                rules,
                undefined,
              ),
            /disallowed/,
          );
        }
        for (const invalidSelect of [
          [{ fields: ["missing"] }],
          [{ fields: ["id"], maxLimit: -1 }],
          [{ fields: ["id"], filterFields: ["email"] }],
        ]) {
          await assert.rejects(() =>
            currentParser.getTableRules({
              tableName: "members",
              clientReq: undefined,
              clientInfo: undefined,
              scope: undefined,
              resolvedPublishObject: { members: { select: invalidSelect } },
            }),
          );
        }
      });
    } finally {
      await Promise.all(subscriptions.map((subscription) => subscription.unsubscribe()));
      await instance.destroy();
      await db.none("DROP SCHEMA select_rules_test CASCADE");
    }
  });
};

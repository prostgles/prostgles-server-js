import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import {
  reverseParsedPath,
  type AnyObject,
  type ClientJoin,
  type JoinPath,
  type SubscribeParams,
} from "prostgles-types";
import prostgles, { defineComputedJoin, type ProstglesInitOptions } from "prostgles-server";
import type { Join } from "prostgles-server/dist/ProstglesTypes";
import type { DB } from "prostgles-server/dist/Prostgles";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import { withTableExpression } from "prostgles-server/dist/DboBuilder/QueryBuilder/getQuerySource";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { NOTIF_CHANNEL, NOTIF_TYPE } from "prostgles-server/dist/PubSubManager/PubSubManagerUtils";

export const testJoins = async (db: DB) => {
  const clientRequest = {
    httpReq: {
      ip: "127.0.0.1",
      headers: { authorization: "Bearer dGVzdA==" },
      connection: { remoteAddress: "127.0.0.1" },
    },
    res: {},
  } as never;
  await test("unique-key nested joins use bounded index lookups for repeated job controls", async (context) => {
    await db.none(`
      CREATE SCHEMA unique_join_test;
      CREATE TABLE unique_join_test.jobs (
        id int PRIMARY KEY, status text NOT NULL, tenant_id int, reference int,
        UNIQUE (tenant_id, reference)
      );
      CREATE TABLE unique_join_test.documents (
        id int PRIMARY KEY, kind text NOT NULL, job_id int REFERENCES unique_join_test.jobs(id)
      );
      CREATE TABLE unique_join_test.composite_documents (
        id int PRIMARY KEY, tenant_id int, job_reference int,
        FOREIGN KEY (tenant_id, job_reference) REFERENCES unique_join_test.jobs(tenant_id, reference)
      );
      CREATE TABLE unique_join_test.partial_documents (id int PRIMARY KEY, job_reference int);
      CREATE UNIQUE INDEX pending_job_reference ON unique_join_test.jobs (reference)
        WHERE status = 'pending';
      INSERT INTO unique_join_test.jobs
        SELECT id, 'succeeded', id % 2, id / 2 FROM generate_series(1, 25000) id;
      INSERT INTO unique_join_test.documents VALUES
        (1, 'decision_notice', 1234), (2, 'other', NULL), (3, 'other', 1234);
      INSERT INTO unique_join_test.composite_documents VALUES (1, 0, 617), (2, 1, 617);
      ANALYZE unique_join_test.jobs;
    `);
    const instance = await prostgles({
      dbConnection: {
        ...getConnectionDetails(db),
        options: "-c search_path=unique_join_test,public",
      } as unknown as ProstglesInitOptions["dbConnection"],
      schemaFilter: { unique_join_test: 1 },
      joins: [{ tables: ["partial_documents", "jobs"], on: [{ job_reference: "reference" }] }],
      publish: {
        documents: { select: "*" },
        jobs: { select: { fields: "*", forcedFilter: { id: 1234 } } },
      },
      publishRawSQL: () => true,
      onReady: () => {},
    });
    try {
      const documents = instance.db.documents!;
      const jobSelect = {
        $leftJoin: "jobs",
        select: { id: 1, status: 1 },
        orderBy: { id: -1 },
        limit: 1,
      } as const;
      const select = {
        id: 1 as const,
        ...Object.fromEntries(
          Array.from({ length: 6 }, (_, index) => [
            `job_${index}`,
            index % 2 ?
              { ...jobSelect, filter: { $or: [{ status: "succeeded" }, { id: 4321 }] } }
            : { $leftJoin: "jobs", select: jobSelect.select },
          ]),
        ),
      };
      const filter = { kind: "decision_notice" };
      const params = { select, orderBy: { "job_0.id": -1 as const }, limit: 1000 };
      const expectedJobs = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [
          `job_${index}`,
          [{ id: 1234, status: "succeeded" }],
        ]),
      );
      assert.deepEqual(await documents.find!(filter, params), [{ id: 1, ...expectedJobs }]);
      const statement: unknown = await documents.find!(filter, {
        ...params,
        returnType: "statement-no-rls",
      });
      const jobScans = await getNestedJoinScans(instance._db, statement, "jobs");
      assert.equal(jobScans.length, 6);
      for (const scan of jobScans) {
        assert.equal(scan["Index Name"], "jobs_pkey");
        assert(scan["Index Cond"]?.includes("job_id"), JSON.stringify(scan));
        assert.equal(scan["Actual Rows"], 1);
        assert.equal(scan["Actual Loops"], 1);
      }
      assert.deepEqual(
        await documents.find!({}, { select: { id: 1, job: jobSelect }, orderBy: "id" }),
        [
          { id: 1, job: [{ id: 1234, status: "succeeded" }] },
          { id: 2, job: [] },
          { id: 3, job: [{ id: 1234, status: "succeeded" }] },
        ],
      );
      assert.deepEqual(
        await documents.find!(
          {},
          {
            select: {
              id: 1,
              job: { $innerJoin: "jobs", select: { count: { $countAll: [] } } },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, job: [{ count: 1 }] },
          { id: 3, job: [{ count: 1 }] },
        ],
      );
      const client = await instance.getClientDBHandlers(clientRequest, undefined);
      assert.deepEqual(await client.clientDb.documents!.find!(filter, params), [
        { id: 1, ...expectedJobs },
      ]);
      assert.deepEqual(
        await client.clientDb.documents!.find!(filter, {
          select: { id: 1, job: { ...jobSelect, filter: { id: 4321 } } },
        }),
        [{ id: 1, job: [] }],
      );
      assert.deepEqual(
        await instance.db.composite_documents!.find!(
          {},
          {
            select: { id: 1, job: jobSelect },
            orderBy: "id",
          },
        ),
        [
          { id: 1, job: [{ id: 1234, status: "succeeded" }] },
          { id: 2, job: [{ id: 1235, status: "succeeded" }] },
        ],
      );
      await instance.update({
        publish: {
          documents: { select: "*" },
          jobs: { select: { fields: "*", forcedFilter: { id: 4321 } } },
        },
      });
      const restrictedClient = await instance.getClientDBHandlers(clientRequest, undefined);
      assert.deepEqual(
        await restrictedClient.clientDb.documents!.find!(filter, {
          select: { id: 1, job: jobSelect },
        }),
        [{ id: 1, job: [] }],
      );

      await db.none(`
        INSERT INTO unique_join_test.documents
          SELECT id, 'other', id FROM generate_series(4, 1003) id;
        INSERT INTO unique_join_test.partial_documents
          SELECT id, id FROM generate_series(4, 1003) id;
        ANALYZE unique_join_test.documents;
        ANALYZE unique_join_test.partial_documents;
      `);
      await instance.update({
        publish: {
          documents: { select: "*" },
          jobs: { select: [{ fields: "*", forcedFilter: { status: "succeeded" } }] },
        },
      });
      const maskedClient = await instance.getClientDBHandlers(clientRequest, undefined);
      for (const { name, documents, getJobId } of [
        {
          name: "permission-wrapped joins scan the target once",
          documents: maskedClient.clientDb.documents!,
          getJobId: (documentId: number) => documentId,
        },
        {
          name: "partial unique indexes do not cause per-parent scans",
          documents: instance.db.partial_documents!,
          getJobId: (documentId: number) => documentId * 2 + 1,
        },
      ]) {
        await context.test(name, async () => {
          const filter = { id: { $gte: 4 } };
          const params = { select: { id: 1 as const, job: jobSelect }, orderBy: "id", limit: 1000 };
          assert.deepEqual(
            await documents.find!(filter, params),
            Array.from({ length: 1000 }, (_, index) => ({
              id: index + 4,
              job: [{ id: getJobId(index + 4), status: "succeeded" }],
            })),
          );
          const statement: unknown = await documents.find!(filter, {
            ...params,
            returnType: "statement-no-rls",
          });
          const jobScans = await getNestedJoinScans(instance._db, statement, "jobs");
          assert.equal(jobScans.length, 1);
          for (const scan of jobScans) {
            assert.equal(scan["Actual Loops"], 1, JSON.stringify(scan));
          }
        });
      }
    } finally {
      await instance.destroy();
      await db.none("DROP SCHEMA unique_join_test CASCADE");
    }
  });
  await test("custom joins add conditions unless override is requested", async () => {
    await db.none(`
      CREATE SCHEMA join_merge_test;
      CREATE TABLE join_merge_test.members (id int PRIMARY KEY, project_id int, discipline_id text);
      CREATE TABLE join_merge_test.conditions (
        id int PRIMARY KEY, assigned_member_id int REFERENCES join_merge_test.members(id),
        project_id int, discipline_id text
      );
      INSERT INTO join_merge_test.members VALUES (1, 1, 'drainage');
      INSERT INTO join_merge_test.conditions VALUES
        (1, 1, 2, 'ecology'), (2, NULL, 1, 'drainage'), (3, NULL, 1, 'ecology');
    `);
    try {
      for (const override of [false, true]) {
        // Reverse the inferred relationship's direction and duplicate the custom condition.
        const on = { project_id: "project_id", discipline_id: "discipline_id" };
        const join: Join = {
          tables: ["members", "conditions"],
          on: [on, { discipline_id: "discipline_id", project_id: "project_id" }],
          ...(override && { override }),
        };
        const instance = await prostgles({
          dbConnection: {
            ...getConnectionDetails(db),
            options: "-c search_path=join_merge_test,public",
          } as unknown as ProstglesInitOptions["dbConnection"],
          schemaFilter: { join_merge_test: 1 },
          ...(override ?
            { tableConfig: { members: { getJoins: () => [join] } } }
          : { joins: [join] }),
          publish: { members: { select: "*" }, conditions: { select: "*" } },
          onReady: () => {},
        });
        try {
          const conditions = instance.db.conditions!;
          const rows = await conditions.find!(
            { $existsJoined: { members: { id: 1 } } },
            { select: ["id"], orderBy: "id" },
          );
          assert.deepEqual(rows, override ? [{ id: 2 }] : [{ id: 1 }, { id: 2 }]);
          const scopedRows = await conditions.find!(
            {
              $existsJoined: {
                path: [{ table: "members", on: [on] }],
                filter: { id: 1 },
              },
            },
            { select: ["id"] },
          );
          assert.deepEqual(scopedRows, [{ id: 2 }]);
          const assignedFilter = {
            $existsJoined: {
              path: [{ table: "members", on: [{ assigned_member_id: "id" }] }],
              filter: { id: 1 },
            },
          };
          if (override) {
            await assert.rejects(() => conditions.find!(assignedFilter));
          } else {
            assert.deepEqual(await conditions.find!(assignedFilter, { select: ["id"] }), [
              { id: 1 },
            ]);
          }
          // A duplicate must not make an otherwise unambiguous join fail.
          if (override) {
            await conditions.find!({}, { select: { id: 1, members: "*" } });
          }
          // Client metadata must expose the effective merged or overridden join conditions.
          const client = await instance.getClientDBHandlers(clientRequest, undefined);
          assert.deepEqual(client.clientSchema.joinTables, [["conditions", "members"]]);
          assert.deepEqual(client.clientSchema.joins, [
            {
              tables: ["members", "conditions"],
              on: [...(override ? [] : [{ id: "assigned_member_id" }]), on],
              supportsMultiHop: true,
            },
          ]);

          // Caller-owned config changes must not mutate the active validated joins.
          on.project_id = "id";
          join.tables.reverse();
          assert.deepEqual(
            await conditions.find!(
              { $existsJoined: { members: { id: 1 } } },
              { select: ["id"], orderBy: "id" },
            ),
            rows,
          );
        } finally {
          await instance.destroy();
        }
      }
    } finally {
      await db.none("DROP SCHEMA join_merge_test CASCADE");
    }
  });

  await test("custom self joins use configured paths and override inferred joins", async () => {
    await db.none(`
      CREATE SCHEMA custom_self_join_test;
      CREATE TABLE custom_self_join_test.members (
        id int PRIMARY KEY,
        project_id int NOT NULL,
        discipline_id text NOT NULL,
        user_id int NOT NULL,
        role text NOT NULL
      );
      INSERT INTO custom_self_join_test.members VALUES
        (1, 1, 'drainage', 10, 'manager'),
        (2, 1, 'drainage', 20, 'viewer'),
        (3, 1, 'ecology', 20, 'viewer');

      CREATE TABLE custom_self_join_test.managed_members (
        id int PRIMARY KEY,
        manager_id int REFERENCES custom_self_join_test.managed_members(id),
        project_id int NOT NULL,
        user_id int NOT NULL,
        role text NOT NULL
      );
      INSERT INTO custom_self_join_test.managed_members VALUES
        (1, NULL, 3, 20, 'viewer'),
        (2, 1, 3, 20, 'viewer'),
        (3, NULL, 1, 10, 'manager');
    `);
    const on = { project_id: "project_id", discipline_id: "discipline_id" };
    const overrideOn = { project_id: "id" };
    const instance = await prostgles({
      dbConnection: {
        ...getConnectionDetails(db),
        options: "-c search_path=custom_self_join_test,public",
      } as unknown as ProstglesInitOptions["dbConnection"],
      schemaFilter: { custom_self_join_test: 1 },
      joins: [
        {
          tables: ["members", "members"],
          on: [on],
        },
        {
          tables: ["managed_members", "managed_members"],
          on: [overrideOn],
          override: true,
        },
      ],
      onReady: () => {},
    });
    try {
      const members = instance.db.members!;
      const rows = await members.find!(
        {
          $existsJoined: {
            path: [{ table: "members", on: [on] }],
            filter: { user_id: 10, role: "manager" },
          },
        },
        { select: ["id"], orderBy: "id" },
      );
      assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
      assert.deepEqual(
        await members.find!(
          { $existsJoined: { members: { user_id: 10, role: "manager" } } },
          { select: ["id"], orderBy: "id" },
        ),
        rows,
      );

      const managedMembers = instance.db.managed_members!;
      assert.deepEqual(
        await managedMembers.find!(
          {
            $existsJoined: {
              path: [{ table: "managed_members", on: [overrideOn] }],
              filter: { user_id: 10, role: "manager" },
            },
          },
          { select: ["id"], orderBy: "id" },
        ),
        [{ id: 1 }, { id: 2 }],
      );
      await assert.rejects(() =>
        managedMembers.find!({
          $existsJoined: {
            path: [{ table: "managed_members", on: [{ manager_id: "id" }] }],
            filter: {},
          },
        }),
      );
    } finally {
      await instance.destroy();
      await db.none("DROP SCHEMA custom_self_join_test CASCADE");
    }
  });

  await test("computed joins support params, subscriptions, pagination and publish rules", async (context) => {
    // Cover plain views, quoted schema names and views built on other views.
    const viewPairs = [
      { memberView: "member_view", eventView: "event_view" },
      {
        memberView: '"computed_join.views".member_view',
        eventView: '"computed_join.views".nested_event_view',
      },
    ];
    await db.none(`
      CREATE SCHEMA computed_join_test;
      CREATE SCHEMA "computed_join.views";
      CREATE TABLE computed_join_test.members (id int PRIMARY KEY, max_event int NOT NULL);
      CREATE TABLE computed_join_test.member_links (id int PRIMARY KEY, member_id int REFERENCES computed_join_test.members(id));
      CREATE TABLE computed_join_test.labels (id int PRIMARY KEY, member_id int REFERENCES computed_join_test.members(id));
      CREATE TABLE computed_join_test.events (
        id int PRIMARY KEY, table_name text, owner jsonb, visible boolean, label text, secret text
      );
      CREATE VIEW computed_join_test.member_view AS SELECT * FROM computed_join_test.members WHERE max_event > 0;
      CREATE VIEW computed_join_test.event_view AS SELECT * FROM computed_join_test.events;
      CREATE VIEW "computed_join.views".member_view AS SELECT * FROM computed_join_test.members WHERE max_event > 0;
      CREATE VIEW "computed_join.views".event_view AS SELECT * FROM computed_join_test.events;
      CREATE VIEW "computed_join.views".nested_event_view AS SELECT * FROM "computed_join.views".event_view;
      INSERT INTO computed_join_test.members VALUES (1, 3), (2, 4), (3, 0);
      INSERT INTO computed_join_test.member_links VALUES (1, 1), (2, 2), (3, 3);
      INSERT INTO computed_join_test.labels VALUES (1, 1);
      INSERT INTO computed_join_test.events VALUES
        (1, 'members', '{"id":1}', true, 'first', 'hidden'),
        (2, 'members', '{"id":1}', true, 'second', 'hidden'),
        (3, 'members', '{"id":1}', false, 'private', 'hidden'),
        (4, 'members', '{"id":2}', true, 'fourth', 'hidden'),
        (5, 'members', '{"id":2}', true, 'fifth', 'hidden'),
        (6, 'other', '{"id":1}', true, 'unrelated', 'hidden');
    `);
    const instance = await prostgles({
      dbConnection: {
        ...getConnectionDetails(db),
        options: "-c search_path=computed_join_test,public",
      } as unknown as ProstglesInitOptions["dbConnection"],
      schemaFilter: { computed_join_test: 1, "computed_join.views": 1 },
      joins: [
        {
          tables: ["members", "members"],
          on: [
            defineComputedJoin({
              $joinName: "next_member",
              $params: { step: "number" },
              $sql: ({ left, right, params, asValue }) => {
                params.step satisfies number;
                return `${left("id")} + ${asValue(params.step)} = ${right("id")}`;
              },
            }),
          ],
        },
        {
          tables: ["events", "members"],
          on: [
            defineComputedJoin({
              $joinName: "before",
              $sql: ({ left, right, params }) => {
                // @ts-expect-error Joins without a params schema have no declared params.
                params.distance;
                return `${left("table_name")} = 'members' AND ${left("owner")} ->> 'id' = ${right("id")}::text AND ${left("id")} <= ${right("max_event")}`;
              },
            }),
            defineComputedJoin({
              $joinName: "within",
              $params: {
                distance: "number",
                tableName: { type: "string", optional: true },
                useId: { type: "boolean", optional: true },
              },
              $sql: ({ left, right, params, asValue }) => {
                params.distance satisfies number;
                params.tableName satisfies string | undefined;
                // @ts-expect-error Undeclared params must not be accessible.
                params.missing;
                // @ts-expect-error Numeric params must not be inferred as strings or any.
                params.distance satisfies string;
                // @ts-expect-error Optional params may be undefined.
                params.tableName satisfies string;
                return `${left("table_name")} = ${asValue(params.tableName ?? "members")} AND ${left("owner")} ->> 'id' = ${right("id")}::text AND ${left("id")} <= ${right(params.useId ? "id" : "max_event")} + ${asValue(params.distance)}`;
              },
            }),
          ],
        },
        {
          tables: ["members", "labels"],
          override: true,
          on: [
            {
              $joinName: "default",
              $sql: ({ left, right }) =>
                `${left("id")} = ${right("member_id")} AND ${right("id")} < 0`,
            },
          ],
        },
        ...viewPairs
          .flatMap<[string, string]>(({ memberView, eventView }) => [
            [memberView, "events"],
            ["members", eventView],
          ])
          .map((tables): Join => ({
            tables,
            on: [
              {
                $joinName: "default",
                $sql: ({ left, right }) => `${left("id")}::text = ${right("owner")} ->> 'id'`,
              },
            ],
          })),
      ],
      publish: {
        members: { select: { fields: { id: 1 } } },
        events: { select: { fields: { id: 1, label: 1 }, forcedFilter: { visible: true } } },
      },
      tableConfig: {
        members: {
          getJoins: (tables) => {
            assert(tables.some((table) => table.name === "events"));
            return [
              {
                tables: ["events", "members"],
                on: [
                  {
                    $joinName: "default",
                    $sql: ({ left, right }) =>
                      `${left("table_name")} = 'members' AND ${left("owner")} ->> 'id' = ${right("id")}::text`,
                  },
                ],
              },
            ];
          },
        },
      },
      onReady: () => {},
    });
    try {
      const members = instance.db.members!;
      const historyPath = [{ table: "events", on: "default" }];
      const withinPath = [{ table: "events", on: "within", params: { distance: -1 } }];
      const selfPath = [{ table: "members", on: "next_member", params: { step: 1 } }];
      const reversedSelfPath = reverseParsedPath(selfPath, "members");
      const linkedHistoryPath = [{ table: "members" }, ...withinPath];
      const linkedMembers = instance.db.member_links!;
      // Direct paths, foreign-key detours and reversed self-joins must return the same history.
      for (const path of [
        historyPath,
        [{ table: "member_links" }, { table: "members" }, ...historyPath],
        [...selfPath, ...reversedSelfPath, ...historyPath],
      ]) {
        // Apply pagination separately to each member's joined rows.
        assert.deepEqual(
          await members.find!(
            {},
            {
              select: {
                id: 1,
                history: {
                  $leftJoin: path,
                  select: { id: 1 },
                  orderBy: { id: -1 },
                  limit: 1,
                  offset: 1,
                },
              },
              orderBy: "id",
            },
          ),
          [
            { id: 1, history: [{ id: 2 }] },
            { id: 2, history: [{ id: 4 }] },
            { id: 3, history: [] },
          ],
        );
        // Inner joins must discard members whose aggregate fails HAVING.
        assert.deepEqual(
          await members.find!(
            {},
            {
              select: {
                id: 1,
                history: {
                  $innerJoin: path,
                  select: { total: { $count: [] } },
                  having: { total: { $gte: 3 } },
                },
              },
            },
          ),
          [{ id: 1, history: [{ total: 3 }] }],
        );
        // NOT EXISTS must retain only members with no matching history.
        assert.deepEqual(
          await members.find!(
            {
              $notExistsJoined: { path, filter: {} },
            },
            { select: { id: 1 } },
          ),
          [{ id: 3 }],
        );
        // Ordering by a joined column must also order the parent rows.
        assert.deepEqual(
          (
            await members.find!(
              {},
              {
                select: { id: 1, history: { $leftJoin: path, select: { id: 1 } } },
                orderBy: [{ key: "history.id", asc: false, nulls: "last" }],
              },
            )
          ).map((row) => row.id),
          [2, 1, 3],
        );
      }
      // Preserve computed-join params after an inferred foreign-key hop.
      assert.deepEqual(
        await linkedMembers.find!(
          {},
          {
            select: {
              id: 1,
              history: { $leftJoin: linkedHistoryPath, select: { id: 1 }, orderBy: "id" },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ id: 1 }, { id: 2 }] },
          { id: 2, history: [] },
          { id: 3, history: [] },
        ],
      );
      // Reversing a mixed path must preserve its params for joins and EXISTS filters.
      const reversedLinkedHistory = reverseParsedPath(
        [{ table: "members", on: [{ member_id: "id" }] }, ...withinPath],
        "member_links",
      );
      assert.deepEqual(
        await instance.db.events!.find!(
          {},
          {
            select: { id: 1, links: { $innerJoin: reversedLinkedHistory, select: { id: 1 } } },
            orderBy: "id",
          },
        ),
        [
          { id: 1, links: [{ id: 1 }] },
          { id: 2, links: [{ id: 1 }] },
        ],
      );
      assert.deepEqual(
        await instance.db.events!.find!(
          {
            $existsJoined: { path: reversedLinkedHistory, filter: { id: 1 } },
          },
          { select: { id: 1 }, orderBy: "id" },
        ),
        [{ id: 1 }, { id: 2 }],
      );
      // A computed self-join can sit between two ordinary foreign-key hops.
      assert.deepEqual(
        await linkedMembers.find!(
          {},
          {
            select: {
              id: 1,
              next: {
                $leftJoin: [{ table: "members" }, ...selfPath, { table: "member_links" }],
                select: { id: 1 },
              },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, next: [{ id: 2 }] },
          { id: 2, next: [{ id: 3 }] },
          { id: 3, next: [] },
        ],
      );
      // Validate required params even when the computed join is a later hop.
      await assert.rejects(
        () =>
          linkedMembers.find!(
            {},
            {
              select: {
                history: {
                  $leftJoin: [{ table: "members" }, { table: "events", on: "within", params: {} }],
                  select: "*",
                },
              },
            },
          ),
        { message: /Invalid computed join params/ },
      );
      // Reversing a self-join must switch from the next member to the previous member.
      assert.deepEqual(reversedSelfPath, [{ ...selfPath[0], reversed: true }]);
      assert.deepEqual(
        await members.findOne!(
          { id: 1 },
          {
            select: { next: { $leftJoin: selfPath, select: { id: 1 } } },
          },
        ),
        { next: [{ id: 2 }] },
      );
      assert.deepEqual(
        await members.find!(
          { $existsJoined: { path: reversedSelfPath, filter: { id: 1 } } },
          { select: { id: 1 } },
        ),
        [{ id: 2 }],
      );
      assert.deepEqual(
        await members.findOne!(
          { id: 2 },
          {
            select: { previous: { $leftJoin: reversedSelfPath, select: { id: 1 } } },
          },
        ),
        { previous: [{ id: 1 }] },
      );
      // The explicit reversed flag is valid only for computed self-joins.
      await assert.rejects(
        () =>
          members.find!(
            {},
            {
              select: {
                history: { $leftJoin: [{ ...historyPath[0]!, reversed: true }], select: "*" },
              },
            },
          ),
        { message: /computed self-join/ },
      );
      // Do not infer an unnamed route through a computed join.
      await assert.rejects(() =>
        members.find!(
          {},
          {
            select: { history: { $leftJoin: ["labels", ...historyPath], select: "*" } },
          },
        ),
      );
      // Params must restrict matching rows in both forward joins and reversed EXISTS filters.
      assert.deepEqual(
        await members.find!(
          {},
          {
            select: { id: 1, history: { $leftJoin: withinPath, select: { id: 1 }, orderBy: "id" } },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ id: 1 }, { id: 2 }] },
          { id: 2, history: [] },
          { id: 3, history: [] },
        ],
      );
      assert.deepEqual(
        await instance.db.events!.find!(
          {
            $existsJoined: { path: reverseParsedPath(withinPath, "members"), filter: {} },
          },
          { select: { id: 1 }, orderBy: "id" },
        ),
        [{ id: 1 }, { id: 2 }],
      );
      // Reads and subscriptions must reject malformed, missing or undeclared params.
      for (const params of [
        undefined,
        null,
        [],
        new Date(),
        1,
        "invalid",
        {},
        { distance: "1" },
        { distance: NaN },
        { distance: Infinity },
        { distance: 1, extra: true },
      ]) {
        const invalidPath = [{ table: "events", on: "within", params }] as JoinPath[];
        await assert.rejects(
          () =>
            members.find!(
              {},
              {
                select: { history: { $leftJoin: invalidPath, select: "*" } },
              },
            ),
          { message: /Invalid computed join params/ },
        );
        await assert.rejects(
          () =>
            members.subscribe!(
              {
                $existsJoined: { path: invalidPath, filter: {} },
              },
              {},
              () => {},
            ),
          { message: /Invalid computed join params/ },
        );
      }
      // A computed join without a params schema must reject supplied params.
      await assert.rejects(
        () =>
          members.find!(
            {},
            {
              select: {
                history: {
                  $leftJoin: [{ table: "events", on: "default", params: { distance: 1 } }],
                  select: "*",
                },
              },
            },
          ),
        { message: /Invalid computed join params/ },
      );
      // Ordinary column joins must reject params too.
      await assert.rejects(
        () =>
          instance.db.labels!.find!(
            {},
            {
              select: {
                member: {
                  $leftJoin: [{ table: "members", on: [{ member_id: "id" }], params: {} }],
                  select: "*",
                },
              },
            },
          ),
        { message: /Join params require a computed join/ },
      );
      // SQL-like parameter values must remain literals and never broaden the join.
      assert.deepEqual(
        await members.find!({
          $existsJoined: {
            path: [
              {
                table: "events",
                on: "within",
                params: { distance: 1, tableName: "members' OR TRUE --" },
              },
            ],
            filter: {},
          },
        }),
        [],
      );
      // A default computed override must replace the inferred foreign-key condition.
      assert.deepEqual(
        await members.find!(
          { id: 1 },
          {
            select: { id: 1, labels: "*" },
          },
        ),
        [{ id: 1, labels: [] }],
      );
      // Limit and offset apply per parent, while left joins retain parents without matches.
      assert.deepEqual(
        await members.find!(
          {},
          {
            select: {
              id: 1,
              history: { $leftJoin: historyPath, select: { id: 1 }, orderBy: { id: -1 }, limit: 1 },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ id: 3 }] },
          { id: 2, history: [{ id: 5 }] },
          { id: 3, history: [] },
        ],
      );
      assert.deepEqual(
        await members.find!(
          {},
          {
            select: {
              id: 1,
              history: {
                $leftJoin: historyPath,
                select: { id: 1 },
                orderBy: { id: -1 },
                limit: 1,
                offset: 1,
              },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ id: 2 }] },
          { id: 2, history: [{ id: 4 }] },
          { id: 3, history: [] },
        ],
      );
      // Filter joined rows before excluding unmatched parents from an inner join.
      assert.deepEqual(
        await members.find!(
          {},
          {
            select: {
              id: 1,
              history: {
                $innerJoin: historyPath,
                select: { id: 1 },
                filter: { visible: true },
                orderBy: "id",
              },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ id: 1 }, { id: 2 }] },
          { id: 2, history: [{ id: 4 }, { id: 5 }] },
        ],
      );
      // Aggregate each member's history independently, leaving unmatched history empty.
      assert.deepEqual(
        await members.find!(
          {},
          {
            select: {
              id: 1,
              history: { $leftJoin: historyPath, select: { total: { $count: [] } } },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ total: 3 }] },
          { id: 2, history: [{ total: 2 }] },
          { id: 3, history: [] },
        ],
      );
      // Sort parent rows by joined values, placing parents without history last.
      assert.deepEqual(
        (
          await members.find!(
            {},
            {
              select: { id: 1, history: { $leftJoin: historyPath, select: { id: 1 } } },
              orderBy: [{ key: "history.id", asc: false, nulls: "last" }],
            },
          )
        ).map((row) => row.id),
        [2, 1, 3],
      );
      // Preserve user-defined aggregate aliases in joined results.
      assert.deepEqual(
        await members.findOne!(
          { id: 1 },
          {
            select: { history: { $leftJoin: historyPath, select: { projected: { $count: [] } } } },
          },
        ),
        { history: [{ projected: 3 }] },
      );
      // HAVING removes joined aggregates without removing the left-joined parent.
      assert.deepEqual(
        await members.find!(
          {},
          {
            select: {
              id: 1,
              history: {
                $leftJoin: historyPath,
                select: { total: { $count: [] } },
                having: { total: { $gte: 3 } },
              },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ total: 3 }] },
          { id: 2, history: [] },
          { id: 3, history: [] },
        ],
      );
      // Joined pagination may order by a column omitted from the projection.
      assert.deepEqual(
        await members.findOne!(
          { id: 1 },
          {
            select: {
              history: {
                $leftJoin: historyPath,
                select: { label: 1 },
                orderBy: { id: -1 },
                limit: 1,
              },
            },
          },
        ),
        { history: [{ label: "private" }] },
      );
      // Existence filters must support both the default join and a named reverse join.
      assert.deepEqual(
        await members.find!(
          {
            $notExistsJoined: { path: historyPath, filter: {} },
          },
          { select: { id: 1 } },
        ),
        [{ id: 3 }],
      );
      assert.deepEqual(
        await instance.db.events!.find!(
          {
            $existsJoined: { path: [{ table: "members", on: "before" }], filter: {} },
          },
          { select: { id: 1 }, orderBy: "id" },
        ),
        [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      );
      // Reject unknown join names and implicit paths through computed joins.
      await assert.rejects(
        () =>
          members.find!(
            {},
            {
              select: { events: { $leftJoin: [{ table: "events", on: "missing" }], select: "*" } },
            },
          ),
        { message: /Unknown or ambiguous computed join/ },
      );
      await assert.rejects(() => instance.db.events!.find!({}, { select: { labels: "*" } }));

      // Observe delivered rows and verify the columns tracked by subscription triggers.
      const subscriptions: { unsubscribe: () => unknown }[] = [];
      const watch = async (
        table: typeof members,
        filter: AnyObject,
        params: SubscribeParams,
        published = false,
        expectedTrackedColumns?: Record<string, string[]>,
      ) => {
        let observedRows: AnyObject[] | undefined;
        let subscriptionError: unknown;
        let pushCount = 0;
        const handler = table as unknown as TableHandler;
        const rules =
          published ?
            await handler.dboBuilder.publishParser!.getValidatedRequestRuleWusr(
              {
                tableName: handler.name,
                command: "find",
                clientReq: clientRequest,
              },
              undefined,
            )
          : undefined;
        const subscription = await handler.subscribe(
          filter,
          params,
          (rows, error) => {
            pushCount++;
            observedRows = rows;
            subscriptionError = error;
          },
          rules,
          published ? { clientReq: clientRequest } : undefined,
        );
        assert("unsubscribe" in subscription && typeof subscription.unsubscribe === "function");
        const { unsubscribe } = subscription;
        subscriptions.push({ unsubscribe: () => unsubscribe() });
        if (expectedTrackedColumns) {
          const manager = await handler.dboBuilder.getPubSubManager();
          const subscribed = manager.subs.at(-1)!;
          for (const [tableName, expectedColumns] of Object.entries(expectedTrackedColumns)) {
            const triggers = subscribed.triggers.filter(
              (trigger) => trigger.table_name === tableName,
            );
            assert(triggers.length, `Missing subscription trigger for ${tableName}`);
            assert(
              triggers.every((trigger) => trigger.tracked_columns),
              `${tableName} tracks all columns`,
            );
            const trackedColumns = new Set(triggers.flatMap((trigger) => trigger.tracked_columns!));
            assert.deepEqual([...trackedColumns].sort(), [...expectedColumns].sort(), tableName);
          }
        }
        const waitForRows = async (expectedRows: AnyObject[]) => {
          const deadline = Date.now() + 10_000;
          while (!isDeepStrictEqual(observedRows, expectedRows)) {
            if (subscriptionError) throw subscriptionError;
            if (Date.now() >= deadline) assert.deepEqual(observedRows, expectedRows);
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        };
        return Object.assign(waitForRows, { getPushCount: () => pushCount });
      };
      try {
        // Track only the columns used by the SQL branch selected by the join params.
        const parameterColumns = await watch(
          members,
          { id: 2 },
          {
            select: {
              history: {
                $leftJoin: [
                  { table: "events", on: "within", params: { distance: 3, useId: true } },
                ],
                select: { id: 1 },
                orderBy: "id",
              },
            },
          },
          false,
          { members: ["id"], events: ["id", "owner", "table_name"] },
        );
        await parameterColumns([{ history: [{ id: 4 }, { id: 5 }] }]);
        // Reversed self-join subscriptions must track the previous member's selected columns.
        const previousMember = await watch(
          members,
          { id: 2 },
          { select: { previous: { $leftJoin: reversedSelfPath, select: { max_event: 1 } } } },
          false,
          { members: ["id", "max_event"] },
        );
        await previousMember([{ previous: [{ max_event: 3 }] }]);
        // A self-EXISTS filter must also track fields selected from the root row.
        const selfExists = await watch(
          members,
          { $existsJoined: { path: reversedSelfPath, filter: { id: 1 } } },
          { select: { max_event: 1 } },
        );
        await selfExists([{ max_event: 4 }]);
        await members.update!({ id: 2 }, { max_event: 5 });
        await selfExists([{ max_event: 5 }]);
        await members.update!({ id: 2 }, { max_event: 4 });
        await selfExists([{ max_event: 4 }]);
        // Changes to an intermediate member must refresh joined rows and EXISTS results.
        const linked = await watch(
          linkedMembers,
          { id: 1 },
          {
            select: { history: { $leftJoin: linkedHistoryPath, select: { id: 1 }, orderBy: "id" } },
          },
          false,
          {
            member_links: ["id", "member_id"],
            members: ["id", "max_event"],
            events: ["id", "owner", "table_name"],
          },
        );
        const linkedExists = await watch(
          linkedMembers,
          {
            id: 1,
            $existsJoined: { path: linkedHistoryPath, filter: {} },
          },
          { select: { id: 1 } },
        );
        await linked([{ history: [{ id: 1 }, { id: 2 }] }]);
        await linkedExists([{ id: 1 }]);
        await members.update!({ id: 1 }, { max_event: 1 });
        await previousMember([{ previous: [{ max_event: 1 }] }]);
        await linked([{ history: [] }]);
        await linkedExists([]);
        await members.update!({ id: 1 }, { max_event: 3 });
        await linked([{ history: [{ id: 1 }, { id: 2 }] }]);
        await linkedExists([{ id: 1 }]);
        // Paginated subscriptions must track join, filter, ordering and selected columns.
        const history: SubscribeParams = {
          select: {
            id: 1,
            history: {
              $leftJoin: withinPath,
              select: { label: 1 },
              filter: { visible: true },
              orderBy: "id",
              limit: 1,
            },
          },
        };
        const joined = await watch(members, { id: 1 }, history, false, {
          members: ["id", "max_event"],
          events: ["id", "label", "owner", "table_name", "visible"],
        });
        await joined([{ id: 1, history: [{ label: "first" }] }]);
        // Updates to an unused column must not send redundant subscription results.
        const pushesBeforeUnrelatedUpdate = joined.getPushCount();
        await instance.db.events!.update!({ id: 1 }, { secret: "unselected" });
        await new Promise((resolve) => setTimeout(resolve, 250));
        assert.equal(joined.getPushCount(), pushesBeforeUnrelatedUpdate);
        await instance.db.events!.update!({ id: 1 }, { secret: "hidden" });
        // Track computed joins inside EXISTS, NOT EXISTS and selected CASE expressions.
        const existsFilter = { $existsJoined: { path: withinPath, filter: { visible: true } } };
        const exists = await watch(
          members,
          existsFilter,
          { select: { id: 1 }, orderBy: "id" },
          false,
          {
            members: ["id", "max_event"],
            events: ["id", "owner", "table_name", "visible"],
          },
        );
        const notExists = await watch(
          members,
          {
            $notExistsJoined: existsFilter.$existsJoined,
          },
          { select: { id: 1 }, orderBy: "id" },
        );
        const expression = await watch(
          members,
          { id: 1 },
          {
            select: {
              hasHistory: { $case: [[existsFilter, true]], $else: false },
            },
          },
          false,
          {
            members: ["id", "max_event"],
            events: ["id", "owner", "table_name", "visible"],
          },
        );
        // Compare table subscriptions with views used as either the root or join target.
        const allHistory = await watch(
          members,
          { id: 1 },
          {
            select: {
              history: { $leftJoin: historyPath, select: { label: 1 }, orderBy: "id", limit: 1 },
            },
          },
        );
        const viewRoots = [];
        const viewTargets = [];
        for (const { memberView, eventView } of viewPairs) {
          viewRoots.push(
            await watch(
              instance.db[memberView]!,
              { id: 1 },
              {
                select: {
                  history: { $leftJoin: "events", select: { label: 1 }, orderBy: "id", limit: 1 },
                },
              },
            ),
          );
          viewTargets.push(
            await watch(
              members,
              { id: 1 },
              {
                select: {
                  history: { $leftJoin: eventView, select: { label: 1 }, orderBy: "id", limit: 1 },
                },
              },
            ),
          );
        }
        // Published subscriptions must apply target field restrictions and forced filters.
        const published = await watch(
          members,
          { id: 1 },
          {
            select: {
              history: {
                $leftJoin: [{ table: "events", on: "within", params: { distance: 100 } }],
                select: "*",
                orderBy: "id",
              },
            },
          },
          true,
          {
            members: ["id", "max_event"],
            events: ["id", "label", "owner", "table_name", "visible"],
          },
        );
        await joined([{ id: 1, history: [{ label: "first" }] }]);
        await exists([{ id: 1 }]);
        await notExists([{ id: 2 }, { id: 3 }]);
        await expression([{ hasHistory: true }]);
        await published([
          {
            history: [
              { id: 1, label: "first" },
              { id: 2, label: "second" },
            ],
          },
        ]);
        await Promise.all(
          [allHistory, ...viewRoots, ...viewTargets].map((wait) =>
            wait([{ history: [{ label: "first" }] }]),
          ),
        );

        // Changing ownership, selected values or visibility must refresh affected results.
        await instance.db.events!.update!({ id: 1 }, { owner: { id: 2 } });
        await joined([{ id: 1, history: [{ label: "second" }] }]);
        await exists([{ id: 1 }, { id: 2 }]);
        await notExists([{ id: 3 }]);
        await published([{ history: [{ id: 2, label: "second" }] }]);
        await instance.db.events!.update!({ id: 1 }, { owner: { id: 1 }, label: "renamed" });
        await joined([{ id: 1, history: [{ label: "renamed" }] }]);
        await instance.db.events!.update!({ id: 1 }, { label: "first", visible: false });
        await joined([{ id: 1, history: [{ label: "second" }] }]);
        await published([{ history: [{ id: 2, label: "second" }] }]);
        await instance.db.events!.update!({ id: 1 }, { visible: true });
        await joined([{ id: 1, history: [{ label: "first" }] }]);

        // Changing the root join condition must refresh rows, EXISTS and CASE projections.
        await members.update!({ id: 1 }, { max_event: 1 });
        await joined([{ id: 1, history: [] }]);
        await exists([]);
        await notExists([{ id: 1 }, { id: 2 }, { id: 3 }]);
        await expression([{ hasHistory: false }]);
        await members.update!({ id: 1 }, { max_event: 3 });
        await joined([{ id: 1, history: [{ label: "first" }] }]);

        // Reordering, inserting and deleting target rows must refresh each limited result.
        await instance.db.events!.update!({ id: 2 }, { id: 0 });
        await joined([{ id: 1, history: [{ label: "second" }] }]);
        await instance.db.events!.update!({ id: 0 }, { id: 2 });
        await joined([{ id: 1, history: [{ label: "first" }] }]);
        await instance.db.events!.insert!({
          id: 0,
          table_name: "members",
          owner: { id: 1 },
          visible: true,
          label: "inserted",
        });
        await joined([{ id: 1, history: [{ label: "inserted" }] }]);
        await published([
          {
            history: [
              { id: 0, label: "inserted" },
              { id: 1, label: "first" },
              { id: 2, label: "second" },
            ],
          },
        ]);
        await Promise.all(
          [allHistory, ...viewRoots, ...viewTargets].map((wait) =>
            wait([{ history: [{ label: "inserted" }] }]),
          ),
        );
        await instance.db.events!.delete!({ id: 0 });
        await joined([{ id: 1, history: [{ label: "first" }] }]);
        await Promise.all(
          [allHistory, ...viewRoots, ...viewTargets].map((wait) =>
            wait([{ history: [{ label: "first" }] }]),
          ),
        );
        // Base-table updates must remove and restore rows filtered out by a root view.
        await members.update!({ id: 1 }, { max_event: 0 });
        await Promise.all(viewRoots.map((wait) => wait([])));
        await members.update!({ id: 1 }, { max_event: 3 });
        await Promise.all(viewRoots.map((wait) => wait([{ history: [{ label: "first" }] }])));
      } finally {
        await Promise.all(subscriptions.map((subscription) => subscription.unsubscribe()));
      }

      // Multi-hop client joins must enforce target row filters and column permissions.
      const client = await instance.getClientDBHandlers(clientRequest, undefined);
      const clientMembers = client.clientDb.members!;
      const nextHistoryPath = [...selfPath, ...historyPath];
      assert.deepEqual(
        await clientMembers.find!(
          {},
          {
            select: { id: 1, history: { $leftJoin: nextHistoryPath, select: "*", orderBy: "id" } },
            orderBy: "id",
          },
        ),
        [
          {
            id: 1,
            history: [
              { id: 4, label: "fourth" },
              { id: 5, label: "fifth" },
            ],
          },
          { id: 2, history: [] },
          { id: 3, history: [] },
        ],
      );
      assert.deepEqual(
        await clientMembers.find!({
          $existsJoined: { path: [...reversedSelfPath, ...historyPath], filter: { id: 3 } },
        }),
        [],
      );
      await assert.rejects(() =>
        clientMembers.find!(
          {},
          {
            select: { history: { $leftJoin: nextHistoryPath, select: { secret: 1 } } },
          },
        ),
      );
      // Expose serializable join names and param schemas only for published tables.
      assert.deepEqual(client.clientSchema.joins.map((join) => join.on).sort(), [
        "before",
        "default",
        "next_member",
        "within",
      ]);
      const withinJoin = client.clientSchema.joins.find((join) => join.on === "within")!;
      assert.deepEqual(
        client.clientSchema.joins.find((join) => join.on === "default"),
        {
          tables: ["events", "members"],
          on: "default",
          supportsMultiHop: true,
        } satisfies ClientJoin,
      );
      assert.deepEqual(withinJoin, {
        tables: ["events", "members"],
        on: "within",
        paramsSchema: {
          distance: "number",
          tableName: { type: "string", optional: true },
          useId: { type: "boolean", optional: true },
        },
        supportsMultiHop: true,
      });
      assert.deepEqual(
        JSON.parse(JSON.stringify(client.clientSchema.joins)),
        client.clientSchema.joins,
      );
      // Clients can build paths from discovered metadata; the server still validates params.
      const discoveredPath = [
        {
          table: withinJoin.tables.find((table) => table !== "members")!,
          on: withinJoin.on,
          params: { distance: 100 },
        },
      ];
      await assert.rejects(
        () =>
          clientMembers.find!(
            {},
            {
              select: {
                history: {
                  $leftJoin: [{ table: "events", on: "within", params: { distance: "1" } }],
                  select: "*",
                },
              },
            },
          ),
        { message: /Invalid computed join params/ },
      );
      assert.deepEqual(
        await clientMembers.find!(
          { id: 1 },
          {
            select: {
              history: {
                $leftJoin: discoveredPath,
                select: "*",
                orderBy: "id",
              },
            },
          },
        ),
        [
          {
            history: [
              { id: 1, label: "first" },
              { id: 2, label: "second" },
            ],
          },
        ],
      );
      // Apply forced filters before per-parent pagination and inside EXISTS filters.
      assert.deepEqual(
        await clientMembers.find!(
          {},
          {
            select: {
              id: 1,
              history: { $leftJoin: historyPath, select: "*", orderBy: { id: -1 }, limit: 1 },
            },
            orderBy: "id",
          },
        ),
        [
          { id: 1, history: [{ id: 2, label: "second" }] },
          { id: 2, history: [{ id: 5, label: "fifth" }] },
          { id: 3, history: [] },
        ],
      );
      assert.deepEqual(
        await clientMembers.find!({
          $existsJoined: { path: historyPath, filter: { id: 3 } },
        }),
        [],
      );
      await assert.rejects(() =>
        clientMembers.find!({
          $existsJoined: { path: historyPath, filter: { secret: "hidden" } },
        }),
      );
      // Private join-column aliases must work in either direction through table expressions.
      await instance.update({
        publish: {
          members: { select: { fields: { id: 1 } } },
          events: {
            select: withTableExpression(
              { fields: { id: 1 }, forcedFilter: { visible: true } },
              () => ({
                expression: "(SELECT id, table_name, owner AS private_owner, visible FROM events)",
                joinColumns: { owner: "private_owner" },
              }),
            ),
          },
        },
      });
      const aliasedClient = await instance.getClientDBHandlers(clientRequest, undefined);
      for (const [rootTable, path, expectedId] of [
        ["members", nextHistoryPath, 4],
        ["events", [{ table: "members", on: "default" }, ...selfPath], 2],
        ["members", [...historyPath, { table: "members", on: "default" }], 1],
      ] as const) {
        assert.deepEqual(
          await aliasedClient.clientDb[rootTable]!.find!(
            { id: 1 },
            {
              select: {
                joined: { $leftJoin: [...path], select: { id: 1 }, orderBy: "id", limit: 1 },
              },
            },
          ),
          [{ joined: [{ id: expectedId }] }],
        );
        assert.deepEqual(
          await aliasedClient.clientDb[rootTable]!.find!(
            {
              id: 1,
              $existsJoined: { path: [...path], filter: { id: expectedId } },
            },
            { select: { id: 1 } },
          ),
          [{ id: 1 }],
        );
      }
      // Disabling multi-hop joins must reject every path through that table, locally and remotely.
      await instance.update({
        tableConfig: {
          ...instance.options.tableConfig,
          members: { ...instance.options.tableConfig?.members, allowMultiHopJoins: false },
        },
        publish: {
          members: { select: "*" },
          events: { select: "*" },
          member_links: { select: "*" },
        },
      });
      const blockedClient = await instance.getClientDBHandlers(clientRequest, undefined);
      assert(blockedClient.clientSchema.joins.length);
      assert(blockedClient.clientSchema.joins.every((join) => !join.supportsMultiHop));
      for (const handlers of [instance.db, blockedClient.clientDb]) {
        for (const { table, path } of [
          { table: "members", path: nextHistoryPath },
          {
            table: "events",
            path: [{ table: "members", on: "default" }, { table: "member_links" }],
          },
          { table: "member_links", path: [{ table: "members" }, ...selfPath] },
          { table: "members", path: [{ table: "member_links" }, { table: "members" }] },
        ]) {
          await assert.rejects(
            () =>
              handlers[table]!.find!(
                {},
                {
                  select: { joined: { $leftJoin: path, select: "*" } },
                },
              ),
            { message: /Multi-hop joins are disabled for table: members/ },
          );
          await assert.rejects(
            () =>
              handlers[table]!.find!({
                $existsJoined: { path, filter: {} },
              }),
            { message: /Multi-hop joins are disabled for table: members/ },
          );
        }
      }
      // Disabling multi-hop joins must still permit direct computed and foreign-key joins.
      assert.deepEqual(
        await blockedClient.clientDb.members!.findOne!(
          { id: 1 },
          {
            select: {
              history: { $leftJoin: historyPath, select: { id: 1 }, orderBy: "id", limit: 1 },
            },
          },
        ),
        { history: [{ id: 1 }] },
      );
      assert.deepEqual(
        await blockedClient.clientDb.member_links!.findOne!(
          { id: 1 },
          {
            select: { member: { $leftJoin: "members", select: { id: 1 } } },
          },
        ),
        { member: [{ id: 1 }] },
      );
      // Unpublishing a target must remove its join metadata and reject access through old handlers.
      await instance.update({
        tableConfig: {
          ...instance.options.tableConfig,
          members: { ...instance.options.tableConfig?.members, allowMultiHopJoins: true },
        },
        publish: { members: { select: "*" } },
      });
      const restrictedClient = await instance.getClientDBHandlers(clientRequest, undefined);
      await assert.rejects(() =>
        restrictedClient.clientDb.members!.find!(
          {},
          {
            select: { history: { $leftJoin: nextHistoryPath, select: "*" } },
          },
        ),
      );
      assert.deepEqual(
        restrictedClient.clientSchema.joins.map((join) => join.on),
        ["next_member"],
      );
      await assert.rejects(() =>
        clientMembers.find!(
          {},
          {
            select: { events: "*" },
          },
        ),
      );
      // Validate column references when installing a computed join configuration.
      await assert.rejects(
        () =>
          instance.update({
            tableConfig: {
              members: {
                getJoins: () => [
                  {
                    tables: ["events", "members"],
                    on: [
                      { $joinName: "invalid", $sql: ({ left }) => `${left("missing")} IS NULL` },
                    ],
                  },
                ],
              },
            },
          }),
        /Invalid computed join column/,
      );
      await context.test(
        "handles notification rejections after an invalid configuration update",
        { timeout: 5_000 },
        async (notificationContext) => {
          const logError = console.error;
          const notificationError = new Promise<unknown>((resolve) => {
            notificationContext.mock.method(
              console,
              "error",
              (message: unknown, ...details: unknown[]) => {
                logError(message, ...details);
                if (message === "PostgresNotifListenManager: Notification listener failed:") {
                  resolve(details[0]);
                }
              },
            );
          });
          const pubSubManager = await (
            members as unknown as TableHandler
          ).dboBuilder.getPubSubManager();
          assert(pubSubManager.postgresNotifListenManager?.isReady);
          await db.any("SELECT pg_notify($1, $2)", [
            NOTIF_CHANNEL.getFull(pubSubManager.appId),
            NOTIF_TYPE.data_trigger_change,
          ]);
          assert.match(
            String(await notificationError),
            /Invalid computed join column: events.missing/,
          );
        },
      );
    } finally {
      await instance.destroy();
      await db.none('DROP SCHEMA computed_join_test, "computed_join.views" CASCADE');
    }
  });
};

type NestedJoinPlan = {
  "Relation Name": string | undefined;
  "Index Name": string | undefined;
  "Index Cond": string | undefined;
  "Actual Rows": number;
  "Actual Loops": number;
  Plans: NestedJoinPlan[] | undefined;
};

const getNestedJoinScans = async (db: DB, statement: unknown, table: string) => {
  assert(typeof statement === "string");
  const explain = await db.one<{ "QUERY PLAN": { Plan: NestedJoinPlan }[] }>(
    `EXPLAIN (ANALYZE, FORMAT JSON) ${statement}`,
  );
  const [queryPlan] = explain["QUERY PLAN"];
  assert(queryPlan);
  return flattenNestedJoinPlan(queryPlan.Plan).filter((node) => node["Relation Name"] === table);
};

const flattenNestedJoinPlan = (node: NestedJoinPlan): NestedJoinPlan[] => [
  node,
  ...(node.Plans ?? []).flatMap(flattenNestedJoinPlan),
];

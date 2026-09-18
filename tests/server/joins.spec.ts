import { strict as assert } from "node:assert";
import { test } from "node:test";
import prostgles, { type ProstglesInitOptions } from "prostgles-server";
import type { Join } from "prostgles-server/dist/ProstglesTypes";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";

export const testJoins = async (db: DB) => {
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
          type: "many-many",
          ...(override && { override }),
        };
        const instance = await prostgles({
          dbConnection: {
            ...getConnectionDetails(db),
            options: "-c search_path=join_merge_test,public",
          } as unknown as ProstglesInitOptions["dbConnection"],
          schemaFilter: { join_merge_test: 1 },
          joins: [join],
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
          type: "many-many",
        },
        {
          tables: ["managed_members", "managed_members"],
          on: [overrideOn],
          type: "many-many",
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
};

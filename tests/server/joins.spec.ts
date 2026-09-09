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
};

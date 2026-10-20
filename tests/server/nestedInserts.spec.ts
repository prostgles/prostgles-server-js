import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import prostgles, {
  type InitResult,
  type ProstglesInitOptions,
} from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";

export const testNestedInserts = async (db: DB) => {
  await test("Nested inserts enforce child rules and roll back postValidate failures", async () => {
    const schema = `nested_${randomUUID().replaceAll("-", "")}`;
    const parentTable = `${schema}.parents`;
    const childTable = `${schema}.children`;
    const allowedNestedInsert = { table: parentTable, column: "parent_id" };
    let instance: InitResult | undefined;
    try {
      await db.none(`
        CREATE SCHEMA ${schema};
        CREATE TABLE ${parentTable} (id SERIAL PRIMARY KEY, name TEXT);
        CREATE TABLE ${childTable} (
          id SERIAL PRIMARY KEY,
          parent_id INTEGER REFERENCES ${parentTable}(id),
          other_parent_id INTEGER REFERENCES ${parentTable}(id),
          name TEXT
        );
      `);
      instance = await prostgles({
        dbConnection: getConnectionDetails(
          db,
        ) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 },
        joins: "inferred",
        auth: {
          getUser: () => undefined,
          findUser: () => ({ id: "alice", type: "user" }),
        },
        publish: () => ({
          [parentTable]: {
            insert: {
              fields: ["name"],
              returningFields: "*",
              requiredNestedInserts: [
                { ftable: childTable, minRows: 1, maxRows: 1 },
              ],
            },
          },
          [childTable]: {
            insert: {
              fields: ["parent_id", "other_parent_id", "name"],
              returningFields: "*",
              allowedNestedInserts: [allowedNestedInsert],
              postValidate: async ({ row, dbx, localParams }) => {
                const parent = await dbx[parentTable]!.findOne({
                  id: row.parent_id,
                });
                assert.equal(
                  localParams.nestedInsert?.previousData.id,
                  row.parent_id,
                );
                assert.equal(localParams.nestedInsert?.depth, 1);
                assert.equal(
                  localParams.nestedInsert.referencingColumn,
                  allowedNestedInsert.column,
                );
                assert.equal(
                  parent?.name,
                  row.name,
                  "Child must match its parent",
                );
              },
            },
          },
        }),
        onReady: () => {},
      });
      const { clientDb } = await instance.getClientDBHandlers(
        { userId: "alice" },
        undefined,
      );
      const parent = await clientDb[parentTable]!.insert!(
        { name: "valid", [childTable]: [{ name: "valid" }] },
        { returning: "*" },
      );
      await assert.rejects(
        clientDb[childTable]!.insert!({ parent_id: parent.id, name: "valid" }),
        (error: unknown) => JSON.stringify(error).includes("Direct inserts not allowed"),
      );
      await assert.rejects(
        clientDb[parentTable]!.insert!({ name: "missing child" }),
      );
      await assert.rejects(
        clientDb[parentTable]!.insert!({
          name: "invalid",
          [childTable]: [{ name: "mismatch" }],
        }),
      );

      allowedNestedInsert.column = "other_parent_id";
      const secondParent = await clientDb[parentTable]!.insert!(
        { name: "second reference", [childTable]: [{ name: "second reference" }] },
        { returning: "*" },
      );
      const childReferences = await db.one(
        `SELECT parent_id, other_parent_id FROM ${childTable} WHERE name = 'second reference'`,
      );
      assert.deepEqual(childReferences, {
        parent_id: secondParent.id,
        other_parent_id: secondParent.id,
      });

      for (const disallowedReference of [
        { table: parentTable, column: "name" },
        { table: childTable, column: "other_parent_id" },
      ]) {
        Object.assign(allowedNestedInsert, disallowedReference);
        await assert.rejects(
          clientDb[parentTable]!.insert!({
            name: "disallowed reference",
            [childTable]: [{ name: "disallowed reference" }],
          }),
          (error: unknown) => JSON.stringify(error).includes("Direct inserts not allowed"),
        );
      }
      const counts = await db.one(`
        SELECT (SELECT count(*)::int FROM ${parentTable}) AS parents,
               (SELECT count(*)::int FROM ${childTable}) AS children
      `);
      assert.deepEqual(counts, { parents: 2, children: 2 });
    } finally {
      await instance?.destroy();
      await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
};

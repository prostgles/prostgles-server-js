import { strict as assert } from "node:assert";
import { test } from "node:test";
import pgPromise from "pg-promise";
import { asName } from "prostgles-types";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { ProstglesInitOptions } from "prostgles-server";

export const testTableConfigValidation = async (parentDb: DB) => {
  await test("tableConfig JSONB checks survive PubSub initialization and upgrades", async () => {
    const database = `table_config_validation_${process.pid}_${Date.now()}`;
    await parentDb.none(`CREATE DATABASE ${asName(database)}`);
    const pgp = pgPromise();
    const dbConnection = { ...getConnectionDetails(parentDb), database };
    const db = pgp(dbConnection as unknown as Parameters<typeof pgp>[0]);
    let instance: Awaited<ReturnType<Prostgles["init"]>> | undefined;
    try {
      for (const scenario of ["missing versions", "outdated version", "legacy versions"]) {
        if (scenario === "outdated version") {
          await db.none("UPDATE prostgles.versions SET version = '0.0.0', schema_md5 = 'outdated'");
        } else if (scenario === "legacy versions") {
          await db.none("ALTER TABLE prostgles.versions DROP COLUMN schema_md5");
        }
        const prgl = new Prostgles({
          dbConnection: dbConnection as ProstglesInitOptions["dbConnection"],
          tableConfig: {
            validated: {
              columns: {
                id: "INTEGER PRIMARY KEY",
                value: { jsonbSchemaType: { enabled: { type: "boolean" } } },
              },
            },
          },
          onReady: () => {},
        });
        instance = await prgl.init(() => {}, { type: "init" });
        const getChecks = () => db.any(
          "SELECT oid, conname FROM pg_constraint WHERE conrelid = 'validated'::regclass AND contype = 'c'",
        );
        const checks = await getChecks();
        assert.equal(checks.length, 1, scenario);
        const invalidInsert = () => db.none(
          `INSERT INTO validated VALUES (2, '{"enabled":"invalid"}')`,
        );
        await assert.rejects(invalidInsert, { code: "P0001" });

        // A first subscription initializes PubSub after tableConfig has installed its CHECK.
        const subscription = await instance.db.validated!.subscribe!({}, {}, () => {});
        await subscription.unsubscribe();
        assert.deepEqual(await getChecks(), checks, scenario);
        await db.none("DELETE FROM validated");
        await db.none(`INSERT INTO validated VALUES (1, '{"enabled":true}')`);
        await assert.rejects(invalidInsert, { code: "P0001" });
        await assert.rejects(
          db.none(`UPDATE validated SET value = '{"enabled":"invalid"}' WHERE id = 1`),
          { code: "P0001" },
        );
        await instance.destroy();
        instance = undefined;
      }
    } finally {
      await instance?.destroy();
      await db.$pool.end();
      await parentDb.none(`DROP DATABASE ${asName(database)}`);
    }
  });
};

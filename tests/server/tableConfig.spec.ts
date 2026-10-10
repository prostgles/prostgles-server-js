import { strict as assert } from "node:assert";
import { test } from "node:test";
import pgPromise from "pg-promise";
import { asName } from "prostgles-types";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { ProstglesInitOptions, TableCheck, TableConfig } from "prostgles-server";
import { checkGeneratedTypes } from "./checkGeneratedTypes";
import {
  getTableCheckBranches,
  getTableCheckConstraint,
} from "prostgles-server/dist/TableConfig/getTableCheck";

export const testTableConfigValidation = async (parentDb: DB) => {
  await test("tableConfig checks enforce and infer row variants", async () => {
    const database = `table_check_${process.pid}_${Date.now()}`;
    await parentDb.none(`CREATE DATABASE ${asName(database)}`);
    const pgp = pgPromise();
    const dbConnection = { ...getConnectionDetails(parentDb), database };
    const db = pgp(dbConnection as unknown as Parameters<typeof pgp>[0]);
    const columns = {
      id: "BIGSERIAL PRIMARY KEY",
      state: "TEXT",
      size: "INT4",
      error: "TEXT",
      finished_at: "TIMESTAMPTZ",
      group_id: "INT REFERENCES backup_groups(id)",
      metadata: "TEXT",
    };
    const check: TableCheck = {
      $or: [
        { state: "loading", metadata: {} },
        {
          state: "finished",
          size: { $ne: null },
          error: { enum: [null] },
          finished_at: { $ne: null },
        },
        { state: "error", error: { $ne: null }, finished_at: { $ne: null } },
      ],
    };
    const tableConfig: TableConfig = {
      backup_groups: { columns: { id: "INT PRIMARY KEY" } },
      backup_jobs: {
        columns: {
          id: "INT PRIMARY KEY",
          group_id: "INT REFERENCES backup_groups(id)",
          state: "TEXT",
        },
        check: { $or: [{ state: "queued", group_id: { $ne: null } }] },
      },
      backups: { columns, check },
    };
    let instance: Awaited<ReturnType<Prostgles["init"]>> | undefined;
    const start = async () => {
      const prgl = new Prostgles({
        dbConnection: dbConnection as ProstglesInitOptions["dbConnection"],
        tableConfig,
        publish: [{ name: "BackupClientSchema", userTypes: ["user"], publish: "*" }],
        onReady: () => {},
      });
      try {
        instance = await prgl.init(() => {}, { type: "init" });
      } catch (error) {
        await prgl.dbForSchema?.$pool.end();
        throw error;
      }
      return prgl;
    };
    try {
      // tableConfig retains existing columns that are absent from its column definitions.
      await db.none("CREATE TABLE backups (unmanaged TEXT)");
      const prgl = await start();
      await db.none("INSERT INTO backup_groups VALUES (1)");
      await db.none("INSERT INTO backup_jobs VALUES (1, 1, 'queued')");
      await assert.rejects(db.none("INSERT INTO backup_jobs VALUES (2, 2, 'queued')"), {
        code: "23503",
      });
      await assert.rejects(db.none("INSERT INTO backup_jobs VALUES (2, 1, 'invalid')"), {
        code: "23514",
      });
      const backups = prgl.dbo!.backups!;
      const checkColumns = backups.columns.map((c) => ({
        name: c.name,
        nullable: c.is_nullable,
        udt_name: c.udt_name,
      }));
      assert.deepEqual(
        getTableCheckConstraint("backups", getTableCheckBranches(check, checkColumns)),
        getTableCheckConstraint(
          "backups",
          getTableCheckBranches(check, checkColumns.slice().reverse()),
        ),
      );
      for (const invalid of [
        { $or: [] },
        { $or: [{ missing: "value" }] },
        { $or: [{ state: { enum: [] } }] },
        { $or: [{ state: { $ne: "loading" } }] },
        { $or: [{ $or: [{ state: "loading" }] }] },
        { $or: [{ state: { enum: ["loading"], $ne: null } }] },
        { $or: [{ state: 42 }] },
      ]) {
        assert.throws(() => getTableCheckBranches(invalid as unknown as TableCheck, checkColumns));
      }
      const loading = await backups.insert(
        { state: "loading", unmanaged: "kept", metadata: "upload" },
        { returning: "*" },
      );
      assert.equal(loading.size, null);
      assert.equal(loading.unmanaged, "kept");
      assert.equal(loading.metadata, "upload");
      await backups.insert({ state: "loading", metadata: null });
      assert.equal(typeof loading.id, "string");
      await backups.insert({ state: "finished", size: 42, finished_at: "2026-01-01" });
      await backups.insert({ state: "error", error: "failed", finished_at: "2026-01-01" });
      for (const row of [
        { state: null },
        { state: "unknown" },
        { state: "loading", size: 1 },
        { state: "loading", error: "failed" },
        { state: "loading", finished_at: "2026-01-01" },
        { state: "finished", finished_at: "2026-01-01" },
        { state: "finished", size: 1 },
        { state: "finished", size: 1, finished_at: "2026-01-01", error: "failed" },
        { state: "error", finished_at: "2026-01-01" },
        { state: "finished", size: 1, finished_at: "2026-01-01", metadata: "upload" },
      ]) {
        await assert.rejects(db.none(pgp.helpers.insert(row, undefined, "backups")), {
          code: "23514",
        });
      }
      await assert.rejects(
        db.none("UPDATE backups SET state = 'finished' WHERE state = 'loading'"),
        { code: "23514" },
      );
      const { tsSchema } = await backups.dboBuilder.getTsDefinitions();
      checkGeneratedTypes(
        tsSchema,
        `
        import type { TableHandler } from "prostgles-types";
        declare const db: TableHandler<DBGeneratedSchema, "backups">;
        declare const client: TableHandler<BackupClientSchema, "backups">;
        declare const row: DBSchema["backups"];
        if (row.state === "loading") {
          row.size satisfies null;
          row.error satisfies null;
          row.finished_at satisfies null;
          row.id satisfies string;
          row.unmanaged satisfies string | null;
          row.metadata satisfies string | null;
          // @ts-expect-error explicitly unconstrained metadata is not forced to null
          row.metadata satisfies null;
          // @ts-expect-error unmanaged nullable columns are not forced to null
          row.unmanaged satisfies null;
        }
        const queries = async () => {
          const rows = [
            (await db.find())[0]!, (await db.findOne())!,
            (await db.find({}, { select: ["state", "size", "error", "finished_at"] }))[0]!,
            (await db.find({}, { select: { state: 1, size: 1, error: 1, finished_at: 1 } }))[0]!,
            (await db.find({}, { select: { id: 0 } }))[0]!,
            (await db.insert({ state: "loading" }, { returning: { state: 1, size: 1, error: 1, finished_at: 1 } }))!,
            (await db.update({}, { state: "loading" }, { multi: false, returning: { id: 0 } }))!,
            (await client.find())[0]!,
          ];
          for (const result of rows) {
            if (result.state === "finished") {
              result.size satisfies number;
              result.error satisfies null;
              result.finished_at satisfies string;
              // @ts-expect-error int4 is numeric
              result.size satisfies string;
            } else if (result.state === "error") {
              result.size satisfies null;
              result.error satisfies string;
            }
          }
          const explicit = await db.find({}, { select: { related: { $leftJoin: "backups", select: { state: 1, size: 1 } } } });
          const shorthand = await db.find({}, { select: { backups: { state: 1, size: 1 } } });
          const excluded = await db.find({}, { select: { backups: { id: 0 } } });
          for (const joined of [explicit[0]!.related[0]!, shorthand[0]!.backups[0]!, excluded[0]!.backups[0]!]) {
            if (joined.state === "finished") joined.size satisfies number;
          }
          // @ts-expect-error finished rows need size and finished_at
          await db.insert({ state: "finished" });
          // @ts-expect-error loading rows cannot have a size
          await client.insert({ state: "loading", size: 1 });
        };
        declare const finished: Extract<DBSchema["backups"], { state: "finished" }>;
        finished.metadata satisfies null;
      `,
      );
      const getCheck = () =>
        db.one(
          "SELECT oid FROM pg_constraint WHERE conrelid = 'backups'::regclass AND conname = 'prostgles_row_check'",
        );
      const originalCheck = await getCheck();
      await instance!.destroy();
      instance = undefined;
      await start();
      assert.deepEqual(await getCheck(), originalCheck);
      const subscription = await instance!.db.backups!.subscribe!({}, {}, () => {});
      await subscription.unsubscribe();
      assert.deepEqual(await getCheck(), originalCheck);
      await instance!.destroy();
      instance = undefined;
      tableConfig.backups = {
        columns,
        check: {
          $or: [
            ...check.$or,
            { state: { enum: ["queued", "err'or"] } },
            { state: "number", size: { enum: [0, 1] } },
          ],
        },
      };
      await start();
      await db.none("INSERT INTO backups(state) VALUES ('queued'), ($1)", ["err'or"]);
      await db.none("INSERT INTO backups(state, size) VALUES ('number', 0), ('number', 1)");
      await assert.rejects(db.none("INSERT INTO backups(state, size) VALUES ('number', 2)"), {
        code: "23514",
      });
      await assert.rejects(db.none("INSERT INTO backups(state) VALUES (NULL)"), { code: "23514" });
      await instance!.destroy();
      instance = undefined;
      tableConfig.backups = { columns };
      await start();
      await db.none("INSERT INTO backups(state, size) VALUES ('anything', 1)");
      assert.equal(
        await db.oneOrNone(
          "SELECT 1 FROM pg_constraint WHERE conrelid = 'backups'::regclass AND conname = 'prostgles_row_check'",
        ),
        null,
      );
    } finally {
      await instance?.destroy();
      await db.$pool.end();
      await parentDb.none(`DROP DATABASE ${asName(database)}`);
    }
  });

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
        const getChecks = () =>
          db.any(
            "SELECT oid, conname FROM pg_constraint WHERE conrelid = 'validated'::regclass AND contype = 'c'",
          );
        const checks = await getChecks();
        assert.equal(checks.length, 1, scenario);
        const invalidInsert = () =>
          db.none(`INSERT INTO validated VALUES (2, '{"enabled":"invalid"}')`);
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

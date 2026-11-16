import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pgPromise from "pg-promise";
import { asName } from "prostgles-types";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import {
  loadTableConfigMigrations,
  type ProstglesInitOptions,
  type TableConfigMigration,
} from "prostgles-server";

export const testTableConfigMigrations = async (parentDb: DB) => {
  await test("tableConfig migrations roll back data, schema, triggers and history before retrying", async () => {
    await withMigrationDatabase(parentDb, async ({ db, start }) => {
      const originalConfig = {
        previous_records: {
          columns: { id: "INT PRIMARY KEY", label: "TEXT", value: "INT" },
        },
      };
      await start({
        tableConfig: originalConfig,
        tableConfigMigrations: {
          version: 1,
          onMigrate: () => assert.fail("Fresh databases must skip legacy migrations"),
        },
      });
      await db.none("INSERT INTO previous_records VALUES (1, 'original', NULL)");
      let migrationsRun = 0;
      const tableConfigMigrations = {
        version: 2,
        onMigrate: async ({ db: transaction }: Parameters<TableConfigMigration["run"]>[0]) => {
          migrationsRun++;
          await transaction.none(
            "ALTER TABLE previous_records RENAME TO records; UPDATE records SET label = 'migrated'",
          );
        },
      };
      const tableConfig = {
        records: {
          columns: {
            id: "INT PRIMARY KEY",
            label: "TEXT",
            value: "INT NOT NULL",
          },
        },
      };
      await assert.rejects(start({ tableConfig, tableConfigMigrations }), /contains null values/);
      assert.deepEqual(await db.one("SELECT * FROM previous_records"), {
        id: 1,
        label: "original",
        value: null,
      });
      assert.equal((await db.one("SELECT MAX(id) AS version FROM schema_version")).version, "1");
      assert.equal((await db.one("SELECT to_regclass('records') AS name")).name, null);

      tableConfig.records.columns.value = "INT NOT NULL DEFAULT 0";
      const brokenTriggers = {
        invalid_migration_trigger: {
          type: "before" as const,
          actions: ["insert" as const],
          forEach: "row" as const,
          query: "invalid trigger body",
        },
      };
      await assert.rejects(
        start({
          tableConfig: {
            records: { ...tableConfig.records, triggers: brokenTriggers },
          },
          tableConfigMigrations,
        }),
      );
      assert.equal((await db.one("SELECT label FROM previous_records")).label, "original");
      assert.equal((await db.one("SELECT MAX(id) AS version FROM schema_version")).version, "1");

      await start({ tableConfig, tableConfigMigrations });
      await start({ tableConfig, tableConfigMigrations });
      assert.equal(migrationsRun, 3);
      assert.deepEqual(await db.one("SELECT * FROM records"), {
        id: 1,
        label: "migrated",
        value: 0,
      });
      assert.equal((await db.one("SELECT MAX(id) AS version FROM schema_version")).version, "2");
      await assert.rejects(
        start({
          tableConfig: originalConfig,
          tableConfigMigrations: { ...tableConfigMigrations, version: 1 },
        }),
        /newer than requested/,
      );
      assert.equal((await db.one("SELECT to_regclass('previous_records') AS name")).name, null);
      const onlineIndexUpgrade = {
        tableConfig: {
          records: {
            ...tableConfig.records,
            indexes: {
              records_label_idx: { columns: "label", concurrently: true },
            },
          },
        },
        tableConfigMigrations: {
          version: 3,
          onMigrate: async ({ db: transaction }: Parameters<TableConfigMigration["run"]>[0]) => {
            await transaction.none("UPDATE records SET label = 'indexed'");
          },
        },
      };
      await assert.rejects(start(onlineIndexUpgrade), /cannot run inside a migration transaction/);
      assert.equal((await db.one("SELECT label FROM records")).label, "migrated");
      await db.none("CREATE INDEX CONCURRENTLY records_label_idx ON records(label)");
      await start(onlineIndexUpgrade);
      assert.equal((await db.one("SELECT label FROM records")).label, "indexed");
    });
  });

  await test("tableConfig migrations serialize concurrent fresh starts and upgrades", async () => {
    await withMigrationDatabase(parentDb, async ({ db, start }) => {
      const tableConfig = {
        records: {
          columns: { id: "INT PRIMARY KEY", value: "INT NOT NULL DEFAULT 0" },
        },
      };
      const initial = {
        tableConfig,
        tableConfigMigrations: {
          versionTableName: 'Migration "history',
          version: 1,
          onMigrate: () => assert.fail("Fresh migration ran"),
        },
      };
      await Promise.all([start(initial), start(initial)]);
      await db.none("INSERT INTO records(id) VALUES (1)");
      let migrationsRun = 0;
      const upgrade = {
        tableConfig,
        tableConfigMigrations: {
          versionTableName: initial.tableConfigMigrations.versionTableName,
          version: 2,
          onMigrate: async ({ db: transaction }: Parameters<TableConfigMigration["run"]>[0]) => {
            migrationsRun++;
            await transaction.any("UPDATE records SET value = value + 1; SELECT pg_sleep(0.1)");
          },
        },
      };
      await Promise.all([start(upgrade), start(upgrade)]);
      assert.equal(migrationsRun, 1);
      assert.equal((await db.one("SELECT value FROM records")).value, 1);
      assert.equal(
        (
          await db.one(
            `SELECT count(*)::int AS count FROM ${asName(initial.tableConfigMigrations.versionTableName)}`,
          )
        ).count,
        2,
      );
    });
  });

  await test("tableConfig migrations only suppress explicit silentFail and keep audit mandatory", async () => {
    await withMigrationDatabase(parentDb, async ({ db, start }) => {
      const tableConfig = {
        records: { columns: { id: "INT PRIMARY KEY", value: "TEXT" } },
      };
      await start({
        tableConfig,
        tableConfigMigrations: { version: 1, onMigrate: () => {} },
      });
      const failure = new Error("migration intentionally failed");
      const tableConfigMigrations = {
        version: 2,
        onMigrate: () => {
          throw failure;
        },
      };
      await assert.rejects(
        start({ tableConfig, tableConfigMigrations }),
        /migration intentionally failed/,
      );
      await assert.rejects(
        start({
          tableConfig,
          tableConfigMigrations: {
            ...tableConfigMigrations,
            silentFail: false,
          },
        }),
        /migration intentionally failed/,
      );
      let mounted = false;
      await start({
        tableConfig: {
          records: {
            ...tableConfig.records,
            onMount: async ({ dbo }) => {
              assert.deepEqual(await dbo.records!.find(), []);
              mounted = true;
            },
          },
        },
        tableConfigMigrations: { ...tableConfigMigrations, silentFail: true },
      });
      assert.equal(mounted, true);
      await assert.rejects(
        start({
          tableConfig,
          tableConfigMigrations: { ...tableConfigMigrations, silentFail: true },
          audit: { tableName: "audit_history", tables: { records: 1 } },
        }),
        /migration intentionally failed/,
      );
      assert.equal((await db.one("SELECT MAX(id) AS version FROM schema_version")).version, "1");
    });
  });

  await test("tableConfig numbered migrations baseline fresh databases and execute pending files in numeric order", async () => {
    await withMigrationDatabase(parentDb, async ({ db, start }) => {
      const tableConfig = {
        records: {
          columns: { id: "INT PRIMARY KEY", value: "INT NOT NULL DEFAULT 0" },
        },
      };
      const first: TableConfigMigration = {
        name: "0001_initial.js",
        checksum: "initial",
        run: () => assert.fail("Baselined migration ran"),
      };
      await start({
        tableConfig,
        tableConfigMigrations: { migrations: [first] },
      });
      await db.none("INSERT INTO records(id) VALUES (1)");
      const versions: (number | undefined)[] = [];
      const migrations: TableConfigMigration[] = [
        {
          name: "10_multiply.js",
          checksum: "multiply",
          run: async ({ db: transaction, oldVersion }) => {
            versions.push(oldVersion);
            await transaction.none("UPDATE records SET value = value * 10");
          },
        },
        first,
        {
          name: "2_add.js",
          checksum: "add",
          run: async ({ db: transaction, oldVersion }) => {
            versions.push(oldVersion);
            await transaction.none(
              "UPDATE records SET value = value + 1; CREATE VIEW migration_records_view AS SELECT * FROM records",
            );
          },
        },
      ];
      await start({ tableConfig, tableConfigMigrations: { migrations } });
      await start({ tableConfig, tableConfigMigrations: { migrations } });
      assert.deepEqual(versions, [1, 2]);
      assert.equal((await db.one("SELECT value FROM records")).value, 10);
      assert.equal((await db.one("SELECT value FROM migration_records_view")).value, 10);
      assert.deepEqual(
        await db.any(
          "SELECT id, baselined, applied_at IS NOT NULL AS recorded FROM schema_version ORDER BY id",
        ),
        [
          { id: "1", baselined: true, recorded: true },
          { id: "2", baselined: false, recorded: true },
          { id: "10", baselined: false, recorded: true },
        ],
      );
      const modified = migrations.map((migration) => ({
        ...migration,
        checksum: "changed",
      }));
      await assert.rejects(
        start({ tableConfig, tableConfigMigrations: { migrations: modified } }),
        /missing or modified/,
      );
      await assert.rejects(
        start({
          tableConfig,
          tableConfigMigrations: {
            migrations: migrations.filter(({ name }) => name !== first.name),
          },
        }),
        /missing or modified/,
      );
      await assert.rejects(
        start({
          tableConfig,
          tableConfigMigrations: {
            migrations: [...migrations, { ...first, name: "3_inserted.js" }],
          },
        }),
        /inserted below/,
      );
      await assert.rejects(
        start({
          tableConfig,
          tableConfigMigrations: {
            migrations: [...migrations, { ...first, name: "01_duplicate.js" }],
          },
        }),
        /Duplicate migration version/,
      );
      await assert.rejects(
        start({ tableConfig, tableConfigMigrations: { migrations: [first] } }),
        /newer than requested/,
      );
      await assert.rejects(
        start({
          tableConfig,
          tableConfigMigrations: {
            migrations: [{ ...first, name: "invalid.js" }],
          },
        }),
        /Invalid numbered migration/,
      );
    });
  });

  await test("tableConfig numbered migrations require explicit adoption and roll back failed batches", async () => {
    await withMigrationDatabase(parentDb, async ({ db, start }) => {
      const tableConfig = {
        records: { columns: { id: "INT PRIMARY KEY", value: "INT" } },
      };
      await db.none(
        "CREATE TABLE records (id INT PRIMARY KEY, value INT); INSERT INTO records VALUES (1, 0)",
      );
      const first: TableConfigMigration = {
        name: "1_initial.js",
        checksum: "initial",
        run: () => assert.fail("Adopted migration ran"),
      };
      await assert.rejects(
        start({ tableConfig, tableConfigMigrations: { migrations: [first] } }),
        /explicit baseline/,
      );
      assert.equal((await db.one("SELECT to_regclass('schema_version') AS name")).name, null);
      await start({
        tableConfig,
        tableConfigMigrations: { version: 1, onMigrate: () => {} },
      });
      await assert.rejects(
        start({ tableConfig, tableConfigMigrations: { migrations: [first] } }),
        /explicit baseline/,
      );
      await start({
        tableConfig,
        tableConfigMigrations: { migrations: [first], baseline: 1 },
      });
      let shouldFail = true;
      const migrations: TableConfigMigration[] = [
        first,
        {
          name: "2_update.js",
          checksum: "update",
          run: async ({ db: transaction }) => {
            await transaction.none("UPDATE records SET value = 2");
          },
        },
        {
          name: "3_failure.js",
          checksum: "failure",
          run: () => {
            if (shouldFail) throw new Error("batch failed");
          },
        },
      ];
      await assert.rejects(
        start({ tableConfig, tableConfigMigrations: { migrations } }),
        /batch failed/,
      );
      assert.equal((await db.one("SELECT value FROM records")).value, 0);
      assert.equal((await db.one("SELECT MAX(id) AS version FROM schema_version")).version, "1");
      shouldFail = false;
      await start({ tableConfig, tableConfigMigrations: { migrations } });
      assert.equal((await db.one("SELECT value FROM records")).value, 2);
    });
  });

  await test("tableConfig numbered migrations require a baseline for tables outside the search path", async () => {
    await withMigrationDatabase(parentDb, async ({ db, start }) => {
      await db.none("CREATE SCHEMA existing_app; CREATE TABLE existing_app.records (id INT)");
      const migrations: TableConfigMigration[] = [
        {
          name: "1_initial.js",
          checksum: "initial",
          run: () => assert.fail("Baselined migration ran"),
        },
      ];
      await assert.rejects(start({ tableConfigMigrations: { migrations } }), /explicit baseline/);
      await start({ tableConfigMigrations: { migrations, baseline: 1 } });
      assert.equal((await db.one("SELECT baselined FROM schema_version")).baselined, true);
    });
  });

  await test("tableConfig migration files load CommonJS and ES modules with content checksums", async () => {
    const directory = await mkdtemp(path.join(__dirname, "migration-fixtures-"));
    try {
      await writeFile(
        path.join(directory, "0001_initial.cjs"),
        "exports.default = async () => {};\n",
      );
      await writeFile(path.join(directory, "0010_update.mjs"), "export default async () => {};\n");
      await writeFile(
        path.join(directory, "0002_update.cjs"),
        "module.exports = async () => {};\n",
      );
      await writeFile(path.join(directory, "0002_update.d.ts"), "export {};\n");
      const migrations = await loadTableConfigMigrations(directory);
      assert.deepEqual(
        migrations.map(({ name }) => name),
        ["0001_initial.cjs", "0002_update.cjs", "0010_update.mjs"],
      );
      assert.ok(migrations.every(({ checksum }) => checksum.length === 64));
      assert.deepEqual(await loadTableConfigMigrations(directory), migrations);
      await withMigrationDatabase(parentDb, async ({ db, start }) => {
        await start({ tableConfigMigrations: { migrations } });
        assert.equal((await db.one("SELECT MAX(id) AS version FROM schema_version")).version, "10");
      });
      /* Changed CommonJS and ES modules must not receive checksums for cached callbacks. */
      for (const { name } of migrations) {
        const filename = path.join(directory, name);
        const source = await readFile(filename, "utf8");
        await writeFile(filename, `${source}\n`);
        await assert.rejects(
          loadTableConfigMigrations(directory),
          /changed after loading.*restart/,
        );
        await writeFile(filename, source);
      }
      await writeFile(path.join(directory, "3_invalid.cjs"), "module.exports = 42;\n");
      await assert.rejects(loadTableConfigMigrations(directory), /must export a default callback/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
};

const withMigrationDatabase = async (
  parentDb: DB,
  run: (args: {
    db: DB;
    start: (options: Partial<ProstglesInitOptions>) => Promise<void>;
  }) => Promise<void>,
) => {
  const database = `table_config_migrations_${process.pid}_${Date.now()}`;
  await parentDb.none(`CREATE DATABASE ${asName(database)}`);
  const pgp = pgPromise();
  const dbConnection = {
    ...getConnectionDetails(parentDb),
    database,
    max: 1,
    options: "-c lock_timeout=5000",
  };
  const db = pgp(dbConnection as unknown as Parameters<typeof pgp>[0]);
  const start = async (options: Partial<ProstglesInitOptions>) => {
    const prgl = new Prostgles({
      dbConnection: dbConnection as ProstglesInitOptions["dbConnection"],
      disableRealtime: true,
      onReady: () => {},
      ...options,
    });
    let instance: Awaited<ReturnType<Prostgles["init"]>> | undefined;
    try {
      instance = await prgl.init(() => {}, { type: "init" });
    } finally {
      if (instance) await instance.destroy();
      else {
        await prgl.adminClient?.end();
        await prgl.dbForSchema?.$pool.end();
      }
    }
  };
  try {
    await run({ db, start });
  } finally {
    await db.$pool.end();
    await parentDb.none(`DROP DATABASE ${asName(database)} WITH (FORCE)`);
  }
};

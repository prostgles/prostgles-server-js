import { strict as assert } from "node:assert";
import { test } from "node:test";
import pgPromise from "pg-promise";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AUDIT_TABLE_COLUMNS,
  AUDIT_TABLE_COLUMN_DEFINITIONS,
  type AuditTableRow,
} from "prostgles-server";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { PublishParser } from "prostgles-server/dist/PublishParser/PublishParser";
import {
  AUDIT_TRIGGER_PREFIX,
  TABLE_CONFIG_TRIGGER_PREFIX,
} from "prostgles-server/dist/TableConfig/managedTriggerNames";
import type {
  SchemaConfigAudit,
  TableDefinition,
  ProstglesInitOptions,
} from "prostgles-server";

// Keep the public schema and column inference checked alongside the integration tests.
const typedAudit: SchemaConfigAudit<{
  items: { columns: { id: {}; secret: {} } };
}> = {
  tableName: "events",
  tables: { items: { idColumns: ["id"], excludeColumns: ["secret"] } },
};
const invalidColumn: typeof typedAudit = {
  tableName: "events",
  tables: {
    items: {
      // @ts-expect-error Unknown column
      idColumns: ["missing"],
    },
  },
};
void invalidColumn;

export async function testAudit(parentDb: DB) {
  await test(
    "Managed audit setup, row history, protection and query readiness",
    { timeout: 60000 },
    async () => {
      await parentDb.none("CREATE SCHEMA audit_test_main");
      const pgp = pgPromise();
      const dbConnection = {
        ...getConnectionDetails(parentDb),
        options: "-c search_path=audit_test_main,public",
      };
      const db = pgp(dbConnection as unknown as Parameters<typeof pgp>[0]);
      const dir = await mkdtemp(join(tmpdir(), "prostgles-audit-"));
      const sqlFilePath = join(dir, "init.sql");
      await writeFile(
        sqlFilePath,
        `
      CREATE SCHEMA IF NOT EXISTS audit_test;
      CREATE TABLE IF NOT EXISTS audit_test_existing (id int PRIMARY KEY, value text);
      CREATE TABLE IF NOT EXISTS audit_test_child (id int PRIMARY KEY, parent int REFERENCES audit_test_existing ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS audit_test_nopk (key text, secret text);
      CREATE TABLE IF NOT EXISTS audit_test_partitioned (id int PRIMARY KEY) PARTITION BY RANGE (id);
      CREATE TABLE IF NOT EXISTS audit_test_partition PARTITION OF audit_test_partitioned FOR VALUES FROM (0) TO (100);
      CREATE OR REPLACE VIEW audit_test_view AS SELECT * FROM audit_test_existing;
    `,
      );
      const audit: SchemaConfigAudit = {
        tableName: `audit_events`,
        tables: {
          audit_test_source: {
            entityType: "source",
            excludeColumns: ["secret"],
          },
          audit_test_existing: 1,
          audit_test_child: 1,
          audit_test_nopk: { idColumns: ["key"], excludeColumns: ["secret"] },
        },
      };
      let pauseSchema = false;
      let releaseSchema: (() => void) | undefined;
      let schemaStarted: (() => void) | undefined;
      const prgl = new Prostgles({
        dbConnection: getConnectionDetails(
          db,
        ) as unknown as ProstglesInitOptions["dbConnection"],
        sqlFilePath,
        audit,
        transactions: true,
        schemaFilter: { audit_test_main: 1, audit_test: 1 },
        tableConfig: {
          audit_test_source: {
            columns: {
              a: "int NOT NULL",
              b: "text NOT NULL",
              value: "text",
              secret: "text",
            },
            constraints: ["PRIMARY KEY (a, b)"],
            triggers: {
              audit_test_custom: {
                type: "after",
                actions: ["insert"],
                forEach: "row",
                query: "BEGIN RETURN NULL; END;",
              },
            },
            onMount: async ({ dbo }) => {
              await dbo.audit_test_source!.insert!({
                a: 100,
                b: "mount",
                value: "mounted",
              });
            },
          },
        },
        onLog: async (event) => {
          if (
            pauseSchema &&
            event.type === "debug" &&
            event.command === "DboBuilder.getTablesForSchemaPostgresSQL"
          ) {
            pauseSchema = false;
            schemaStarted?.();
            await new Promise<void>((resolve) => {
              releaseSchema = resolve;
            });
          }
        },
        onReady: () => {},
      });
      let result: Awaited<ReturnType<typeof prgl.init>> | undefined;
      try {
        result = await prgl.init(() => {}, { type: "init" });
        const source = result.db.audit_test_source!;
        prgl.opts.tableConfig.audit_events = {};
        assert.throws(() => prgl.mergedTableConfig, /cannot also be defined/);
        delete prgl.opts.tableConfig.audit_events;
        const sourceConfig = prgl.opts.tableConfig.audit_test_source as TableDefinition;
        for (const prefix of [AUDIT_TRIGGER_PREFIX, TABLE_CONFIG_TRIGGER_PREFIX]) {
          const name = prefix + "user_trigger";
          sourceConfig.triggers[name] = sourceConfig.triggers.audit_test_custom;
          assert.throws(() => prgl.mergedTableConfig, /prefix reserved for prostgles/);
          delete sourceConfig.triggers[name];
        }
        await result.sql(`CREATE OR REPLACE FUNCTION audit_test_manual() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END;';
          CREATE TRIGGER audit_test_manual AFTER INSERT ON audit_test_source FOR EACH ROW EXECUTE FUNCTION audit_test_manual();`);
        const originalAudit = prgl.opts.audit;
        prgl.opts.audit = { ...audit, tableName: '"audit_events"' };
        assert.throws(() => prgl.mergedTableConfig, /must exactly match/);
        prgl.opts.audit = originalAudit;
        assert.equal(prgl.resolvedAuditConfig?.tableName, audit.tableName);
        assert.deepEqual(prgl.resolvedAuditConfig?.tables.audit_test_source, {
          entityType: "source",
          idColumns: ["a", "b"],
          excludeColumns: ["secret"],
        });
        assert.deepEqual(prgl.resolvedAuditConfig?.tables.audit_test_nopk, {
          entityType: "audit_test_nopk",
          idColumns: ["key"],
          excludeColumns: ["secret"],
        });
        assert.equal(prgl.resolvedAuditConfig?.tables[audit.tableName], undefined);
        assert(!("audit" in prgl.mergedTableConfig.tableConfig.audit_test_source));
        const originalModifyClientSchema = prgl.opts.modifyClientSchema;
        let auditCallbacks = 0;
        prgl.opts.modifyClientSchema = (table, tableConfig, userData, resolvedAuditConfig) => {
          assert.deepEqual(resolvedAuditConfig, prgl.resolvedAuditConfig);
          auditCallbacks++;
          return table;
        };
        await source.getInfo!();
        await source.getColumns!();
        assert.equal(auditCallbacks, 2);
        prgl.opts.modifyClientSchema = originalModifyClientSchema;
        const mergedTriggers = prgl.mergedTableConfig.tableConfig.audit_test_source.triggers;
        assert(mergedTriggers.audit_test_custom);
        assert(Object.keys(mergedTriggers).some((name) => name.startsWith(AUDIT_TRIGGER_PREFIX)));

        const history = () =>
          db.any(`SELECT * FROM "audit_events" ORDER BY id`);
        assert.equal((await history())[0].new_row.value, "mounted");
        assert.deepEqual(
          Object.keys((await history())[0]),
          AUDIT_TABLE_COLUMNS,
        );
        assert.deepEqual(
          Object.keys(AUDIT_TABLE_COLUMN_DEFINITIONS),
          AUDIT_TABLE_COLUMNS,
        );
        const auditRow: AuditTableRow = (await history())[0];
        assert.equal(auditRow.operation, "INSERT");
        assert.equal(
          Object.keys(prgl.mergedTableConfig.tableConfig)[0],
          audit.tableName,
        );
        // Comments are ordinary metadata and have no role in reconciliation or publishing.
        await result.sql(
          `COMMENT ON TABLE "audit_events" IS 'History shown in the UI'`,
        );
        // Avoid duplicate bootstrap rows on subsequent initialization.
        (prgl.opts.tableConfig.audit_test_source as TableDefinition).onMount =
          async () => {};
        await source.insert!({
          a: 1,
          b: "one",
          value: "before",
          secret: "never stored",
        });
        await source.update!({ a: 1 }, { secret: "also excluded" });
        assert.equal((await history()).length, 2);
        await source.update!({ a: 1 }, { a: 2, value: "after" });
        await source.delete!({ a: 2 });
        const rows = await history();
        assert.deepEqual(rows[2].old_id, { a: 1, b: "one" });
        assert.deepEqual(rows[2].new_id, { a: 2, b: "one" });
        assert.equal(rows[2].entity_type, "source");
        assert.equal(rows[3].operation, "DELETE");
        assert.equal(rows[3].new_row, null);
        assert(!JSON.stringify(rows).includes("secret"));
        await assert.rejects(
          prgl.dboBuilder.getTX(async (tx) => {
            await tx.audit_test_source!.insert!({ a: 5, b: "rollback" });
            throw new Error("rollback");
          }),
          /rollback/,
        );
        assert.equal((await history()).length, 4);
        await result.sql(
          `INSERT INTO audit_test_existing VALUES (1, 'raw'); INSERT INTO audit_test_child VALUES (1, 1); DELETE FROM audit_test_existing WHERE id = 1;`,
        );
        assert.equal(
          (await history()).filter((r) => r.operation === "DELETE").length,
          3,
        );
        await result.sql(
          `BEGIN; SET LOCAL "prostgles.user" = '{"id":"actor"}'; INSERT INTO audit_test_nopk VALUES ('k', 'hidden'); COMMIT;`,
        );
        assert.deepEqual((await history()).at(-1).actor, { id: "actor" });
        for (const sql of [
          `UPDATE "audit_events" SET entity_type = 'tampered'`,
          `DELETE FROM "audit_events"`,
          `TRUNCATE "audit_events"`,
          "TRUNCATE audit_test_source",
        ]) {
          await assert.rejects(result.sql(sql), {
            message: /Audit protection/,
          });
        }
        const parser = new PublishParser(prgl);
        const auditName = prgl.dboBuilder.tables.find(
          (t) => t.qualifiedNameParts.name === audit.tableName,
        )!.name;
        const rules = await parser.getTableRulesWithoutFileTable(
          { tableName: auditName, clientReq: undefined },
          undefined,
          { [auditName]: "*" },
        );
        assert(rules?.select);
        assert(!rules?.insert && !rules?.update && !rules?.delete);

        const triggerOids = () =>
          db.any(
            "SELECT oid FROM pg_trigger WHERE left(tgname, length($1)) = $1 ORDER BY oid",
            [AUDIT_TRIGGER_PREFIX],
          );
        const beforeTriggers = await triggerOids();
        await result.sql(`CREATE TRIGGER audit_test_custom_insert AFTER INSERT ON audit_test_source
          FOR EACH ROW EXECUTE FUNCTION audit_test_custom();`);
        await result.restart();
        assert.deepEqual(await triggerOids(), beforeTriggers);
        assert.equal(
          await db.oneOrNone(
            "SELECT oid FROM pg_trigger WHERE tgrelid = 'audit_test_source'::regclass AND tgname = 'audit_test_custom_insert'",
          ),
          null,
        );
        // A fresh instance derives deselected trigger names from config, without saved state.
        const fresh = new Prostgles({
          ...prgl.opts,
          tableConfig: undefined,
          audit: {
            ...audit,
            tables: {
              audit_test_source: {
                entityType: "source",
                excludeColumns: ["secret"],
              },
            },
          },
        });
        const freshResult = await fresh.init(() => {}, { type: "init" });
        try {
          assert.equal(
            fresh.resolvedAuditConfig?.tables.audit_test_existing,
            undefined,
          );
          const sourceTriggers = await db.any<{ tgname: string }>(
            "SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_test_source'::regclass",
          );
          assert(sourceTriggers.some((t) => t.tgname === "audit_test_manual"));
          assert(
            !sourceTriggers.some((t) =>
              t.tgname.startsWith(TABLE_CONFIG_TRIGGER_PREFIX),
            ),
          );
          const count = (await history()).length;
          await freshResult.sql(
            "INSERT INTO audit_test_existing VALUES (10, 'deselected')",
          );
          assert.equal((await history()).length, count);
        } finally {
          await freshResult.destroy();
        }
        await result.restart();
        // Existing transaction contexts remain usable while new database calls wait.
        let releaseTx: () => void;
        let startedTx: () => void;
        const txStarted = new Promise<void>((resolve) => {
          startedTx = resolve;
        });
        const txRelease = new Promise<void>((resolve) => {
          releaseTx = resolve;
        });
        const transaction = prgl.dboBuilder.getTX(async (tx) => {
          startedTx();
          await txRelease;
          await tx.audit_test_source!.insert!({
            a: 6,
            b: "existing_transaction",
          });
        });
        await txStarted;
        pauseSchema = true;
        const schemaPaused = new Promise<void>((resolve) => {
          schemaStarted = resolve;
        });
        const restart = result.restart();
        await schemaPaused;
        // Schema queries explicitly use the original database and must pass through.
        assert.equal(
          (await prgl.dbForSchema!.one("SELECT 1 AS value")).value,
          1,
        );
        const sharedDb = prgl.db!;
        const finished: string[] = [];
        const waitingDbQueries = Promise.all([
          sharedDb.any("SELECT 1").then(() => finished.push("any")),
          sharedDb.result("SELECT 1").then(() => finished.push("result")),
          sharedDb.task(async (t) => {
            await t.one("SELECT 1");
            // Nested use of the root database must not wait on its own task.
            await sharedDb.one("SELECT 1");
            finished.push("task");
          }),
          sharedDb.tx(async (t) => {
            await t.tx((nested) => nested.one("SELECT 1"));
            finished.push("tx");
          }),
        ]);
        let queryFinished = false;
        const waiting = source.insert!({ a: 7, b: "waiting" }).then(() => {
          queryFinished = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 25));
        assert(!queryFinished);
        assert.deepEqual(finished, []);
        releaseTx!();
        await transaction;
        assert(!queryFinished);
        assert.deepEqual(finished, []);
        releaseSchema!();
        await restart;
        await waiting;
        await waitingDbQueries;
        assert.deepEqual(finished.sort(), ["any", "result", "task", "tx"]);
        assert((await history()).some((r) => r.new_id?.a === 7));

        for (const tables of [
          { audit_test_source: 1, audit_test_existing: 0 },
          { missing_table: 1 },
          { audit_test_nopk: 1 },
          { audit_test_view: 1 },
          { audit_test_source: { excludeColumns: ["a"] } },
        ]) {
          prgl.opts.audit = { ...audit, tables: tables as any };
          await assert.rejects(result.restart());
          await assert.rejects(source.find!({}));
          await assert.rejects(sharedDb.one("SELECT 1"));
          await assert.rejects(result.update({}));
          await assert.rejects(source.find!({}));
        }
        for (const [tableName, id] of [
          ["audit_test_partitioned", 91],
          ["audit_test_partition", 92],
        ] as const) {
          await result.update({ audit: { ...audit, tables: { [tableName]: 1 } } });
          const count = (await history()).length;
          await result.sql(`INSERT INTO ${tableName} VALUES (${id})`);
          const rows = await history();
          assert.equal(rows.length, count + 1);
          assert.equal(rows.at(-1).operation, "INSERT");
          assert.deepEqual(rows.at(-1).new_id, { id });
        }
        prgl.opts.audit = audit;
        await result.restart();
        // Removing a target removes only managed triggers and preserves existing history.
        const countBefore = (await history()).length;
        await result.update({
          audit: { ...audit, tables: { audit_test_source: 1 } },
        });
        await result.sql(
          "INSERT INTO audit_test_existing VALUES (2, 'excluded')",
        );
        assert.equal((await history()).length, countBefore);
        await result.update({ audit: undefined });
        assert.equal(prgl.resolvedAuditConfig, undefined);
        await source.insert!({ a: 8, b: "disabled" });
        assert.equal((await history()).length, countBefore);
        await result.sql(`UPDATE "audit_events" SET actor = NULL WHERE false;
          DELETE FROM "audit_events" WHERE false`);
        prgl.opts.sqlFilePath = undefined;
        await result.sql(`CREATE TABLE audit_test.selected (id int PRIMARY KEY);
        CREATE TABLE audit_test.ignored (value text);
        CREATE VIEW audit_test.selected_view AS SELECT * FROM audit_test.selected;`);
        await result.update({
          tableConfig: undefined,
          schemaFilter: { audit_test_main: 1, audit_test: 1 },
        });
        const excludedTables = Object.fromEntries(
          prgl.dboBuilder.tables
            .filter(
              (t) =>
                t.qualifiedNameParts.schema !== "audit_test" ||
                t.qualifiedNameParts.name === "ignored",
            )
            .map((t) => [t.name, 0 as const]),
        );
        await result.update({ audit: { ...audit, tables: excludedTables } });
        await result.sql(
          "INSERT INTO audit_test.selected VALUES (1); INSERT INTO audit_test.ignored VALUES ('not audited')",
        );
        assert.equal((await history()).length, countBefore + 1);
        await result.sql("DROP TABLE audit_test.ignored");
        // Default inclusion must reject the remaining unkeyed source table.
        await assert.rejects(
          result.update({ audit: { tableName: audit.tableName } }),
        );
        await result.update({
          audit: {
            ...audit,
            tables: Object.fromEntries(
              Object.entries(excludedTables).filter(
                ([name]) => !name.includes("ignored"),
              ),
            ),
          },
        });
        await result.sql("INSERT INTO audit_test.selected VALUES (2)");
        assert.equal((await history()).length, countBefore + 2);
        await result.update({
          audit: {
            tableName: "audit_next_events",
            tables: Object.fromEntries(
              Object.entries(excludedTables).filter(
                ([name]) => !name.includes("ignored"),
              ),
            ),
          },
        });
        await result.sql("INSERT INTO audit_test.selected VALUES (3)");
        assert.equal(
          (
            await db.one(
              `SELECT count(*)::int AS count FROM "audit_next_events"`,
            )
          ).count,
          1,
        );
        assert.equal((await history()).length, countBefore + 2);
        await result.sql(`UPDATE "audit_events" SET actor = NULL WHERE false;
          DELETE FROM "audit_events" WHERE false`);
        await assert.rejects(result.sql(`TRUNCATE "audit_next_events"`), {
          message: /Audit protection/,
        });
      } finally {
        releaseSchema?.();
        if (result) await result.destroy();
        else {
          await prgl.db?.$pool.end();
          await prgl.adminClient?.end();
        }
        await db.none(
          `DROP TABLE IF EXISTS audit_test_source, audit_test_existing, audit_test_child, audit_test_nopk, audit_test_partitioned CASCADE; DROP TABLE IF EXISTS "audit_events", "audit_next_events" CASCADE; DROP SCHEMA IF EXISTS audit_test CASCADE;`,
        );
        await parentDb.none("DROP SCHEMA audit_test_main CASCADE");
        await db.$pool.end();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
}

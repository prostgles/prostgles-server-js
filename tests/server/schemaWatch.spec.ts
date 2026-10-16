import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import prostgles, {
  type DBHandlerServerInternal,
  type InitResult,
  type ProstglesInitOptions,
} from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { DB } from "prostgles-server/dist/Prostgles";

export const testSchemaWatch = async (pgDb: DB) => {
  await test(
    "non-superuser schema refresh handles SQL, commits and overlapping DDL",
    { timeout: 30_000 },
    async () => {
      const schema = `schema_watch_${randomUUID().replaceAll("-", "")}`;
      const role = `${schema}_user`;
      const table = `${schema}.records`;
      const queries: string[] = [];
      let instance: InitResult | undefined;
      let currentDbo: DBHandlerServerInternal | undefined;
      let schemaChanges = 0;
      let contextCleanups = 0;
      let duringSchemaRefresh: (() => Promise<void>) | undefined;
      let schemaChangeListener: (() => void) | undefined;
      const waitForSchemaChanges = (expected: number) =>
        new Promise<void>((resolve) => {
          schemaChangeListener = () => {
            if (schemaChanges < expected) return;
            schemaChangeListener = undefined;
            resolve();
          };
        });
      try {
        await pgDb.none(`CREATE ROLE ${role} LOGIN PASSWORD '${role}';
        CREATE SCHEMA ${schema} AUTHORIZATION ${role};`);
        instance = await prostgles({
          dbConnection: {
            ...getConnectionDetails(pgDb),
            user: role,
            password: role,
          } as ProstglesInitOptions["dbConnection"],
          schemaFilter: { [schema]: 1 },
          watchSchema: true,
          disableRealtime: true,
          transactions: true,
          onQuery: (_error, { query }) => queries.push(String(query)),
          createContext: async ({ onCleanup }) => {
            const callback = duringSchemaRefresh;
            duringSchemaRefresh = undefined;
            await callback?.();
            onCleanup(() => {
              contextCleanups++;
            });
            return undefined;
          },
          onReady: ({ dbo, reason }) => {
            currentDbo = dbo as DBHandlerServerInternal;
            if (reason.type === "schema change") {
              schemaChanges++;
              schemaChangeListener?.();
            }
          },
        });
        for (let iteration = 0; iteration < 3; iteration++) {
          const dropped = waitForSchemaChanges(schemaChanges + 1);
          await instance.sql(`DROP TABLE IF EXISTS ${table}`);
          await dropped;
          assert.equal(currentDbo![table], undefined);
          const created = waitForSchemaChanges(schemaChanges + 1);
          await instance.sql(`CREATE TABLE ${table} (
          id SERIAL PRIMARY KEY, title TEXT,
          gencol TEXT GENERATED ALWAYS AS (title || id::TEXT) STORED
        )`);
          await created;
          assert.deepEqual(
            (await currentDbo![table]!.getColumns()).map(({ name }) => name),
            ["id", "title", "gencol"],
          );
          await currentDbo![table]!.insert({ title: "value_" });
          assert.deepEqual(await currentDbo![table]!.findOne(), {
            id: 1,
            title: "value_",
            gencol: "value_1",
          });
        }

        const dboBuilder = currentDbo![table]!.dboBuilder;
        const schemaChangesBeforeCommit = schemaChanges;
        assert.equal(
          await instance._db.tx((transaction) =>
            dboBuilder.runSQL(
              "SELECT 1",
              undefined,
              { returnType: "value" },
              { tx: { t: transaction, dbTX: currentDbo! } },
            ),
          ),
          1,
        );
        const committed = waitForSchemaChanges(schemaChangesBeforeCommit + 1);
        await currentDbo!.tx!(async (dbx, transaction) => {
          for (const query of [
            "SELECT 1",
            `ALTER TABLE ${table} ADD COLUMN committed TEXT`,
            `ALTER TABLE ${table} ADD COLUMN committed_too TEXT`,
          ]) {
            await dboBuilder.runSQL(query, undefined, undefined, {
              tx: { t: transaction, dbTX: dbx },
            });
          }
          assert.equal(schemaChanges, schemaChangesBeforeCommit);
        });
        await committed;
        assert.equal(schemaChanges, schemaChangesBeforeCommit + 1);
        assert.deepEqual(
          (await currentDbo![table]!.getColumns()).map(({ name }) => name),
          ["id", "title", "gencol", "committed", "committed_too"],
        );
        await assert.rejects(
          currentDbo!.tx!(async (dbx, transaction) => {
            await dboBuilder.runSQL(
              `ALTER TABLE ${table} ADD COLUMN rolled_back TEXT`,
              undefined,
              undefined,
              { tx: { t: transaction, dbTX: dbx } },
            );
            throw new Error("Rollback schema change");
          }),
          { message: "Rollback schema change" },
        );
        assert.equal(schemaChanges, schemaChangesBeforeCommit + 1);
        assert.deepEqual(
          (await currentDbo![table]!.getColumns()).map(({ name }) => name),
          ["id", "title", "gencol", "committed", "committed_too"],
        );

        // Commit the second DDL after the first refresh has already read the schema.
        let transactionStarted: () => void;
        let releaseTransaction: () => void;
        let schemaRefreshStarted: () => void;
        let releaseSchemaRefresh: () => void;
        const transactionReady = new Promise<void>((resolve) => {
          transactionStarted = resolve;
        });
        const transactionRelease = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        const refreshStarted = new Promise<void>((resolve) => {
          schemaRefreshStarted = resolve;
        });
        const refreshRelease = new Promise<void>((resolve) => {
          releaseSchemaRefresh = resolve;
        });
        const concurrentTransaction = currentDbo!.tx!(async (dbx, transaction) => {
          transactionStarted();
          await transactionRelease;
          await dboBuilder.runSQL(
            `ALTER TABLE ${table} ADD COLUMN concurrent_column TEXT`,
            undefined,
            undefined,
            { tx: { t: transaction, dbTX: dbx } },
          );
        });
        try {
          await transactionReady;
          duringSchemaRefresh = async () => {
            // Initialization SQL must not trigger another refresh.
            await instance!.sql("DO $$ BEGIN NULL; END $$");
            schemaRefreshStarted();
            await refreshRelease;
          };
          const refreshed = waitForSchemaChanges(schemaChangesBeforeCommit + 3);
          const firstDDL = instance.sql(`ALTER TABLE ${table} ADD COLUMN first_column TEXT`);
          await refreshStarted;
          // DDL returns even while its background refresh is paused.
          await firstDDL;
          releaseTransaction!();
          await concurrentTransaction;
          assert.equal(schemaChanges, schemaChangesBeforeCommit + 1);
          releaseSchemaRefresh!();
          await refreshed;
        } finally {
          releaseTransaction!();
          releaseSchemaRefresh!();
          await concurrentTransaction;
        }
        assert.equal(schemaChanges, schemaChangesBeforeCommit + 3);
        assert.deepEqual(
          (await currentDbo![table]!.getColumns()).map(({ name }) => name),
          [
            "id",
            "title",
            "gencol",
            "committed",
            "committed_too",
            "first_column",
            "concurrent_column",
          ],
        );
        assert.equal(dboBuilder.canSubscribe, false);
        assert(!queries.some((query) => query.includes("SELECT * FROM prostgles.versions")));
        assert(!queries.some((query) => query.includes("DROP SCHEMA IF EXISTS prostgles")));

        // Shutdown must wait for the active refresh and discard queued schema changes.
        let resumeClosingRefresh = () => {};
        const closingRefreshStarted = new Promise<void>((resolve) => {
          duringSchemaRefresh = async () => {
            resolve();
            await new Promise<void>((resume) => {
              resumeClosingRefresh = resume;
            });
            await instance!._db.one("SELECT 1");
          };
        });
        await instance.sql(`ALTER TABLE ${table} ADD COLUMN closing_column TEXT`);
        await closingRefreshStarted;
        await instance.sql(`ALTER TABLE ${table} ADD COLUMN queued_column TEXT`);
        const schemaChangesBeforeDestroy = schemaChanges;
        const cleanupsBeforeDestroy = contextCleanups;
        const onSchemaChange = dboBuilder.prostgles.schemaWatch!.onSchemaChange!;
        const destroying = instance.destroy();
        try {
          await new Promise<void>((resolve) => setImmediate(resolve));
        } finally {
          resumeClosingRefresh();
          await destroying;
        }
        assert.equal(schemaChanges, schemaChangesBeforeDestroy);
        assert.equal(contextCleanups, cleanupsBeforeDestroy + 1);
        const queriesAfterDestroy = queries.length;
        onSchemaChange({ command: "ALTER", query: "late DDL" });
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.equal(queries.length, queriesAfterDestroy);
      } finally {
        await instance?.destroy();
        await pgDb.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE; DROP ROLE IF EXISTS ${role};`);
      }
    },
  );
};

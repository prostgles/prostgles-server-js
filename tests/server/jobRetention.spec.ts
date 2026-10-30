import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createJobDefiner,
  type JobRetention,
  type JobStatus,
  type ProstglesInitOptions,
  type ScheduleTrigger,
} from "prostgles-server";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import * as cronSchedule from "prostgles-server/dist/Jobs/cronSchedule";
import { enqueueSchedules } from "prostgles-server/dist/Jobs/enqueueSchedules";
import * as jobParams from "prostgles-server/dist/Jobs/getJobParams";
import { getJobRetention } from "prostgles-server/dist/Jobs/getJobRetention";
import { pruneJobs } from "prostgles-server/dist/Jobs/pruneJobs";

export const testJobRetention = async (parentDb: DB) => {
  await test("scheduled job retention", { timeout: 30_000 }, async (context) => {
    const database = `retention_${randomUUID().replaceAll("-", "")}`;
    await parentDb.none(`CREATE DATABASE ${database}`);
    const defineJob = createJobDefiner<void, unknown>();
    const retained = defineJob({
      trigger: { type: "schedule", cron: "0 0 31 2 *" },
      retention: "forever",
      run: async () => {},
    });
    const other = defineJob({
      trigger: { type: "schedule", cron: "0 0 31 2 *" },
      retention: {},
      run: async () => {},
    });
    const options = {
      dbConnection: {
        ...getConnectionDetails(parentDb),
        database,
      } as ProstglesInitOptions["dbConnection"],
      onReady: () => {},
      jobs: { tableName: "retention_queue", definitions: { retained, other } },
      tableConfig: {
        records: {
          columns: { id: "SERIAL PRIMARY KEY", job_id: "UUID REFERENCES retention_queue(id)" },
        },
      },
    } satisfies ProstglesInitOptions;
    const prostgles = new Prostgles(options);
    const instances: Awaited<ReturnType<typeof prostgles.init>>[] = [];
    try {
      const result = await prostgles.init(() => {}, { type: "init" });
      instances.push(result);
      const db = prostgles.db!;
      const insertRun = async (
        status: JobStatus,
        age: string,
        jobName = "retained",
        targetTable: string | null = null,
      ) => {
        const id = randomUUID();
        await db.none(
          `INSERT INTO retention_queue (
            id, job_name, target_table, target_row_pkey, params, status, max_attempts, delay_ms,
            backoff, finished_at, error, run_at, lease_token, locked_until
          ) VALUES (
            \${id}, \${jobName}, \${targetTable}, '{}', '{}', \${status}, 3, 1000, 'fixed',
            CASE WHEN \${status} IN ('pending', 'running') THEN NULL
              ELSE clock_timestamp() - \${age}::interval END,
            CASE WHEN \${status} = 'failed' THEN '{"message":"Failed"}'::jsonb ELSE NULL END,
            clock_timestamp() + interval '1 day',
            CASE WHEN \${status} = 'running' THEN \${id}::uuid ELSE NULL END,
            CASE WHEN \${status} = 'running' THEN clock_timestamp() + interval '1 day' ELSE NULL END
          )`,
          { id, jobName, targetTable, status, age },
        );
        return id;
      };
      const remainingIds = async () =>
        (await db.any<{ id: string }>("SELECT id FROM retention_queue WHERE target_table IS NULL"))
          .map(({ id }) => id)
          .sort();
      context.beforeEach(async () => {
        await prostgles.jobs.stop();
        await db.none("DELETE FROM retention_queue WHERE target_table IS NULL");
        retained.retention = {};
        other.retention = {};
        await prostgles.jobs.validate();
      });

      await context.test(
        "requires retention and validates interval strings, numeric ages and counts during configuration",
        async () => {
          const validPolicies: JobRetention[] = [
            "forever",
            ...["1ms", "1s", "90m", "1h", "7d", "1w", "1 hour 30 minutes", "P1DT2H", "forever"].map(
              (succeeded) => ({ succeeded }),
            ),
            { succeeded: { maxAge: 60_000, maxCount: 2 } },
            { succeeded: { maxCount: 0 }, cancelled: "forever" },
            {},
          ];
          for (const policy of validPolicies) {
            retained.retention = policy;
            await prostgles.jobs.validate();
          }
          const invalidPolicies: unknown[] = [
            ...[
              "",
              "nonsense",
              "0d",
              "-1h",
              "infinity",
              "999999999999999999999 days",
              "1d'; SELECT 1; --",
            ].map((succeeded) => ({ succeeded })),
            ...[0, -1, Infinity, NaN, null, true, {}, "forever"].map((maxAge) => ({
              succeeded: { maxAge },
            })),
            ...[-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", null].map((maxCount) => ({
              succeeded: { maxCount },
            })),
            { succeeded: {} },
            { succeeded: { maxAge: "1d", typo: 1 } },
            { succeeded: null },
            { pending: "1d" },
            { running: "1d" },
            undefined,
            null,
            [],
            "7d",
          ];
          for (const policy of invalidPolicies) {
            retained.retention = policy as JobRetention;
            await assert.rejects(prostgles.jobs.validate(), /Invalid job retention for retained/);
          }
          /* @ts-expect-error Exercise omitted retention from an untyped configuration. */
          delete retained.retention;
          await assert.rejects(
            prostgles.refreshDBO(),
            /Invalid job retention for retained: required for scheduled jobs/,
          );
          retained.retention = { succeeded: "invalid interval" };
          await assert.rejects(
            prostgles.refreshDBO(),
            /Invalid job retention for retained.succeeded/,
          );
          retained.retention = { succeeded: "7d" };
          await prostgles.refreshDBO();
          await prostgles.jobs.stop();
          const originalDefinitions = prostgles.opts.jobs!.definitions;
          for (const retention of [{ succeeded: "1d" }, "forever"]) {
            const rowJob = defineJob({
              trigger: { type: "row", table: "records", on: ["insert"] },
              run: async () => {},
              /* @ts-expect-error Retention is only supported for scheduled jobs. */
              retention,
            });
            prostgles.opts.jobs!.definitions = { rowJob };
            await assert.rejects(prostgles.jobs.validate(), /Invalid job retention for rowJob/);
          }
          prostgles.opts.jobs!.definitions = originalDefinitions;
        },
      );

      await context.test('"forever" preserves all terminal history', async () => {
        retained.retention = "forever";
        const expected = [
          await insertRun("succeeded", "100 days"),
          await insertRun("failed", "100 days"),
          await insertRun("cancelled", "100 days"),
        ].sort();
        const policies = await getJobRetention(prostgles);
        assert.deepEqual(policies, []);
        await pruneJobs(prostgles, policies);
        assert.deepEqual(await remainingIds(), expected);
      });

      await context.test(
        "worker cleanup applies age or count limits and preserves active, omitted and linked runs",
        async () => {
          retained.retention = {
            succeeded: { maxAge: "7d", maxCount: 2 },
            failed: "30d",
            cancelled: "forever",
          };
          other.retention = { succeeded: { maxCount: 1 } };
          await insertRun("succeeded", "8 days");
          await insertRun("succeeded", "3 hours");
          const successes = [
            await insertRun("succeeded", "2 hours"),
            await insertRun("succeeded", "1 hour"),
          ];
          await insertRun("failed", "31 days");
          const failure = await insertRun("failed", "2 days");
          const cancelled = await insertRun("cancelled", "100 days");
          const pending = await insertRun("pending", "100 days");
          const running = await insertRun("running", "100 days");
          await insertRun("succeeded", "2 days", "other");
          const otherSuccess = await insertRun("succeeded", "1 day", "other");
          const omitted = await insertRun("failed", "100 days", "other");
          const linked = await insertRun("succeeded", "100 days", "retained", "records");
          await db.none("INSERT INTO records (job_id) VALUES (${linked})", { linked });
          await prostgles.jobs.validate();
          prostgles.jobs.start();
          const expected = [
            ...successes,
            failure,
            cancelled,
            pending,
            running,
            otherSuccess,
            omitted,
          ].sort();
          await eventually(
            async () => JSON.stringify(await remainingIds()) === JSON.stringify(expected),
          );
          await prostgles.jobs.stop();
          assert(await result.jobs.get(linked));
        },
      );

      await context.test("numeric age retention also removes completed manual reruns", async () => {
        retained.retention = { succeeded: { maxAge: 1000 } };
        const original = await insertRun("succeeded", "2 days");
        const { jobId } = await result.jobs.rerun(original);
        await prostgles.jobs.validate();
        prostgles.jobs.start();
        await eventually(async () => (await result.jobs.get(jobId))?.status === "succeeded");
        await prostgles.jobs.stop();
        assert.equal(await result.jobs.get(original), undefined);
        assert.equal((await result.jobs.get(jobId))!.occurrence, null);
        await db.none(
          "UPDATE retention_queue SET finished_at = clock_timestamp() - interval '2 seconds' WHERE id = ${jobId}",
          { jobId },
        );
        await pruneJobs(prostgles, await getJobRetention(prostgles));
        assert.equal(await result.jobs.get(jobId), undefined);
      });

      await context.test(
        "cleanup uses bounded batches across workers and skips locked rows",
        async () => {
          retained.retention = { succeeded: { maxCount: 0 }, failed: "1d" };
          const template = await insertRun("succeeded", "2 days");
          await db.none(
            `INSERT INTO retention_queue (id, job_name, target_row_pkey, params, status, max_attempts, delay_ms, backoff, finished_at)
           SELECT gen_random_uuid(), job_name, target_row_pkey, params, status, max_attempts, delay_ms, backoff, finished_at
           FROM retention_queue CROSS JOIN generate_series(1, 1004) WHERE id = \${template}`,
            { template },
          );
          const policies = await getJobRetention(prostgles);
          await pruneJobs(prostgles, policies);
          assert.equal((await remainingIds()).length, 5);
          const lockedId = await insertRun("failed", "2 days");
          const secondWorker = new Prostgles(options);
          const secondResult = await secondWorker.init(() => {}, { type: "init" });
          instances.push(secondResult);
          await secondWorker.jobs.stop();
          await db.tx(async (transaction) => {
            await transaction.one(
              "SELECT id FROM retention_queue WHERE id = ${lockedId} FOR UPDATE",
              { lockedId },
            );
            await Promise.all([pruneJobs(prostgles, policies), pruneJobs(secondWorker, policies)]);
            assert.deepEqual(await remainingIds(), [lockedId]);
          });
          await pruneJobs(prostgles, policies);
          assert.deepEqual(await remainingIds(), []);
          await secondResult.destroy();
        },
      );

      await context.test(
        "pruning preserves current occurrences and fresh schedulers do not replay pruned occurrences",
        async () => {
          retained.trigger.cron = "* * * * *";
          retained.retention = { succeeded: { maxCount: 0 } };
          try {
            await enqueueSchedules(prostgles, new Map());
            const [jobId] = await remainingIds();
            assert(jobId);
            await db.none(
              "UPDATE retention_queue SET status = 'succeeded', finished_at = clock_timestamp() WHERE id = ${jobId}",
              { jobId },
            );
            await pruneJobs(prostgles, await getJobRetention(prostgles));
            await enqueueSchedules(prostgles, new Map());
            assert.deepEqual(await remainingIds(), [jobId]);
            await db.none(
              "UPDATE retention_queue SET occurrence = date_trunc('minute', clock_timestamp()) - interval '2 minutes' WHERE id = ${jobId}",
              { jobId },
            );
            await pruneJobs(prostgles, await getJobRetention(prostgles));
            assert.deepEqual(await remainingIds(), []);
            await enqueueSchedules(prostgles, new Map());
            const remainingRun = await db.one<{ id: string; current: boolean }>(
              "SELECT id, occurrence >= date_trunc('minute', clock_timestamp()) AS current FROM retention_queue WHERE target_table IS NULL",
            );
            assert.notEqual(remainingRun.id, jobId);
            assert(remainingRun.current);
          } finally {
            retained.trigger.cron = "0 0 31 2 *";
          }
        },
      );

      await context.test(
        "enqueues first occurrences delayed past their minute with finite and forever retention",
        async (testContext) => {
          retained.retention = { succeeded: { maxCount: 0 } };
          other.retention = "forever";
          const { occurrence: occurrenceTimestamp } = await db.one<{
            occurrence: string;
          }>(
            "SELECT date_trunc('minute', clock_timestamp()) - interval '2 minutes' AS occurrence",
          );
          const occurrence = new Date(occurrenceTimestamp);
          /* Simulate the database clock advancing after each occurrence was selected. */
          testContext.mock.method(
            cronSchedule,
            "parseCronSchedule",
            () => () => occurrence,
          );
          const schedules = new Map<string, string>();
          await enqueueSchedules(prostgles, schedules);
          assert.equal((await remainingIds()).length, 2);
          assert.deepEqual(
            [...schedules.values()],
            [occurrence.toISOString(), occurrence.toISOString()],
          );
          await enqueueSchedules(prostgles, new Map());
          assert.equal((await remainingIds()).length, 2);
        },
      );

      await context.test(
        "cleanup preserves an old occurrence while a delayed scheduler is preparing its enqueue",
        async (testContext) => {
          retained.retention = { succeeded: { maxCount: 0 } };
          const jobId = await insertRun("succeeded", "2 days");
          const { occurrence: occurrenceTimestamp } = await db.one<{
            occurrence: string;
          }>(
            "UPDATE retention_queue SET occurrence = date_trunc('minute', clock_timestamp()) - interval '2 minutes' WHERE id = ${jobId} RETURNING occurrence",
            { jobId },
          );
          const occurrence = new Date(occurrenceTimestamp);
          const parseCronSchedule = cronSchedule.parseCronSchedule;
          testContext.mock.method(
            cronSchedule,
            "parseCronSchedule",
            (trigger: ScheduleTrigger) =>
              trigger === retained.trigger
                ? () => occurrence
                : parseCronSchedule(trigger),
          );
          const policies = await getJobRetention(prostgles);
          const getJobParams = jobParams.getJobParams;
          testContext.mock.method(
            jobParams,
            "getJobParams",
            async (...parameters: Parameters<typeof getJobParams>) => {
              /* Run cleanup on another connection before enqueueJob acquires its lock. */
              await pruneJobs(prostgles, policies);
              assert.deepEqual(await remainingIds(), [jobId]);
              return getJobParams(...parameters);
            },
          );
          const schedules = new Map<string, string>();
          await enqueueSchedules(prostgles, schedules);
          assert.equal(schedules.get("retained"), occurrence.toISOString());
          assert.deepEqual(await remainingIds(), [jobId]);
          await pruneJobs(prostgles, policies);
          assert.deepEqual(await remainingIds(), []);
        },
      );
    } finally {
      for (const instance of instances.reverse()) await instance.destroy();
      await parentDb.none(`DROP DATABASE ${database} WITH (FORCE)`);
    }
  });
};

const eventually = async (check: () => Promise<boolean>) => {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    assert(Date.now() < deadline, "Timed out waiting for job retention");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

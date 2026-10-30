import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pgPromise from "pg-promise";
import { ROW_ACTIONS_COLUMN, type AnyObject } from "prostgles-types";
import prostgles, {
  createJobDefiner,
  createJobControlFunctionDefiner,
  defineFunction,
  type DBOFullyTyped,
  type ExecutionContext,
  type InitResult,
  type JobRecord,
  type Jobs,
  type JobsConfig,
  type JobsOptions,
  type ParamsSchema,
  type ProstglesInitOptions,
  type RowTrigger,
} from "prostgles-server";
import { Prostgles, type DB } from "prostgles-server/dist/Prostgles";
import type { JobInsertRecord } from "prostgles-server/dist/Jobs/JobTypes";
import type { PublishFullyTyped } from "prostgles-server/dist/DBSchemaBuilder/DBSchemaBuilder";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { parseCronSchedule } from "prostgles-server/dist/Jobs/cronSchedule";
import type { TableHandler } from "prostgles-server/dist/DboBuilder/TableHandler/TableHandler";
import { createServerSideRequest } from "prostgles-server/dist/Auth/utils/serverSideRequest";
import type { AuthClientRequest } from "prostgles-server/dist/Auth/AuthTypes";
import { runClientRequest } from "prostgles-server/dist/runClientRequest";

export const testBackgroundJobs = async (parentDb: DB) => {
  await test("configured jobs", { timeout: 60_000 }, async (t) => {
    const database = `jobs_${randomUUID().replaceAll("-", "")}`;
    await parentDb.none(`CREATE DATABASE ${database}`);
    const pgp = pgPromise();
    const db = pgp({ ...getConnectionDetails(parentDb), database } as unknown as Parameters<
      typeof pgp
    >[0]);
    const table = "records";
    const queueName = `queue_${randomUUID().slice(0, 8)}` as const;
    const queue = `"${queueName}"`;
    let instance: InitResult<JobTestSchema> | undefined;
    let other: InitResult<JobTestSchema> | undefined;
    let rejectHook = false;
    let rejectSchedule = false;
    let jobFailure: unknown;
    let rowSelectCount = 0;
    let rowMutationCount = 0;
    const controlCallbacks: ExecutionContext[] = [];
    const controlHooks: ExecutionContext[] = [];
    let preparationJobs: Jobs | undefined;
    const getExecution = () => {
      const execution = [instance, other]
        .map((worker) => {
          const handler = worker?.db[table] as unknown as TableHandler | undefined;
          return handler?.dboBuilder.prostgles.getExecution();
        })
        .find((execution) => execution);
      assert(execution);
      return execution;
    };
    const seen: {
      id: string;
      revision: number;
      attempt: number;
      reason: string;
      user?: string;
      params: unknown;
      execution: ExecutionContext;
    }[] = [];
    const blocked = new Set<string>();
    const released = new Set<string>();
    const enqueued = new Set<string>();
    const defineJob = createJobDefiner<JobTestSchema>();
    const controlDefinitions = {
      process: defineJob({
        trigger: {
          type: "row",
          table,
          on: ["insert", "update"],
          columns: ["revision"],
          jobIdColumn: "job_id",
          when: { enabled: true },
        },
        params: { size: { jsonbSchema: { type: "number" }, default: 10 } },
        retry: { maxAttempts: 3, delayMs: 10, backoff: "exponential" },
        concurrency: 2,
        run: async ({
          row,
          run,
          checkpoint,
          progress,
          progressMessage,
          fail,
          params,
          user,
          signal,
        }) => {
          seen.push({
            id: run.id,
            revision: row.revision,
            attempt: run.attempt,
            reason: run.reason,
            user: user?.id,
            params,
            execution: getExecution(),
          });
          if (row.mode === "block") {
            blocked.add(run.id);
            while (!released.has(run.id)) {
              signal.throwIfAborted();
              await delay(10);
            }
          }
          if (row.mode === "permanent") fail("Permanent failure");
          if (row.mode === "error") throw jobFailure;
          if (row.mode === "retry") {
            if (run.attempt === 1) {
              await checkpoint.set({ done: 1 });
              throw new Error("Transient failure");
            }
            assert.deepEqual(await checkpoint.get(), { done: 1 });
          }
          await checkpoint.set(null);
          assert.equal(await checkpoint.get(), null);
          if (row.mode === "progress") {
            for (const [done, total] of [
              [-1, 1],
              [1, -1],
              [2, 1],
              [NaN, 1],
              [1, Infinity],
            ] as const) {
              await assert.rejects(progress(done, total), /Invalid job progress/);
            }
            await progressMessage("Preparing");
            const initialProgress = (await instance!.jobs.get(run.id))!;
            assert.equal(initialProgress.progress_message, "Preparing");
            assert.equal(initialProgress.progress_numeric, null);
            await progress(1, 2);
            assert.equal((await instance!.jobs.get(run.id))!.progress_message, "Preparing");
            await progressMessage(null);
            const numericProgress = (await instance!.jobs.get(run.id))!;
            assert.deepEqual(numericProgress.progress_numeric, { done: 1, total: 2 });
            assert.equal(numericProgress.progress_message, null);
            await progressMessage("Complete");
            return;
          }
          await progress(0, 0);
          await progress(1, 1);
        },
      }),
    };
    const definitions: JobsConfig<JobTestSchema> = controlDefinitions;
    const defineJobControl = createJobControlFunctionDefiner<JobTestSchema>()(controlDefinitions);
    const options: ProstglesInitOptions<JobTestSchema> = {
      dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
      transactions: true,
      onReady: () => {},
      onQuery: (_error, { query }) => {
        if (query.trimStart().startsWith("SELECT") && query.includes('"records"')) rowSelectCount++;
      },
      jobs: { tableName: queueName, definitions },
      joins: [{ tables: [queueName, table], on: [{ user_id: "owner" }] }],
      auth: {
        getUser: () => undefined,
        findUser: (filter) => {
          const filters: AnyObject[] = "$and" in filter ? filter.$and! : [filter];
          const id = filters[0]?.id;
          return (
              typeof id === "string" &&
                id !== "deleted" &&
                filters.every((userFilter) => userFilter.id === id)
            ) ?
              { id, type: id === "admin" ? "admin" : "member" }
            : undefined;
        },
      },
      functions: {
        members: {
          userFilter: { id: "alice" },
          functions: {
            controlRecord: defineJobControl({
              jobName: "process",
              operation: "startOrRetry",
              run: async ({ row, user, dbx, jobs }) => {
                preparationJobs = jobs;
                controlCallbacks.push(getExecution());
                if (row.owner !== user.id || !row.enabled || row.note === "deny control")
                  throw new Error("Control denied");
                await dbx.records.update({ id: row.id }, { revision: row.revision + 1 });
                if (row.note === "reject preparation") throw new Error("Preparation rejected");
              },
            }),
            rerunRecord: defineJobControl({
              jobName: "process",
              operation: "rerun",
            }),
            cancelRecord: defineJobControl({
              jobName: "process",
              operation: "cancel",
            }),
            rerunJob: defineFunction({
              input: {
                id: {
                  type: "ValueLookup",
                  table: queueName,
                  column: "id",
                  filter: {
                    $and: [
                      { status: "succeeded" },
                      {
                        $existsJoined: {
                          path: [{ table, on: [{ user_id: "owner" }] }],
                          filter: {
                            enabled: true,
                            owner: {
                              $prostglesContext: { objectName: "user", objectPropertyName: "id" },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
                size: { type: "number", optional: true },
              },
              run: ({ id, size }, { jobs, withClientDbTx }) =>
                withClientDbTx((dbx) =>
                  jobs.withTransaction(dbx).rerun(String(id), size === undefined ? {} : { size }),
                ),
            }),
            cancelJob: defineFunction({
              // Exercise the jobs API in unrestricted contexts as well as rerunJob's restricted context.
              unrestrictedDbAccess: true,
              input: {
                row: { type: "RowLookup", table: queueName, filter: { status: "running" } },
              },
              run: ({ row }, { jobs }) => jobs.cancel(String(row.id)),
            }),
          },
        },
      },
      publish: ({ user }) => {
        const rules: PublishFullyTyped<JobTestSchema> = {};
        rules[queueName] = {
          select: {
            fields: ["id", "job_name", "status"],
            filterFields: "*",
            forcedFilter:
              user?.type === "admin" ?
                {}
              : {
                  job_name: user?.id === "alice" ? "process" : "forbidden",
                },
          },
        };
        rules[table] = {
          select: { fields: "*", forcedFilter: { owner: user?.id } },
          insert: { fields: "*", forcedData: { owner: user?.id } },
          update: { fields: ["revision", "note"], forcedFilter: { owner: user?.id } },
        };
        return rules;
      },
      tableHooks: {
        [table]: {
          afterEach: [
            {
              commands: { insert: 1, update: 1 },
              validate: async ({ row, dbx }) => {
                rowMutationCount++;
                const execution = getExecution();
                if (execution.invocations.some(({ type }) => type === "jobControl"))
                  controlHooks.push(execution);
                if (rejectHook) throw new Error("Reject row");
                const stored = (await dbx[table].findOne({ id: row.id }))!;
                assert.equal(row.job_id, stored.job_id);
                assert.equal(row.note, stored.note);
              },
            },
          ],
        },
      },
    };
    options.tableHooks![queueName] = {
      afterEach: [
        {
          commands: { insert: 1 },
          validate: ({ row }) => {
            if (rejectSchedule && row.job_name === "brokenSchedule")
              throw new Error("Schedule enqueue rejected");
            enqueued.add(row.id);
          },
        },
      ],
    };
    const records = async (filter = "TRUE", values: Record<string, unknown> = {}) =>
      db.any<JobRecord>(`SELECT * FROM ${queue} WHERE ${filter} ORDER BY created_at, id`, values);
    const status = async (id: string, expected: string) => {
      await eventually(async () => (await instance!.jobs.get(id))?.status === expected);
      return (await instance!.jobs.get(id))!;
    };
    const insert = async (data: Partial<JobTestRow> = {}) => {
      const row = await instance!.db[table].insert({ ...data }, { returning: "*" });
      const job = (
        await records("target_row_pkey = ${targetRowPkey:json}", { targetRowPkey: { id: row.id } })
      )[0];
      assert.equal(row.job_id, job?.id ?? null);
      assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, job?.id ?? null);
      return { row, job: job! };
    };
    try {
      await t.test("validates jobs after onMount and again on refresh", async () => {
        const validationDatabase = `${database}_validation`;
        await parentDb.none(`CREATE DATABASE ${validationDatabase}`);
        let contextsCreated = 0;
        const validationJobs = {
          process: createJobDefiner()({
            trigger: {
              type: "row",
              table: "job_validation_target",
              on: ["insert"],
              jobIdColumn: "job_id",
              when: { id: { $gt: 0 } },
            },
            run: async () => {},
          }),
        };
        const prgl = new Prostgles({
          dbConnection: {
            ...getConnectionDetails(db),
            database: validationDatabase,
          } as unknown as ProstglesInitOptions["dbConnection"],
          onReady: () => {},
          audit: { tableName: "job_validation_audit", tables: { job_validation_setup: 1 } },
          tableConfig: {
            job_validation_setup: {
              columns: { id: "serial PRIMARY KEY", job_id: "UUID" },
              constraints: {
                setup_job: "FOREIGN KEY (job_id) REFERENCES job_validation_queue(id)",
              },
              onMount: async ({ _db }) => {
                await _db.none(
                  "CREATE TABLE job_validation_target (id serial PRIMARY KEY, job_id UUID)",
                );
              },
            },
          },
          jobs: {
            tableName: "job_validation_queue",
            definitions: validationJobs,
          },
          functions: {
            members: {
              userFilter: { id: "alice" },
              functions: {
                control: createJobControlFunctionDefiner()(validationJobs)({
                  jobName: "process",
                  operation: "startOrRetry",
                }),
              },
            },
          },
          createContext: ({ dbo }) => {
            assert(dbo.job_validation_target);
            contextsCreated++;
          },
        });
        let result: Awaited<ReturnType<typeof prgl.init>> | undefined;
        try {
          result = await prgl.init(() => {}, { type: "init" });
          assert.equal(contextsCreated, 1);
          await prgl.refreshDBO();
          assert.equal(contextsCreated, 2);
          const control = prgl.opts.functions!.members!.functions.control!.jobControl!;
          control.jobName = "missing";
          await assert.rejects(prgl.refreshDBO(), /Unknown job: missing/);
          control.jobName = "process";
          const input = prgl.opts.functions!.members!.functions.control!.input!;
          input.row = { type: "RowLookup", table: "missing" };
          await assert.rejects(
            prgl.refreshDBO(),
            /Job control lookup must reference job_validation_target/,
          );
          input.row = { type: "RowLookup", table: "job_validation_target" };
          assert.equal(contextsCreated, 2);
          await result.sql("ALTER TABLE job_validation_target DROP COLUMN job_id");
          await assert.rejects(prgl.refreshDBO(), /Invalid jobIdColumn for process/);
          assert.equal(contextsCreated, 2);
          await result.sql("DROP TABLE job_validation_target");
          await assert.rejects(prgl.refreshDBO(), /Invalid row trigger for process/);
          assert(!prgl.dboBuilder.dboMap.has("job_validation_target"));
          assert.equal(contextsCreated, 2);
        } finally {
          await result?.destroy();
          await parentDb.none(`DROP DATABASE ${validationDatabase} WITH (FORCE)`);
        }
      });
      await db.none(`CREATE TABLE ${table} (
        id SERIAL PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1, enabled BOOLEAN NOT NULL DEFAULT TRUE,
        owner TEXT NOT NULL DEFAULT 'alice', mode TEXT, note TEXT, updated TIMESTAMPTZ DEFAULT now(),
        job_id UUID CHECK (note IS DISTINCT FROM 'reject job link' OR job_id IS NULL)
      )`);
      instance = await prostgles<JobTestSchema>(options);
      await db.none(`ALTER TABLE ${table} ADD FOREIGN KEY (job_id) REFERENCES ${queue}(id)`);
      assert.equal(instance.getSchema().find(({ name }) => name === queueName)?.schema, "public");
      assert((await instance.getTSSchema()).tsSchema.includes(queueName));
      await t.test("types enforce params, rows and schedule context", () => {
        type JobSchema = {
          records: { columns: { id: number; revision: number } };
          other: { columns: { name: string } };
        };
        const checkActions = async (dbo: DBOFullyTyped<JobSchema>) => {
          const rows = await dbo.records.find({}, { select: { id: 1, [ROW_ACTIONS_COLUMN]: 1 } });
          rows[0]![ROW_ACTIONS_COLUMN] satisfies string[];
          // @ts-expect-error the projection excludes revision
          rows[0]!.revision;
          const projected = await dbo.records.find({}, { select: [ROW_ACTIONS_COLUMN] });
          projected[0]![ROW_ACTIONS_COLUMN] satisfies string[];
        };
        const checkProgress = (job: JobRecord) => {
          job.progress_message satisfies string | null;
          job.progress_numeric satisfies { done: number; total: number } | null;
          // @ts-expect-error numeric progress requires a total
          const missingTotal: NonNullable<JobRecord["progress_numeric"]> = { done: 1 };
          // @ts-expect-error progress values must be numbers
          const textDone: NonNullable<JobRecord["progress_numeric"]> = { done: "1", total: 1 };
          void [missingTotal, textDone];
        };
        const defineJob = createJobDefiner<JobSchema>();
        const invalidTrigger: RowTrigger<JobSchema, "records"> = {
          type: "row",
          table: "records",
          on: ["insert"],
          // @ts-expect-error unknown job ID column
          jobIdColumn: "missing",
        };
        const definitions = {
          process: defineJob({
            trigger: { type: "row", table: "records", on: ["insert"], columns: ["revision"] },
            params: {
              limit: { jsonbSchema: { type: "number" }, default: 10 },
              note: { jsonbSchema: { type: "string" }, optional: true },
            },
            run: async ({ row, params, dbo }) => {
              row.revision satisfies number;
              params.limit satisfies number;
              params.note satisfies string | undefined;
              await dbo.other.find();
              // @ts-expect-error unknown row column
              void row.name;
              // @ts-expect-error unknown parameter
              void params.typo;
            },
          }),
          scheduled: defineJob({
            trigger: { type: "schedule", cron: "0 * * * *" },
            retention: { succeeded: "forever" },
            run: ({ row }) => {
              row satisfies undefined;
              return Promise.resolve();
            },
          }),
        };
        const { retention: _retention, ...scheduleWithoutRetention } = definitions.scheduled;
        /* @ts-expect-error Scheduled jobs require explicit retention. */
        defineJob(scheduleWithoutRetention);
        /* @ts-expect-error Inline scheduled definitions also require retention. */
        const missingRetention: JobsConfig<JobSchema> = { scheduled: scheduleWithoutRetention };
        const options: JobsOptions<JobSchema> = { definitions };
        const invalid: ParamsSchema = {
          // @ts-expect-error required parameters need a default
          required: { jsonbSchema: { type: "string" } },
        };
        void [checkActions, checkProgress, options, invalid, invalidTrigger, missingRetention];
      });
      await t.test("row and job commit together; rollback and hooks remove the job", async () => {
        const before = (await records()).length;
        await assert.rejects(
          instance!.db.tx(async (tx) => {
            const row = await tx[table].insert({}, { returning: "*" });
            const linked = (await tx[table].findOne({ id: row.id }))!;
            assert(linked.job_id);
            assert.equal(row.job_id, linked.job_id);
            assert(await tx[queueName]!.findOne({ id: linked.job_id }));
            const rerun = await instance!.jobs.withTransaction(tx).rerun(linked.job_id);
            assert.equal((await tx[table].findOne({ id: row.id }))!.job_id, rerun.jobId);
            assert(await tx[queueName]!.findOne({ id: rerun.jobId }));
            assert.equal((await records()).length, before);
            await delay(350);
            assert.equal(seen.length, 0);
            throw new Error("Rollback");
          }),
        );
        rejectHook = true;
        await assert.rejects(insert());
        rejectHook = false;
        await assert.rejects(insert({ note: "reject job link" }));
        assert.equal(await instance!.db[table].count({ note: "reject job link" }), 0);
        assert.equal((await records()).length, before);
        assert(instance!.db[queueName]);
        await instance!.db.tx(async (tx) => assert.equal(await tx[queueName]!.count(), before));
      });
      await t.test("plain returning selections add no reads for linked jobs", async () => {
        await assert.rejects(
          instance!.db.tx(async (tx) => {
            const rows = [{ note: "linked" }, { note: "ignored", enabled: false }];
            const before = rowSelectCount;
            await tx[table].insertMany(rows);
            const readsWithoutReturning = rowSelectCount - before;
            const beforeReturning = rowSelectCount;
            const returned = await tx[table].insertMany(rows, { returning: "*" });
            assert.equal(rowSelectCount - beforeReturning, readsWithoutReturning);
            assert(returned[0]!.job_id);
            assert.equal(returned[1]!.job_id, null);
            const beforeProjection = rowSelectCount;
            const projected = await tx[table].insertMany(rows, {
              returning: { job_id: 1, note: 1 },
            });
            assert.equal(rowSelectCount - beforeProjection, readsWithoutReturning);
            assert(projected[0]!.job_id);
            assert.deepEqual(projected, [
              { job_id: projected[0]!.job_id, note: "linked" },
              { job_id: null, note: "ignored" },
            ]);
            throw new Error("Rollback returning test");
          }),
          { message: "Rollback returning test" },
        );
      });
      await t.test(
        "filters and real value changes, including bulk updates and changed primary keys",
        async () => {
          const ignored = await insert({ enabled: false });
          assert.equal(ignored.job, undefined);
          const { row, job } = await insert();
          await status(job.id, "succeeded");
          await instance!.db[table].update({ id: row.id }, { revision: 1, note: "metadata" });
          assert.equal((await records()).length, 1);
          const returned = await instance!.db[table].update(
            { id: row.id },
            { id: row.id + 100, revision: 2 },
            { returning: { job_id: 1, linkedJob: { $upper: ["job_id"] } }, multi: false },
          );
          const updated = (await records())[1]!;
          assert.deepEqual(returned, { job_id: updated.id, linkedJob: updated.id.toUpperCase() });
          assert.deepEqual(updated.target_row_pkey, { id: row.id + 100 });
          assert.equal(
            (await instance!.db[table].findOne({ id: row.id + 100 }))!.job_id,
            updated.id,
          );
          await status(updated.id, "succeeded");
          await instance!.db[table].updateBatch([[{ id: row.id + 100 }, { revision: 3 }]]);
          assert.equal((await records()).length, 3);
          await status((await records())[2]!.id, "succeeded");
        },
      );
      await t.test(
        "conflict updates and upsert respect row job commands and changed columns",
        async () => {
          const trigger = definitions.process!.trigger;
          if (trigger.type !== "row") throw new Error("Expected a row trigger");
          const originalOn = trigger.on;
          try {
            for (const command of ["insert", "update"] as const) {
              trigger.on = [command];
              await instance!.update(
                {
                  jobs: { tableName: queueName, definitions },
                  tableHooks: { ...options.tableHooks, [table]: {} },
                },
                true,
              );
              const note = randomUUID();
              await instance!.db[table].upsert({ note }, { revision: 1 });
              const row = (await instance!.db[table].findOne({ note }))!;
              const rowJobs = () =>
                records("target_row_pkey = ${targetRowPkey:json}", {
                  targetRowPkey: { id: row.id },
                });
              const initialJobs = command === "insert" ? 1 : 0;
              let expectedJobs = initialJobs;
              let revision = 1;
              assert.equal((await rowJobs()).length, initialJobs);
              for (const job of await rowJobs()) await status(job.id, "succeeded");
              for (const onConflict of [
                "DoUpdate" as const,
                { action: "DoUpdate" as const, conflictColumns: ["id"] },
              ]) {
                await instance!.db[table].insert(
                  { id: row.id, revision: ++revision },
                  { onConflict },
                );
                expectedJobs += command === "update" ? 1 : 0;
                assert.equal((await rowJobs()).length, expectedJobs);
                for (const job of await rowJobs()) await status(job.id, "succeeded");
                await instance!.db[table].insert(
                  { id: row.id, revision, note: "metadata only" },
                  { onConflict },
                );
                assert.equal((await rowJobs()).length, expectedJobs);
              }
              assert.equal((await instance!.db[table].findOne({ id: row.id }))!.revision, revision);
              await instance!.db[table].insert(
                { id: row.id, revision: revision + 1 },
                { onConflict: "DoNothing" },
              );
              assert.equal((await rowJobs()).length, expectedJobs);
              await instance!.db[table].upsert({ id: row.id }, { revision: ++revision });
              expectedJobs += command === "update" ? 1 : 0;
              assert.equal((await rowJobs()).length, expectedJobs);
              for (const job of await rowJobs()) await status(job.id, "succeeded");
              await instance!.db[table].upsert({ id: row.id }, { revision, note: "metadata only" });
              assert.equal((await rowJobs()).length, expectedJobs);

              const newId = row.id + 100_000;
              await instance!.db[table].insertMany(
                [
                  { id: row.id, revision: ++revision },
                  { id: newId, revision: 1 },
                ],
                { onConflict: "DoUpdate" },
              );
              expectedJobs += command === "update" ? 1 : 0;
              assert.equal((await rowJobs()).length, expectedJobs);
              const insertedJobs = await records("target_row_pkey = ${targetRowPkey:json}", {
                targetRowPkey: { id: newId },
              });
              assert.equal(insertedJobs.length, command === "insert" ? 1 : 0);
              for (const job of [...(await rowJobs()), ...insertedJobs])
                await status(job.id, "succeeded");

              const jobsBeforeRollback = (await records()).length;
              await assert.rejects(
                instance!.db.tx(async (tx) => {
                  await tx[table].insertMany(
                    [
                      { id: row.id, revision: revision + 1 },
                      { id: newId + 1, revision: 1 },
                    ],
                    { onConflict: "DoUpdate" },
                  );
                  throw new Error("Rollback conflict batch");
                }),
                { message: "Rollback conflict batch" },
              );
              assert.equal((await records()).length, jobsBeforeRollback);
              assert.equal((await instance!.db[table].findOne({ id: row.id }))!.revision, revision);
              assert.equal(await instance!.db[table].findOne({ id: newId + 1 }), undefined);
            }
          } finally {
            trigger.on = originalOn;
            await instance!.update(
              {
                jobs: { tableName: queueName, definitions },
                tableHooks: options.tableHooks,
              },
              true,
            );
          }
        },
      );
      await t.test(
        "retries preserve checkpoints; fail prevents retries; reruns apply defaults and overrides",
        async () => {
          const { row, job } = await insert({ mode: "retry" });
          const completed = await status(job.id, "succeeded");
          assert.equal(completed.attempts, 2);
          assert.equal(completed.error, null);
          assert.deepEqual(completed.progress_numeric, { done: 1, total: 1 });
          controlHooks.length = 0;
          const rerun = await instance!.jobs.rerun(job.id, { size: 20 });
          assert.equal(controlHooks.length, 1);
          assert.deepEqual(
            controlHooks[0]!.invocations.map(({ type }) => type),
            ["jobControl", "trigger"],
          );
          const invocation = controlHooks[0]!.invocations[0]!;
          assert(invocation.type === "jobControl");
          assert.equal(invocation.jobName, "process");
          assert.equal(invocation.operation, "rerun");
          assert.deepEqual(invocation.rowParts, [{ id: row.id }]);
          assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, rerun.jobId);
          await status(rerun.jobId, "succeeded");
          const run = seen.find((entry) => entry.id === rerun.jobId)!;
          assert.equal(run.reason, "rerun");
          assert.deepEqual(run.params, { size: 20 });
          const attempts = seen.filter(({ id }) => id === job.id || id === rerun.jobId);
          assert.equal(attempts.length, 4);
          for (const { id, execution } of attempts) {
            assert.deepEqual(execution.invocations, [
              {
                type: "function",
                id,
                functionName: "process",
                relatedRecords: [{ argName: "row", tableName: table, rowPart: { id: row.id } }],
              },
            ]);
          }
          await assert.rejects(instance!.jobs.rerun(job.id, { size: "wrong" }));
          await assert.rejects(instance!.jobs.rerun(job.id, { unknown: 1 }));
          const permanent = await insert({ mode: "permanent" });
          const failed = await status(permanent.job.id, "failed");
          assert.equal(failed.attempts, 1);
          assert.deepEqual(failed.error, { message: "Permanent failure" });
        },
      );
      await t.test(
        "message and numeric progress are independent and numeric progress is typed",
        async () => {
          const { job } = await insert({ mode: "progress" });
          const completed = await status(job.id, "succeeded");
          assert.equal(completed.progress_message, "Complete");
          assert.deepEqual(completed.progress_numeric, { done: 1, total: 2 });
          for (const progress of [
            { done: 1 },
            { total: 1 },
            { done: "1", total: 1 },
            { done: 1, total: "1" },
            "loading",
          ]) {
            await assert.rejects(
              db.none(
                `UPDATE ${queue} SET progress_numeric = \${progress:json} WHERE id = \${jobId}`,
                { jobId: job.id, progress },
              ),
            );
          }
          await instance!.db[queueName]!.update(
            { id: job.id },
            { progress_numeric: null, progress_message: "" },
          );
          const cleared = (await instance!.jobs.get(job.id))!;
          assert.equal(cleared.progress_numeric, null);
          assert.equal(cleared.progress_message, "");
          const schema = (await instance!.getTSSchema()).tsSchema;
          assert(schema.includes("done: number;"));
          assert(schema.includes("total: number;"));
        },
      );
      await t.test("failures retain structured JSONB errors", async () => {
        const details = { operation: "extract", retryable: false };
        for (const { thrown, stored } of [
          {
            thrown: { message: "Job failure", details },
            stored: { message: "Job failure", details },
          },
          {
            thrown: Object.assign(new Error("Job failure"), { code: "JOB_FAILURE", details }),
            stored: { message: "Job failure", code: "JOB_FAILURE", details },
          },
          { thrown: ["Job failure", details], stored: ["Job failure", details] },
          { thrown: "Job failure", stored: "Job failure" },
          { thrown: null, stored: "null" },
          { thrown: undefined, stored: "undefined" },
        ]) {
          jobFailure = thrown;
          const { job } = await insert({ mode: "error" });
          const failed = await status(job.id, "failed");
          assert.equal(failed.attempts, 3);
          assert.deepEqual(failed.error, stored);
        }
      });
      await t.test(
        "job ID writes do not recursively fire unrestricted update triggers",
        async () => {
          const trigger = definitions.process!.trigger;
          assert(trigger.type === "row");
          const columns = trigger.columns;
          delete trigger.columns;
          try {
            const { row, job } = await insert();
            await status(job.id, "succeeded");
            const rerun = await instance!.jobs.rerun(job.id);
            await status(rerun.jobId, "succeeded");
            assert.equal(
              (
                await records("target_row_pkey = ${targetRowPkey:json}", {
                  targetRowPkey: { id: row.id },
                })
              ).length,
              2,
            );
            assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, rerun.jobId);
          } finally {
            trigger.columns = columns;
          }
        },
      );
      await t.test("queue serializes each row and re-fetches it at run start", async () => {
        const { row, job } = await insert({ mode: "block" });
        await eventually(() => blocked.has(job.id));
        await instance!.db[table].update({ id: row.id }, { revision: 2 });
        const next = (
          await records("target_row_pkey = ${targetRowPkey:json}", {
            targetRowPkey: { id: row.id },
          })
        )[1]!;
        await delay(350);
        assert.equal((await instance!.jobs.get(next.id))!.attempts, 0);
        await instance!.db[table].update({ id: row.id }, { revision: 3, mode: null });
        released.add(job.id);
        await status(next.id, "succeeded");
        assert.equal(seen.find((entry) => entry.id === next.id)!.revision, 3);
      });
      await t.test("publish controls job reads and functions control job actions", async () => {
        const { job, row: sourceRow } = await insert();
        await status(job.id, "succeeded");
        await instance!.db[queueName]!.update({ id: job.id }, { user_id: "alice" });
        const visibleJob = { id: job.id, job_name: "process", status: "succeeded" };
        assert.deepEqual(await instance!.jobs.get(job.id, { userId: "alice" }), visibleJob);
        assert.equal(await instance!.jobs.get(job.id, { userId: "bob" }), undefined);
        const alice = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
        const bob = await instance!.getClientDBHandlers({ userId: "bob" }, undefined);
        const admin = await instance!.getClientDBHandlers({ userId: "admin" }, undefined);
        assert.deepEqual(
          alice.clientSchema.methods.find((method) => method.name === "rerunJob")?.input,
          options.functions!.members!.functions.rerunJob!.input,
        );
        assert.deepEqual(await alice.clientDb[queueName]!.findOne({ id: job.id }), visibleJob);
        assert.deepEqual(await bob.clientDb[queueName]!.find(), []);
        await assert.rejects(alice.clientDb[queueName]!.find({}, { select: { params: 1 } }));
        assert(!("update" in alice.clientDb[queueName]!));
        assert(!bob.clientMethods.rerunJob);
        const select = { [ROW_ACTIONS_COLUMN]: 1 } as const;
        assert.deepEqual(await alice.clientDb[queueName]!.findOne({ id: job.id }, { select }), {
          [ROW_ACTIONS_COLUMN]: ["rerunJob"],
        });
        assert.deepEqual(await admin.clientDb[queueName]!.findOne({ id: job.id }, { select }), {
          [ROW_ACTIONS_COLUMN]: [],
        });
        assert.deepEqual(
          await alice.clientDb[table].findOne(
            { id: sourceRow.id },
            {
              select: {
                runs: {
                  $leftJoin: [{ table: queueName, on: [{ owner: "user_id" }] }],
                  filter: { id: job.id },
                  select,
                },
              },
            },
          ),
          { runs: [{ [ROW_ACTIONS_COLUMN]: ["rerunJob"] }] },
        );
        const columns = await alice.clientDb[queueName]!.getColumns();
        assert(!columns.some((column) => column.name === "actions"));
        const rerun = (await alice.clientMethods.rerunJob!.run({ id: job.id, size: 30 })) as {
          jobId: string;
        };
        assert.equal((await status(rerun.jobId, "succeeded")).user_id, "alice");
        await assert.rejects(
          async () => await alice.clientMethods.cancelJob!.run({ row: { id: job.id } }),
        );
        await assert.rejects(
          async () => await alice.clientMethods.rerunJob!.run({ id: job.id, size: "wrong" }),
        );
        const handler = instance!.db[queueName] as unknown as TableHandler;
        const prostgles = handler.dboBuilder.prostgles;
        const clientReq = createServerSideRequest(prostgles, "alice");
        const rules = await prostgles.publishParser!.getValidatedRequestRuleWusr(
          { tableName: queueName, command: "find", clientReq },
          undefined,
        );
        let observedActions: string[] | undefined;
        const subscription = await handler.subscribe(
          { id: job.id },
          { select },
          (rows) => {
            observedActions = rows[0]?.[ROW_ACTIONS_COLUMN];
          },
          rules,
          {
            clientReq,
            isRemoteRequest: { user: { id: "alice", type: "member" }, clientInfo: undefined },
          },
        );
        assert("unsubscribe" in subscription && typeof subscription.unsubscribe === "function");
        try {
          await eventually(() => !!observedActions?.includes("rerunJob"));
          await instance!.db[table].update({ owner: "alice" }, { enabled: false });
          await eventually(() => observedActions?.length === 0);
          await assert.rejects(async () => await alice.clientMethods.rerunJob!.run({ id: job.id }));
          await instance!.db[table].update({ id: sourceRow.id }, { enabled: true });
          await eventually(() => !!observedActions?.includes("rerunJob"));
        } finally {
          await subscription.unsubscribe();
        }
        const { job: running } = await insert({ mode: "block" });
        await eventually(() => blocked.has(running.id));
        assert.deepEqual(await alice.clientDb[queueName]!.findOne({ id: running.id }, { select }), {
          [ROW_ACTIONS_COLUMN]: ["cancelJob"],
        });
        await alice.clientMethods.cancelJob!.run({ row: { id: running.id } });
        await status(running.id, "cancelled");
        definitions.process!.runAs = "user";
        await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
        await assert.rejects(insert(), { message: /requires a user/ });
        await assert.rejects(
          instance!.db.tx(async (tx) => {
            try {
              await tx[table].insert({});
            } catch {
              /* The transaction must still roll back. */
            }
          }),
          { message: /requires a user/ },
        );
        const client = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
        const row = await client.clientDb[table].insert({}, { returning: "*" });
        const queued = (
          await records("target_row_pkey = ${targetRowPkey:json}", {
            targetRowPkey: { id: row.id },
          })
        )[0]!;
        await status(queued.id, "succeeded");
        assert.equal(seen.find((entry) => entry.id === queued.id)!.user, "alice");
        delete definitions.process!.runAs;
        await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
      });
      await t.test(
        "job controls validate and prepare in one callback, start, retry, rerun and cancel atomically",
        async () => {
          const alice = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
          for (const [name, rowArg, operation, allowedStatuses] of [
            ["controlRecord", "row", "startOrRetry", ["failed", "cancelled"]],
            ["rerunRecord", "row", "rerun", ["succeeded"]],
            ["cancelRecord", "row", "cancel", ["pending", "running"]],
          ] as const) {
            const method = alice.clientSchema.methods.find((method) => method.name === name)!;
            assert.equal(method.jobControl?.operation, operation);
            assert.equal(alice.clientMethods[name]!.jobControl?.operation, operation);
            assert.deepEqual(method.input, { row: { type: "RowLookup", table } });
            assert.deepEqual(method.jobControl, {
              jobName: "process",
              rowArg,
              operation,
              allowedStatuses,
              tableName: queueName,
              columnName: "job_id",
            });
          }
          const control = (id: number) =>
            alice.clientMethods.controlRecord!.run({ row: { id } }) as Promise<{ jobId: string }>;
          const cancel = (id: number) => alice.clientMethods.cancelRecord!.run({ row: { id } });
          const prostgles = (instance!.db.records as unknown as TableHandler).dboBuilder.prostgles;
          const asAlice = <T>(run: () => Promise<T>) =>
            prostgles.runWithExecution(
              {
                runId: randomUUID(),
                invocations: [],
                user: { id: "alice", type: "member" },
                clientReq: createServerSideRequest(prostgles, "alice"),
              },
              run,
            );
          const manualRow = async (owner = "alice", note: string | null = null, enabled = true) =>
            db.one<JobTestRow>(
              `INSERT INTO records (owner, note, enabled, mode) VALUES ($1, $2, $3, 'block') RETURNING *`,
              [owner, note, enabled],
            );
          for (const row of [
            await manualRow("bob"),
            await manualRow("alice", null, false),
            await manualRow("alice", "deny control"),
          ]) {
            await assert.rejects(control(row.id));
            assert.equal((await instance!.db.records.findOne({ id: row.id }))!.job_id, null);
          }
          const rejected = await manualRow();
          for (const note of ["reject preparation", "reject job link"]) {
            await db.none("UPDATE records SET note = $1 WHERE id = $2", [note, rejected.id]);
            await assert.rejects(control(rejected.id));
            assert.equal((await instance!.db.records.findOne({ id: rejected.id }))!.revision, 1);
            assert.equal(
              (
                await records("target_row_pkey = ${targetRowPkey:json}", {
                  targetRowPkey: { id: rejected.id },
                })
              ).length,
              0,
            );
          }
          await db.none("UPDATE records SET note = NULL WHERE id = $1", [rejected.id]);
          const row = await manualRow("alice", "prepared");
          await assert.rejects(
            alice.clientMethods.controlRecord!.run({ row: { id: row.id }, note: "extra" }),
          );
          await assert.rejects(
            alice.clientMethods.controlRecord!.run({ row: { note: "prepared" } }),
            /primary key/,
          );
          await assert.rejects(cancel(row.id), /Job has not started/);
          const mutationsBeforeStart = rowMutationCount;
          controlCallbacks.length = 0;
          controlHooks.length = 0;
          const started = await control(row.id);
          assert(preparationJobs);
          await assert.rejects(preparationJobs.get(started.jobId), /active transaction/);
          assert.equal(controlCallbacks.length, 1);
          const execution = controlCallbacks[0]!;
          assert.deepEqual(
            execution.invocations.map(({ type }) => type),
            ["function", "jobControl"],
          );
          const invocation = execution.invocations[1]!;
          assert(invocation.type === "jobControl");
          assert.equal(invocation.jobName, "process");
          assert.equal(invocation.operation, "startOrRetry");
          assert.equal(invocation.tableName, table);
          assert.deepEqual(invocation.rowParts, [{ id: row.id }]);
          assert.equal(controlHooks.length, 2);
          for (const hookExecution of controlHooks) {
            assert.equal(hookExecution.runId, execution.runId);
            assert.equal(hookExecution.user?.id, "alice");
            assert.deepEqual(hookExecution.invocations.slice(0, -1), execution.invocations);
            assert.equal(hookExecution.invocations.at(-1)!.type, "trigger");
          }
          assert.equal(
            (instance!.db[table] as unknown as TableHandler).dboBuilder.prostgles.getExecution(),
            undefined,
          );
          assert.equal(
            rowMutationCount - mutationsBeforeStart,
            2,
            "only preparation and job linking mutate the row",
          );
          const firstRun = await status(started.jobId, "running");
          assert.equal(firstRun.user_id, "alice");
          assert.equal(firstRun.reason, "trigger");
          assert.deepEqual(firstRun.params, { size: 10 });
          assert.equal((await instance!.db.records.findOne({ id: row.id }))!.revision, 2);
          await assert.rejects(control(row.id), /not allowed/);
          await assert.rejects(
            asAlice(() =>
              instance!.db.tx(async (dbx) => {
                await dbx.records.update({ id: row.id }, { note: "must roll back" });
                try {
                  await instance!.jobs.withTransaction(dbx).control("process", {
                    row: { id: row.id },
                    operation: "startOrRetry",
                  });
                } catch {
                  /* Caught controls still abort their transaction. */
                }
              }),
            ),
            /not allowed/,
          );
          assert.equal((await instance!.db.records.findOne({ id: row.id }))!.note, "prepared");
          await assert.rejects(
            asAlice(() =>
              instance!.db.tx(async (dbx) => {
                await instance!.jobs.withTransaction(dbx).control("process", {
                  row: { id: row.id },
                  operation: "cancel",
                });
                throw new Error("Roll back cancellation");
              }),
            ),
            /Roll back cancellation/,
          );
          assert.equal((await instance!.jobs.get(started.jobId))!.cancel_requested, false);
          const mutationsBeforeCancel = rowMutationCount;
          await cancel(row.id);
          assert.equal(
            rowMutationCount,
            mutationsBeforeCancel,
            "cancellation does not run row mutation hooks",
          );
          await status(started.jobId, "cancelled");
          const retried = await control(row.id);
          assert.notEqual(retried.jobId, started.jobId);
          assert.equal((await status(retried.jobId, "running")).reason, "rerun");
          released.add(retried.jobId);
          await status(retried.jobId, "succeeded");
          await assert.rejects(control(row.id), /not allowed/);
          await assert.rejects(cancel(row.id), /not allowed/);
          const rerun = (await alice.clientMethods.rerunRecord!.run({ row: { id: row.id } })) as {
            jobId: string;
          };
          released.add(rerun.jobId);
          await status(rerun.jobId, "succeeded");
          assert.equal(
            (
              await records("target_row_pkey = ${targetRowPkey:json}", {
                targetRowPkey: { id: row.id },
              })
            ).length,
            3,
          );
          assert.equal((await instance!.db.records.findOne({ id: row.id }))!.job_id, rerun.jobId);
          await db.none("UPDATE records SET job_id = $1 WHERE id = $2", [rerun.jobId, rejected.id]);
          await assert.rejects(control(rejected.id), /Linked job does not match/);
          const changedOwner = await manualRow();
          const ownerJob = await control(changedOwner.id);
          await status(ownerJob.jobId, "running");
          let cancellation: Promise<PromiseSettledResult<unknown>[]> | undefined;
          await db.tx(async (gate) => {
            await gate.none("UPDATE records SET owner = 'bob' WHERE id = $1", [changedOwner.id]);
            cancellation = Promise.allSettled([cancel(changedOwner.id)]);
            await waitForControlClaims(gate, 1);
          });
          assert.equal((await cancellation!)[0]!.status, "rejected");
          assert.equal((await instance!.jobs.get(ownerJob.jobId))!.cancel_requested, false);
          released.add(ownerJob.jobId);
          await status(ownerJob.jobId, "succeeded");
          const concurrent = await manualRow();
          for (let attempt = 1; attempt <= 2; attempt++) {
            let attempts: Promise<PromiseSettledResult<{ jobId: string }>[]> | undefined;
            await db.tx(async (gate) => {
              await gate.one("SELECT id FROM records WHERE id = $1 FOR UPDATE", [concurrent.id]);
              attempts = Promise.allSettled([control(concurrent.id), control(concurrent.id)]);
              await waitForControlClaims(gate, 2);
            });
            const results = await attempts!;
            assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
            assert.equal(results.filter((result) => result.status === "rejected").length, 1);
            const jobs = await records("target_row_pkey = ${targetRowPkey:json}", {
              targetRowPkey: { id: concurrent.id },
            });
            assert.equal(jobs.length, attempt);
            await status(jobs.at(-1)!.id, "running");
            await cancel(concurrent.id);
            await status(jobs.at(-1)!.id, "cancelled");
          }
        },
      );
      await t.test(
        "job control preparation preserves sibling jobs with single-row read limits",
        async () => {
          const [target, sibling] = await db.many<JobTestRow>(
            "INSERT INTO records (note) VALUES ('control target'), ('control sibling') RETURNING *",
          );
          assert(target && sibling);
          try {
            await instance!.update({
              publish: ({ user }) => ({
                records: {
                  select: { fields: "*", forcedFilter: { owner: user?.id }, maxLimit: 1 },
                },
              }),
              functions: {
                members: {
                  userFilter: { id: "alice" },
                  functions: {
                    prepareRecords: defineJobControl({
                      jobName: "process",
                      operation: "startOrRetry",
                      run: async ({ row, dbx }) => {
                        await dbx.records.update(
                          { id: { $in: [row.id, sibling.id] } },
                          { revision: 2 },
                        );
                      },
                    }),
                  },
                },
              },
            });
            const alice = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
            await alice.clientMethods.prepareRecords!.run({ row: { id: target.id } });
            for (const originalRow of [target, sibling]) {
              const row = (await instance!.db.records.findOne({ id: originalRow.id }))!;
              assert.equal(row.revision, 2);
              const jobs = await records("target_row_pkey = ${targetRowPkey:json}", {
                targetRowPkey: { id: row.id },
              });
              assert.equal(jobs.length, 1, "each prepared row must enqueue exactly one job");
              assert.equal(row.job_id, jobs[0]!.id);
              await status(row.job_id, "succeeded");
            }
          } finally {
            await instance!.update({ publish: options.publish, functions: options.functions });
          }
        },
      );
      await t.test(
        "queue publishes wildcards as select-only and rejects explicit write rules",
        async () => {
          const { job } = await insert();
          await status(job.id, "succeeded");
          const handler = instance!.db[queueName] as unknown as TableHandler;
          const prostgles = handler.dboBuilder.prostgles;
          const clientReq = createServerSideRequest(prostgles, "alice");
          const updateJob = () =>
            runClientRequest.call(
              prostgles,
              {
                tableName: queueName,
                command: "update",
                param1: { id: job.id },
                param2: { params: { size: 999 } },
                param3: undefined,
              },
              clientReq,
              undefined,
            );
          const invalid: NonNullable<ProstglesInitOptions<JobTestSchema>["publish"]>[] = [
            ...["insert", "update", "delete"].map((command) => ({
              [queueName]: { select: "*" as const, [command]: "*" },
            })),
            () => ({ [queueName]: { update: "*" } }),
          ];
          const valid: typeof invalid = [
            "*",
            ["*", { select: true, insert: true, update: true, delete: true }],
            { [queueName]: "*" },
            { [queueName]: true },
            () => ({ [queueName]: "*" }),
            { [queueName]: { select: "*", insert: false, update: false, delete: false } },
          ];
          try {
            await instance!.update({ publish: ["*", { update: true }] });
            const writeOnlyClient = await instance!.getClientDBHandlers(
              { userId: "alice" },
              undefined,
            );
            assert.equal(writeOnlyClient.clientSchema.err, undefined);
            assert.equal(writeOnlyClient.clientDb[queueName], undefined);
            await assert.rejects(updateJob());
            for (const publish of invalid) {
              await instance!.update({ publish });
              const client = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
              assert.match(client.clientSchema.err!, /publish validation failed/);
              assert.equal(client.clientDb[queueName], undefined);
              // A direct request must also reject the rule without relying on the client schema.
              await assert.rejects(updateJob(), /only supports select/);
            }
            for (const publish of valid) {
              await instance!.update({ publish });
              const client = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
              assert.equal(client.clientSchema.err, undefined);
              assert.equal((await client.clientDb[queueName]!.findOne({ id: job.id }))!.id, job.id);
              for (const command of ["insert", "update", "delete"]) {
                assert(!(command in client.clientDb[queueName]!));
              }
              await assert.rejects(updateJob());
            }
            assert.deepEqual((await instance!.jobs.get(job.id))!.params, { size: 10 });
          } finally {
            await instance!.update({ publish: options.publish });
          }
        },
      );
      await t.test(
        "job reads from hooks retain request permissions and server controls retain the user",
        async () => {
          const { row, job } = await insert();
          await status(job.id, "succeeded");
          const before = (await records()).length;
          const clientReq = {
            httpReq: {
              ip: "127.0.0.1",
              connection: { remoteAddress: "127.0.0.1" },
              headers: {
                authorization: `Bearer ${Buffer.from("anonymous-job-test").toString("base64")}`,
              },
            },
            res: {},
          } as AuthClientRequest;
          let action = async (jobs: Jobs) => {
            assert.equal(await jobs.get(job.id), undefined);
          };
          const publish: PublishFullyTyped<JobTestSchema> = {};
          publish[table] = { update: { fields: ["note"], filterFields: ["id"] } };
          publish[queueName] = { select: { fields: ["id"], forcedFilter: { status: "failed" } } };
          try {
            await instance!.update({
              publish,
              tableHooks: {
                ...options.tableHooks,
                [table]: {
                  afterEach: [
                    {
                      commands: { update: 1 },
                      preventRecursion: true,
                      validate: ({ dbx }) => action(instance!.jobs.withTransaction(dbx)),
                    },
                  ],
                },
              },
            });
            const client = await instance!.getClientDBHandlers(clientReq, undefined);
            const update = () =>
              client.clientDb[table].update({ id: row.id }, { note: "job action" });
            await update();
            const visiblePublish = { ...publish };
            visiblePublish[queueName] = { select: { fields: ["id"] } };
            await instance!.update({ publish: visiblePublish });
            action = async (jobs) => {
              assert.deepEqual(await jobs.get(job.id), { id: job.id });
            };
            await update();
            action = (jobs) => jobs.cancel(job.id);
            await update();
            assert.equal((await records()).length, before);
            assert.equal((await instance!.jobs.get(job.id))!.cancel_requested, false);
            await instance!.update({
              auth: {
                ...options.auth!,
                getUser: () => ({
                  user: { id: "alice", type: "member" },
                  clientUser: { id: "alice", type: "member" },
                }),
              },
            });
            let rerunId = "";
            action = async (jobs) => {
              await jobs.rerun(job.id);
              throw new Error("Rollback rerun");
            };
            await assert.rejects(update(), { message: "Rollback rerun" });
            assert.equal((await records()).length, before);
            assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, job.id);
            action = async (jobs) => {
              rerunId = (await jobs.rerun(job.id)).jobId;
            };
            await update();
            assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, rerunId);
            assert.equal((await status(rerunId, "succeeded")).user_id, "alice");
          } finally {
            await instance!.update({
              publish: options.publish,
              tableHooks: options.tableHooks,
              auth: options.auth,
            });
          }
        },
      );
      await t.test(
        "queue uses tableConfig, table hooks, literal JSON and subscriptions",
        async () => {
          const jobs = instance!.db[queueName]!;
          const id = randomUUID();
          const subscription = await jobs.subscribe({ id }, {}, (rows) => {
            if (rows[0]?.cancel_requested) {
              released.add(id);
            }
          });
          try {
            const row = await jobs.insert(
              {
                id,
                job_name: "manual",
                target_row_pkey: {},
                params: { $to_timestamp: [123] },
                max_attempts: 1,
                delay_ms: 0,
                backoff: "fixed",
              },
              { returning: "*" },
            );
            assert.deepEqual(row.params, { $to_timestamp: [123] });
            assert(enqueued.has(id), "The queue insert must run normal table hooks");
            await jobs.update({ id }, { cancel_requested: true });
            await eventually(() => released.has(id));
            await assert.rejects(jobs.update({ id }, { status: "running" }));
            await db.none(`DROP INDEX "${queueName}_pending"`);
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
            assert(
              await db.oneOrNone(
                "SELECT 1 FROM pg_indexes WHERE tablename = ${tableName} AND indexname = ${indexName}",
                { tableName: queueName, indexName: `${queueName}_pending` },
              ),
            );
            assert(await instance!.jobs.get(id));
          } finally {
            await subscription.unsubscribe();
            await jobs.delete({ id });
          }
        },
      );
      await t.test("skip, replace, cancellation and timeouts", async () => {
        definitions.process!.onConflict = "skip";
        await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
        const { row, job } = await insert({ mode: "block" });
        await eventually(() => blocked.has(job.id));
        await instance!.db[table].update({ id: row.id }, { revision: 2, job_id: null });
        assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, job.id);
        assert.deepEqual(await instance!.jobs.rerun(job.id), { jobId: job.id });
        assert.equal(
          (
            await records("target_row_pkey = ${targetRowPkey:json}", {
              targetRowPkey: { id: row.id },
            })
          ).length,
          1,
        );
        await instance!.jobs.cancel(job.id);
        await status(job.id, "cancelled");
        definitions.process!.onConflict = "replace";
        await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
        const replacing = await insert({ mode: "block" });
        await eventually(() => blocked.has(replacing.job.id));
        await instance!.db[table].update({ id: replacing.row.id }, { revision: 2, mode: null });
        await status(replacing.job.id, "cancelled");
        const replacement = (
          await records("target_row_pkey = ${targetRowPkey:json}", {
            targetRowPkey: { id: replacing.row.id },
          })
        )[1]!;
        assert.equal(
          (await instance!.db[table].findOne({ id: replacing.row.id }))!.job_id,
          replacement.id,
        );
        await status(replacement.id, "succeeded");
        definitions.process!.timeoutMs = 20;
        definitions.process!.retry = { maxAttempts: 1 };
        await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
        const timed = await insert({ mode: "block" });
        assert.deepEqual((await status(timed.job.id, "failed")).error, {
          message: "Job timed out",
        });
        delete definitions.process!.timeoutMs;
        delete definitions.process!.onConflict;
        await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
      });
      await t.test(
        "claims enforce concurrency across instances and recover expired leases",
        async () => {
          other = await prostgles<JobTestSchema>(options);
          const entries = await Promise.all([
            insert({ mode: "block" }),
            insert({ mode: "block" }),
            insert({ mode: "block" }),
          ]);
          await eventually(() => entries.filter(({ job }) => blocked.has(job.id)).length === 2);
          assert.equal((await records("status = 'running'")).length, 2);
          for (const { job } of entries) released.add(job.id);
          for (const { job } of entries) await status(job.id, "succeeded");
          await other.destroy();
          other = undefined;
          // Simulate a process that died while holding a lease.
          const recovered = await insert({ enabled: false });
          await db.none(
            `INSERT INTO ${queue} (id, job_name, target_table, target_row_pkey, params, status, attempts,
          max_attempts, delay_ms, backoff, lease_token, locked_until, checkpoint)
          VALUES (\${jobId}, 'process', \${targetTable}, \${targetRowPkey:json}, '{"size":10}', 'running', 1, 3, 0, 'fixed', \${leaseToken},
            clock_timestamp() - interval '1 second', '{"done":1}')`,
            {
              jobId: randomUUID(),
              targetTable: table,
              targetRowPkey: { id: recovered.row.id },
              leaseToken: randomUUID(),
            },
          );
          const lost = (await records("status = 'running'"))[0]!;
          await status(lost.id, "succeeded");
          assert.equal((await instance!.jobs.get(lost.id))!.attempts, 2);
          await db.none(
            `UPDATE ${queue} SET status = 'running', max_attempts = attempts, lease_token = \${leaseToken},
              locked_until = clock_timestamp() - interval '1 second', finished_at = NULL WHERE id = \${jobId}`,
            { jobId: lost.id, leaseToken: randomUUID() },
          );
          assert.deepEqual((await status(lost.id, "failed")).error, {
            message: "Worker interrupted",
          });
        },
      );
      await t.test("hooks and returning include database changes from job ID updates", async () => {
        await db.none(`CREATE FUNCTION update_linked_note() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.job_id IS DISTINCT FROM OLD.job_id AND NEW.note = 'skip link' THEN RETURN NULL; END IF;
            IF NEW.job_id IS DISTINCT FROM OLD.job_id THEN NEW.note := 'linked-' || NEW.job_id::text; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER update_linked_note BEFORE UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION update_linked_note()`);
        try {
          const { row, job } = await insert();
          assert.equal(row.note, `linked-${job.id}`);
          await status(job.id, "succeeded");
          const unlinkedRow = await instance!.db[table].insert(
            { note: "skip link" },
            { returning: "*" },
          );
          assert.equal(unlinkedRow.job_id, null);
          const [unlinkedJob] = await records("target_row_pkey = ${targetRowPkey:json}", {
            targetRowPkey: { id: unlinkedRow.id },
          });
          await status(unlinkedJob!.id, "succeeded");
        } finally {
          await db.none(
            `DROP TRIGGER update_linked_note ON ${table}; DROP FUNCTION update_linked_note()`,
          );
        }
      });
      await t.test(
        "job links run normal hooks and reruns prevent only their own job recursion",
        async () => {
          const trigger = definitions.process!.trigger;
          if (trigger.type !== "row") throw new Error("Expected a row trigger");
          const originalColumns = trigger.columns;
          const beforeLinks: string[] = [];
          const afterLinks: string[] = [];
          const afterAllLinks: string[] = [];
          const committedLinks: string[] = [];
          let rejectLink = false;
          trigger.columns = undefined;
          definitions.observeLink = defineJob({
            trigger: { type: "row", table, on: ["update"], columns: ["job_id"] },
            run: async () => {},
          });
          try {
            await instance!.update(
              {
                jobs: { tableName: queueName, definitions },
                tableHooks: {
                  ...options.tableHooks,
                  [table]: {
                    beforeEach: [
                      {
                        commands: { update: 1 },
                        changedFields: ["job_id"],
                        validate: ({ command, data }) => {
                          if (command !== "update") return;
                          if (rejectLink) throw new Error("Reject job link hook");
                          beforeLinks.push(String(data.job_id));
                          return { row: { ...data, note: "from link hook" } };
                        },
                      },
                    ],
                    afterEach: [
                      ...options.tableHooks![table]!.afterEach!,
                      {
                        commands: { insert: 1 },
                        validate: ({ row }) => {
                          assert(row.job_id);
                        },
                      },
                      {
                        commands: { update: 1 },
                        changedFields: ["job_id"],
                        validate: ({ row }) => {
                          afterLinks.push(row.job_id!);
                        },
                      },
                    ],
                    afterAll: [
                      {
                        commands: { update: 1 },
                        changedFields: ["job_id"],
                        validate: ({ rows }) => {
                          afterAllLinks.push(...rows.map((row) => row.job_id!));
                          return Promise.resolve();
                        },
                      },
                    ],
                    afterCommit: [
                      {
                        commands: { update: 1 },
                        changedFields: ["job_id"],
                        run: ({ rows }) => {
                          committedLinks.push(...rows.map((row) => row.job_id!));
                        },
                      },
                    ],
                  },
                },
              },
              true,
            );
            const { row, job } = await insert();
            assert.equal(row.note, "from link hook");
            await status(job.id, "succeeded");
            const rerun = await instance!.jobs.rerun(job.id);
            await status(rerun.jobId, "succeeded");
            const expectedLinks = [job.id, rerun.jobId];
            assert.deepEqual(beforeLinks, expectedLinks);
            assert.deepEqual(afterLinks, expectedLinks);
            assert.deepEqual(afterAllLinks, expectedLinks);
            assert.deepEqual(committedLinks, expectedLinks);
            const rowJobs = await records("target_row_pkey = ${targetRowPkey:json}", {
              targetRowPkey: { id: row.id },
            });
            assert.deepEqual(
              rowJobs.filter((job) => job.job_name === "process").map((job) => job.id),
              expectedLinks,
            );
            assert.equal(rowJobs.filter((job) => job.job_name === "observeLink").length, 2);
            for (const rowJob of rowJobs) await status(rowJob.id, "succeeded");
            const beforeRejection = (await records()).length;
            rejectLink = true;
            await assert.rejects(insert({ note: "rejected by link hook" }), {
              message: "Reject job link hook",
            });
            assert.equal(await instance!.db[table].count({ note: "rejected by link hook" }), 0);
            assert.equal((await records()).length, beforeRejection);
          } finally {
            trigger.columns = originalColumns;
            delete definitions.observeLink;
            await instance!.update(
              {
                jobs: { tableName: queueName, definitions },
                tableHooks: options.tableHooks,
              },
              true,
            );
          }
        },
      );
      await t.test(
        "bound jobs read their transaction, roll back together and reject expired handlers",
        async () => {
          const { row, job } = await insert();
          await status(job.id, "succeeded");
          assert.throws(() => instance!.jobs.withTransaction(instance!.db), /active transaction/);
          const alice = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
          for (const [rollback, useClientHandlers] of [
            [false, false],
            [true, false],
            [false, true],
            [true, true],
          ]) {
            let boundJobs: Jobs | undefined;
            let handlers: object | undefined;
            let rerunId = "";
            const runTransaction = useClientHandlers ? alice.withClientDbTx : instance!.db.tx;
            const transaction = runTransaction(async (dbx: object) => {
              handlers = dbx;
              const jobs = instance!.jobs.withTransaction(dbx);
              boundJobs = jobs;
              assert.throws(() => jobs.withTransaction({ ...dbx }), /active transaction/);
              rerunId = (await jobs.rerun(job.id)).jobId;
              assert.equal((await jobs.get(rerunId))!.status, "pending");
              assert.deepEqual(await jobs.get(rerunId, { userId: "alice" }), {
                id: rerunId,
                job_name: "process",
                status: "pending",
              });
              assert.equal(await instance!.jobs.get(rerunId), undefined);
              await jobs.cancel(rerunId);
              assert.equal((await jobs.get(rerunId))!.status, "cancelled");
              if (rollback) {
                try {
                  await jobs.cancel(randomUUID());
                } catch {
                  /* Caught job errors must still abort the transaction. */
                }
              }
            });
            if (rollback) await assert.rejects(transaction, /Job not found/);
            else await transaction;
            assert.equal(
              (await instance!.jobs.get(rerunId))?.status,
              rollback ? undefined : "cancelled",
            );
            assert(boundJobs && handlers);
            const completedHandlers = handlers;
            assert.throws(
              () => instance!.jobs.withTransaction(completedHandlers),
              /active transaction/,
            );
            await assert.rejects(boundJobs.get(job.id), /active transaction/);
            await assert.rejects(boundJobs.cancel(job.id), /active transaction/);
            await assert.rejects(boundJobs.rerun(job.id), /active transaction/);
            await assert.rejects(
              boundJobs.control("process", {
                row: { id: row.id },
                operation: "rerun",
              }),
              /active transaction/,
            );
          }
        },
      );
      await t.test(
        "bound jobs keep their explicit transaction inside another transaction",
        async () => {
          const first = await insert();
          const second = await insert();
          await status(first.job.id, "succeeded");
          await status(second.job.id, "succeeded");
          let outerJobId = "";
          let innerJobId = "";
          await instance!.db.tx(async (outerDbx) => {
            const outerJobs = instance!.jobs.withTransaction(outerDbx);
            await assert.rejects(
              instance!.db.tx(async (innerDbx) => {
                const innerJobs = instance!.jobs.withTransaction(innerDbx);
                outerJobId = (await outerJobs.rerun(first.job.id)).jobId;
                innerJobId = (await innerJobs.rerun(second.job.id)).jobId;
                assert.equal(await outerJobs.get(innerJobId), undefined);
                assert.equal(await innerJobs.get(outerJobId), undefined);
                throw new Error("Roll back inner transaction");
              }),
              /Roll back inner transaction/,
            );
            assert.equal((await outerJobs.get(outerJobId))!.status, "pending");
          });
          await status(outerJobId, "succeeded");
          assert.equal(await instance!.jobs.get(innerJobId), undefined);
        },
      );
      await t.test(
        "standalone jobs in inner transaction callbacks survive outer rollback",
        async () => {
          const { job } = await insert();
          await status(job.id, "succeeded");
          const builder = (instance!.db.records as unknown as TableHandler).dboBuilder;
          for (const rollback of [false, true]) {
            let rerunId = "";
            await assert.rejects(
              instance!.db.tx(async () => {
                const inner = instance!.db.tx((_dbx, transaction) => {
                  const register =
                    rollback ?
                      builder.registerOnRollbackCallback
                    : builder.registerOnCommitCallback;
                  register(transaction, async () => {
                    rerunId = (await instance!.jobs.rerun(job.id)).jobId;
                  });
                  if (rollback) throw new Error("Roll back inner transaction");
                });
                if (rollback) await assert.rejects(inner, /Roll back inner transaction/);
                else await inner;
                assert(rerunId);
                throw new Error("Roll back outer transaction");
              }),
              /Roll back outer transaction/,
            );
            await status(rerunId, "succeeded");
          }
        },
      );
      await t.test(
        "detached reruns start a new transaction after their parent finishes",
        async () => {
          const { row, job } = await insert();
          await status(job.id, "succeeded");
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          let detachedRerun!: Promise<{ jobId: string }>;
          await instance!.db.tx(() => {
            detachedRerun = gate.then(() => instance!.jobs.rerun(job.id));
          });
          release();
          const { jobId } = await detachedRerun;
          await status(jobId, "succeeded");
          assert.equal((await instance!.db[table].findOne({ id: row.id }))!.job_id, jobId);
        },
      );
      await t.test(
        "schedules deduplicate across workers, respect read access and support timezones",
        async () => {
          const scheduled: string[] = [];
          definitions.brokenSchedule = defineJob({
            trigger: { type: "schedule", cron: "* * * * * *" },
            retention: { succeeded: "forever" },
            runAs: "user",
            run: async () => {},
          });
          await assert.rejects(
            instance!.update({ jobs: { tableName: queueName, definitions } }, true),
            /Scheduled job brokenSchedule cannot runAs user/,
          );
          delete definitions.brokenSchedule.runAs;
          rejectSchedule = true;
          definitions.schedule = defineJob({
            trigger: { type: "schedule", cron: "* * * * * *" },
            retention: { succeeded: "forever" },
            run: async ({ row, run, progress }) => {
              assert.equal(row, undefined);
              assert.deepEqual(getExecution().invocations, [
                { type: "function", id: run.id, functionName: "schedule", relatedRecords: [] },
              ]);
              scheduled.push(run.id);
              await progress(1, 1);
            },
          });
          await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
          other = await prostgles<JobTestSchema>(options);
          await eventually(() => scheduled.length >= 2);
          const { job } = await insert();
          await status(job.id, "succeeded");
          assert.equal((await records("job_name = 'brokenSchedule'")).length, 0);
          rejectSchedule = false;
          await eventually(
            async () =>
              (await records("job_name = 'brokenSchedule' AND status = 'succeeded'")).length > 0,
          );
          const occurrences = await records("job_name = 'schedule'");
          assert.equal(
            new Set(occurrences.map((job) => String(job.occurrence))).size,
            occurrences.length,
          );
          assert.equal(
            await instance!.jobs.get(occurrences[0]!.id, { userId: "alice" }),
            undefined,
          );
          assert.equal(
            (await instance!.jobs.get(occurrences[0]!.id, { userId: "admin" }))!.id,
            occurrences[0]!.id,
          );
          const schedule = parseCronSchedule({
            type: "schedule",
            cron: "30 9 * * MON-FRI",
            timezone: "Europe/London",
          });
          assert(schedule(new Date("2026-07-06T08:30:00Z")));
          assert.equal(schedule(new Date("2026-07-06T09:30:00Z")), undefined);
          assert(schedule(new Date("2026-12-07T09:30:00Z")));
          assert.throws(() => parseCronSchedule({ type: "schedule", cron: "bad" }));
          assert.throws(() =>
            parseCronSchedule({ type: "schedule", cron: "* * * * *", timezone: "bad" }),
          );
        },
      );
    } finally {
      for (const id of blocked) released.add(id);
      await other?.destroy();
      await instance?.destroy();
      await db.$pool.end();
      await parentDb.none(`DROP DATABASE ${database} WITH (FORCE)`);
    }
  });
};

type JobTestRow = {
  id: number;
  revision: number;
  enabled: boolean;
  owner: string;
  mode: string | null;
  note: string | null;
  job_id: string | null;
  updated: Date | null;
};
type JobTestSchema = {
  records: { columns: JobTestRow; insertColumns: Partial<JobTestRow> };
  [queue: `queue_${string}`]: { columns: JobRecord; insertColumns: JobInsertRecord };
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const eventually = async (check: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 10_000;
  while (!(await check())) {
    assert(Date.now() < deadline, "Timed out waiting for job");
    await delay(20);
  }
};

const waitForControlClaims = (gate: pgPromise.ITask<{}>, count: number) =>
  eventually(async () => {
    await gate.one("SELECT pg_stat_clear_snapshot()");
    const waiting = await gate.one<{ count: number }>(
      `SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()
     AND wait_event_type = 'Lock' AND query ILIKE '%records%FOR UPDATE%'`,
    );
    return waiting.count >= count;
  });

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pgPromise from "pg-promise";
import {
  isObject,
  ROW_ACTIONS_COLUMN,
  type AnyObject,
  type JobValue,
  type JSONBObjectTypeIfDefined,
} from "prostgles-types";
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
  await test("configured jobs", { timeout: 90_000 }, async (t) => {
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
    let jobOutput: unknown;
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
          if (row.mode === "retry-output" && run.attempt > 1) return { attempt: run.attempt };
          if (["output", "retry-output", "cancel-output"].includes(row.mode ?? "")) {
            if (row.mode === "cancel-output") await instance!.jobs.cancel(run.id);
            return jobOutput as JobValue | undefined;
          }
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
          if (row.mode === "retry") return { attempt: run.attempt, size: params.size };
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
                  $or:
                    user?.id === "alice" ?
                      [{ job_name: "process" }, { job_name: "manual", user_id: "alice" }]
                    : [{ job_name: "forbidden" }],
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
          const definition = prgl.opts.jobs!.definitions.process!;
          for (const maxStalledCount of [-1, 1.5, NaN, Infinity, 2_147_483_648]) {
            definition.retry = { maxAttempts: 1, maxStalledCount };
            await assert.rejects(prgl.refreshDBO(), /Invalid job definition: process/);
          }
          delete definition.retry;
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
      await t.test("types enforce params, rows and standalone job context", () => {
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
          job.output satisfies JobValue;
          if (job.status !== "succeeded") job.output satisfies null;
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
              return { revision: row.revision };
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
          manual: defineJob({
            trigger: { type: "manual" },
            retention: "forever",
            params: { size: { jsonbSchema: { type: "number" }, default: 10 } },
            run: ({ row, params }) => {
              row satisfies undefined;
              params.size satisfies number;
              /* @ts-expect-error Manual jobs have no source row. */
              void row.id;
              /* @ts-expect-error Unknown manual job parameter. */
              void params.missing;
              return Promise.resolve();
            },
          }),
        };
        definitions.scheduled.trigger.cron satisfies string;
        const defineControl = createJobControlFunctionDefiner<JobSchema>()(definitions);
        const manualControl = defineControl({
          jobName: "manual",
          operation: "startOrRetry",
          run: ({ row, params, job, dbx }) => {
            row satisfies undefined;
            params.size satisfies number;
            job satisfies JobRecord | undefined;
            dbx.records satisfies DBOFullyTyped<JobSchema>["records"];
            /* @ts-expect-error Unknown manual control parameter. */
            void params.missing;
          },
        });
        const manualInput: JSONBObjectTypeIfDefined<typeof manualControl.input> = {};
        const providedParams: JSONBObjectTypeIfDefined<typeof manualControl.input> = {
          params: { size: 2 },
        };
        const invalidParams: JSONBObjectTypeIfDefined<typeof manualControl.input> = {
          /* @ts-expect-error Manual controls preserve parameter input types. */
          params: { size: "bad" },
        };
        const rerunControl = defineControl({ jobName: "manual", operation: "rerun" });
        /* @ts-expect-error Rerunning a manual job requires its ID. */
        const missingJobId: JSONBObjectTypeIfDefined<typeof rerunControl.input> = {};
        const checkManualControl = (jobs: Jobs) =>
          jobs.control<JobSchema>("manual", {
            operation: "startOrRetry",
            run: ({ job, dbx }) => {
              job satisfies JobRecord | undefined;
              dbx.records satisfies DBOFullyTyped<JobSchema>["records"];
            },
          });
        void [manualInput, providedParams, invalidParams, missingJobId, checkManualControl];
        const invalidControl = () =>
          defineControl({
            /* @ts-expect-error Scheduled jobs cannot use the control definer. */
            jobName: "scheduled",
            operation: "startOrRetry",
          });
        void invalidControl;
        const { retention: _manualRetention, ...manualWithoutRetention } = definitions.manual;
        /* @ts-expect-error Manual jobs require explicit retention. */
        defineJob(manualWithoutRetention);
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
          assert.deepEqual(completed.output, { attempt: 2, size: 10 });
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
          assert.deepEqual((await status(rerun.jobId, "succeeded")).output, {
            attempt: 2,
            size: 20,
          });
          assert.deepEqual((await instance!.jobs.get(job.id))!.output, completed.output);
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
          assert.equal(failed.output, null);
        },
      );
      await t.test(
        "job output preserves JSON values and rejects invalid or cancelled results",
        async () => {
          for (const output of [
            { processing_time: 0.1, timings: {}, literal: { $to_timestamp: [123] } },
            ["done", { count: 2 }],
            "done",
            "",
            0,
            false,
            null,
            undefined,
          ]) {
            jobOutput = output;
            const { job } = await insert({ mode: "output" });
            assert.deepEqual((await status(job.id, "succeeded")).output, output ?? null);
          }
          const circular: Record<string, unknown> = {};
          circular.self = circular;
          for (const output of [Infinity, 1n, new Date(), { missing: undefined }, circular]) {
            jobOutput = output;
            const { job } = await insert({ mode: "output" });
            const failed = await status(job.id, "failed");
            assert.equal(failed.output, null);
            assert.deepEqual(failed.error, {
              message: "Job data and checkpoints must be finite JSON values",
            });
          }
          jobOutput = { cancelled: true };
          const { job } = await insert({ mode: "cancel-output" });
          assert.equal((await status(job.id, "cancelled")).output, null);
        },
      );
      await t.test("output storage failures retry and preserve database errors", async () => {
        jobOutput = { text: "\u0000" };
        const { job } = await insert({ mode: "output" });
        const failed = await status(job.id, "failed");
        assert.equal(failed.attempts, 3);
        assert.equal(failed.output, null);
        assert(isObject(failed.error) && "code" in failed.error && "message" in failed.error);
        assert.equal(failed.error.code, "22P05");
        assert.equal(failed.error.message, "unsupported Unicode escape sequence");

        const { job: retryJob } = await insert({ mode: "retry-output" });
        const completed = await status(retryJob.id, "succeeded");
        assert.equal(completed.attempts, 2);
        assert.equal(completed.error, null);
        assert.deepEqual(completed.output, { attempt: 2 });
      });
      await t.test(
        "message and numeric progress are independent and numeric progress is typed",
        async () => {
          const { job } = await insert({ mode: "progress" });
          const completed = await status(job.id, "succeeded");
          assert.equal(completed.progress_message, "Complete");
          assert.equal(completed.output, null);
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
          await assert.rejects(control(row.id), {
            message:
              `Job "process" (${started.jobId}): "startOrRetry" is not allowed while status is "running". ` +
              "Allowed statuses: failed, cancelled.",
          });
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
      await t.test("claims enforce concurrency across instances", async () => {
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
      });
      await t.test(
        "stall limits persist per job and unblock successors after repeated crashes",
        async () => {
          const previousRetry = definitions.process!.retry;
          try {
            for (const maxStalledCount of [0, 1, undefined]) {
              definitions.process!.retry = {
                maxAttempts: 1,
                ...(maxStalledCount === undefined ? {} : { maxStalledCount }),
                delayMs: 1000,
                backoff: "exponential",
              };
              await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
              other = await prostgles<JobTestSchema>(options);
              const { job } = await insert({ mode: "block" });
              const stallLimit = maxStalledCount ?? 3;
              assert.equal(job.max_stalled_count, stallLimit);
              const { jobId: successorId } = await instance!.jobs.rerun(job.id);
              released.add(successorId);
              /* A later definition change must not change the queued job's recovery budget. */
              definitions.process!.retry.maxStalledCount = 0;
              for (let stallCount = 1; stallCount <= stallLimit + 1; stallCount++) {
                await eventually(() =>
                  seen.some(({ id, attempt }) => id === job.id && attempt === stallCount),
                );
                const expiredAt = Date.now();
                await db.none(
                  `UPDATE ${queue} SET locked_until = clock_timestamp() - interval '1 second'
                    WHERE id = \${jobId} AND status = 'running'`,
                  { jobId: job.id },
                );
                const willRecover = stallCount <= stallLimit;
                const recovered = await status(job.id, willRecover ? "pending" : "failed");
                assert.equal(recovered.attempts, stallCount);
                assert.equal(recovered.stalled_count, stallCount);
                assert.deepEqual(recovered.error, {
                  code: "WORKER_INTERRUPTED",
                  message: "Worker interrupted",
                });
                assert.equal(recovered.lease_token, null);
                assert.equal(recovered.locked_until, null);
                if (willRecover) {
                  assert.equal(recovered.finished_at, null);
                  const recoveryDelay = 1000 * 2 ** (stallCount - 1);
                  assert(new Date(recovered.run_at!).getTime() >= expiredAt + recoveryDelay);
                  assert(new Date(recovered.run_at!).getTime() <= Date.now() + recoveryDelay);
                  assert.equal((await instance!.jobs.get(successorId))!.attempts, 0);
                  await db.none(
                    `UPDATE ${queue} SET run_at = clock_timestamp() WHERE id = \${jobId}`,
                    { jobId: job.id },
                  );
                } else {
                  assert(recovered.finished_at);
                }
              }
              await status(successorId, "succeeded");
              assert.equal(seen.filter(({ id }) => id === job.id).length, stallLimit + 1);
              await other.destroy();
              other = undefined;
            }
          } finally {
            definitions.process!.retry = previousRetry;
            await other?.destroy();
            other = undefined;
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
          }
        },
      );
      await t.test(
        "expired leases preserve failure retries, checkpoints and cancellation",
        async () => {
          jobFailure = new Error("Extraction failed after recovery");
          for (const { mode, maxAttempts, cancelRequested } of [
            { mode: "block", maxAttempts: 1, cancelRequested: false },
            { mode: "error", maxAttempts: 1, cancelRequested: false },
            { mode: "error", maxAttempts: 3, cancelRequested: false },
            { mode: "permanent", maxAttempts: 3, cancelRequested: false },
            { mode: "block", maxAttempts: 1, cancelRequested: true },
          ]) {
            const { row } = await insert({ enabled: false, mode });
            const jobId = randomUUID();
            const leaseToken = randomUUID();
            /* Simulate three stalled executions followed by a fourth expired lease. */
            await db.none(
              `INSERT INTO ${queue} (id, job_name, target_table, target_row_pkey, params, status, attempts,
              stalled_count, max_attempts, max_stalled_count, delay_ms, backoff, lease_token, locked_until,
              checkpoint, has_checkpoint, cancel_requested)
            VALUES (\${jobId}, 'process', \${targetTable}, \${targetRowPkey:json}, '{"size":10}', 'running',
              4, 3, \${maxAttempts}, \${maxStalledCount}, 1000, 'exponential', \${leaseToken},
              clock_timestamp() - interval '1 second', '{"done":1}', TRUE, \${cancelRequested})`,
              {
                jobId,
                targetTable: table,
                targetRowPkey: { id: row.id },
                leaseToken,
                maxAttempts,
                maxStalledCount: cancelRequested ? 3 : 4,
                cancelRequested,
              },
            );
            if (!cancelRequested) {
              const recovered = await status(jobId, "pending");
              assert.equal(recovered.stalled_count, 4);
              await db.none(`UPDATE ${queue} SET run_at = clock_timestamp() WHERE id = \${jobId}`, {
                jobId,
              });
            }
            if (mode === "block" && !cancelRequested) {
              await eventually(() => blocked.has(jobId));
              const recovered = (await instance!.jobs.get(jobId))!;
              assert.deepEqual(recovered.error, {
                code: "WORKER_INTERRUPTED",
                message: "Worker interrupted",
              });
              assert.deepEqual(recovered.checkpoint, { done: 1 });
              assert.equal(recovered.has_checkpoint, true);
              assert.equal(recovered.finished_at, null);
              assert.notEqual(recovered.lease_token, leaseToken);
              released.add(jobId);
            }
            if (mode === "error" && maxAttempts > 1) {
              await eventually(async () => {
                const retry = (await instance!.jobs.get(jobId))!;
                return retry.status === "pending" && retry.attempts === 5;
              });
              const retry = await status(jobId, "pending");
              assert.equal(retry.attempts, 5);
              assert(new Date(retry.run_at!).getTime() <= Date.now() + 1100);
            }
            const completed = await status(
              jobId,
              cancelRequested ? "cancelled"
              : mode === "block" ? "succeeded"
              : "failed",
            );
            assert.equal(completed.stalled_count, 4);
            assert.equal(
              completed.attempts,
              cancelRequested ? 4 : 4 + (mode === "error" ? maxAttempts : 1),
            );
            assert.equal(completed.lease_token, null);
            assert.equal(completed.locked_until, null);
            if (mode === "error") {
              assert.deepEqual(completed.error, {
                message: "Extraction failed after recovery",
              });
            } else if (mode === "permanent") {
              assert.deepEqual(completed.error, {
                message: "Permanent failure",
              });
            } else if (cancelRequested) {
              assert.equal(
                seen.some(({ id }) => id === jobId),
                false,
              );
            }
          }
        },
      );
      await t.test(
        "graceful shutdown preserves checkpoints and both budgets across restarts and schema upgrades",
        async () => {
          definitions.process!.retry = { maxAttempts: 1, maxStalledCount: 0 };
          await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
          const { job } = await insert({ mode: "block" });
          await eventually(() => blocked.has(job.id));
          assert.equal((await instance!.jobs.get(job.id))!.max_attempts, 1);
          await db.none(
            `UPDATE ${queue} SET checkpoint = '{"done":1}', has_checkpoint = TRUE
              WHERE id = \${jobId}`,
            { jobId: job.id },
          );
          const { job: cancelledJob } = await insert({ mode: "block" });
          await eventually(() => blocked.has(cancelledJob.id));
          await instance!.jobs.cancel(cancelledJob.id);
          for (const restart of [1, 2]) {
            await instance!.destroy();
            instance = undefined;
            const [stopped] = await records("id = ${jobId}", { jobId: job.id });
            assert.equal(stopped!.status, "pending");
            assert.equal(stopped!.attempts, 0);
            assert.equal(stopped!.stalled_count, 0);
            assert.equal(stopped!.lease_token, null);
            assert.equal(stopped!.locked_until, null);
            const [cancelled] = await records("id = ${jobId}", { jobId: cancelledJob.id });
            assert.equal(cancelled!.status, "cancelled");
            assert.equal(cancelled!.attempts, 1);
            assert.equal(cancelled!.stalled_count, 0);
            if (restart === 1) {
              /* Recreate the queue schema from before stall tracking was added. */
              await db.none(
                `ALTER TABLE ${queue} DROP COLUMN stalled_count, DROP COLUMN max_stalled_count`,
              );
            }
            instance = await prostgles<JobTestSchema>(options);
            await eventually(() => seen.filter(({ id }) => id === job.id).length === restart + 1);
            const recovered = (await instance.jobs.get(job.id))!;
            assert.equal(recovered.status, "running");
            assert.equal(recovered.attempts, 1);
            assert.equal(recovered.stalled_count, 0);
            assert.equal(recovered.max_stalled_count, restart === 1 ? 3 : 0);
            assert.deepEqual(recovered.checkpoint, { done: 1 });
            assert.equal(recovered.has_checkpoint, true);
            await db.none(`UPDATE ${queue} SET max_stalled_count = 0 WHERE id = \${jobId}`, {
              jobId: job.id,
            });
          }
          released.add(job.id);
          assert.equal((await status(job.id, "succeeded")).attempts, 1);
          definitions.process!.retry = { maxAttempts: 1 };
          await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
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
              boundJobs.start("process", {}, { row: { id: row.id } }),
              /active transaction/,
            );
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
        "manual jobs validate parameters, retry and inherit the starting user",
        async () => {
          const manual = defineJob({
            trigger: { type: "manual" },
            retention: "forever",
            params: { size: { jsonbSchema: { type: "number" }, default: 10 } },
            retry: { maxAttempts: 2, delayMs: 10 },
            run: async ({ row, params, user, dbo, run, checkpoint, progress, signal }) => {
              assert.equal(row, undefined);
              if (params.size === -2) throw new Error("Manual job failed");
              while (params.size === 99) {
                signal.throwIfAborted();
                await delay(10);
              }
              if (run.attempt === 1) {
                await checkpoint.set(params.size);
                throw new Error("Retry manual job");
              }
              assert.equal(run.reason, "retry");
              assert.equal(await checkpoint.get(), params.size);
              await progress(1, 1);
              return {
                size: params.size,
                userId: user?.id ?? null,
                hasOtherOwners: (await dbo.records.count({ owner: { $ne: "alice" } })) > 0,
              };
            },
          });
          definitions.manual = manual;
          const defineManualControl = createJobControlFunctionDefiner<JobTestSchema>()({ manual });
          const functions = options.functions!.members!.functions;
          let manualControlJobs: Jobs | undefined;
          functions.startManualJob = defineManualControl({
            jobName: "manual",
            operation: "startOrRetry",
            run: async ({ row, params, job, dbx, jobs }) => {
              assert.equal(row, undefined);
              assert.equal(job?.job_name ?? "manual", "manual");
              manualControlJobs = jobs;
              if (params.size === -1) {
                await dbx.records.insert({
                  enabled: false,
                  note: "rejected manual control",
                });
                throw new Error("Manual preparation rejected");
              }
            },
          });
          functions.rerunManualJob = defineManualControl({
            jobName: "manual",
            operation: "rerun",
          });
          functions.cancelManualJob = defineManualControl({
            jobName: "manual",
            operation: "cancel",
          });
          try {
            await instance!.update(
              {
                jobs: { tableName: queueName, definitions },
                functions: options.functions,
              },
              true,
            );
            /* Wait for a worker tick to prove manual jobs are not enqueued automatically. */
            await delay(500);
            assert.equal((await records("job_name = 'manual'")).length, 0);
            await assert.rejects(instance!.jobs.start("missing"), /Unknown job: missing/);
            await assert.rejects(
              instance!.jobs.start("manual", { unknown: 1 }),
              /Unknown job parameter/,
            );
            await assert.rejects(
              instance!.jobs.start("manual", { size: "bad" }),
              /Invalid job parameter/,
            );
            await assert.rejects(
              instance!.jobs.start("manual", {}, { row: { id: 1 } }),
              /does not accept a row/,
            );
            const { jobId } = await instance!.jobs.start("manual");
            const completed = await status(jobId, "succeeded");
            assert.equal(completed.attempts, 2);
            assert.equal(completed.target_table, null);
            assert.deepEqual(completed.target_row_pkey, {});
            assert.equal(completed.occurrence, null);
            assert.deepEqual(completed.output, {
              size: 10,
              userId: null,
              hasOtherOwners:
                (await instance!.db.records.count({
                  owner: { $ne: "alice" },
                })) > 0,
            });
            const rerun = await instance!.jobs.rerun(jobId, { size: 20 });
            assert.deepEqual((await status(rerun.jobId, "succeeded")).params, {
              size: 20,
            });

            manual.runAs = "user";
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
            await assert.rejects(instance!.jobs.start("manual"), /requires a user/);
            const alice = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
            const bob = await instance!.getClientDBHandlers({ userId: "bob" }, undefined);
            assert.equal(bob.clientMethods.startManualJob, undefined);
            const startManual = (input: { jobId?: string; params?: { size: number } } = {}) =>
              alice.clientMethods.startManualJob!.run(input) as Promise<{
                jobId: string;
              }>;
            const rerunManual = (input: { jobId: string; params?: { size: number } }) =>
              alice.clientMethods.rerunManualJob!.run(input) as Promise<{
                jobId: string;
              }>;
            await assert.rejects(
              alice.clientMethods.startManualJob!.run({
                params: { size: "bad" },
              }),
            );
            await assert.rejects(
              alice.clientMethods.startManualJob!.run({
                params: { unknown: 1 },
              }),
            );
            await assert.rejects(alice.clientMethods.cancelManualJob!.run({}));
            await assert.rejects(alice.clientMethods.rerunManualJob!.run({}));
            const countBeforeRejectedControl = (await records()).length;
            await assert.rejects(
              startManual({ params: { size: -1 } }),
              /Manual preparation rejected/,
            );
            assert.equal(
              await instance!.db.records.count({
                note: "rejected manual control",
              }),
              0,
            );
            assert.equal((await records()).length, countBeforeRejectedControl);
            const defaultStart = await startManual();
            assert.equal((await status(defaultStart.jobId, "succeeded")).params!.size, 10);
            assert(manualControlJobs);
            await assert.rejects(manualControlJobs.get(defaultStart.jobId), /active transaction/);
            const explicit = await instance!.jobs.start(
              "manual",
              { size: 30 },
              { userId: "alice" },
            );
            const inherited = await startManual({ params: { size: 40 } });
            for (const [started, size] of [
              [explicit, 30],
              [inherited, 40],
            ] as const) {
              const result = await status(started.jobId, "succeeded");
              assert.equal(result.user_id, "alice");
              assert.deepEqual(result.output, {
                size,
                userId: "alice",
                hasOtherOwners: false,
              });
            }
            await assert.rejects(startManual({ jobId: inherited.jobId }), /not allowed/);
            await assert.rejects(
              alice.clientMethods.cancelManualJob!.run({
                jobId: inherited.jobId,
              }),
              /not allowed/,
            );
            await assert.rejects(rerunManual({ jobId }), /not readable/);
            const { job: rowJob } = await insert();
            await status(rowJob.id, "succeeded");
            await assert.rejects(rerunManual({ jobId: rowJob.id }), /does not match/);
            const rerunControl = await rerunManual({
              jobId: inherited.jobId,
              params: { size: 50 },
            });
            assert.equal((await status(rerunControl.jobId, "succeeded")).params!.size, 50);
            const failed = await startManual({ params: { size: -2 } });
            await status(failed.jobId, "failed");
            await assert.rejects(rerunManual({ jobId: failed.jobId }), {
              message:
                `Job "manual" (${failed.jobId}): "rerun" is not allowed while status is "failed". ` +
                "Allowed statuses: succeeded.",
            });
            const retried = await startManual({
              jobId: failed.jobId,
              params: { size: 60 },
            });
            await status(retried.jobId, "succeeded");
            const inheritedParams = await rerunManual({ jobId: retried.jobId });
            assert.equal((await status(inheritedParams.jobId, "succeeded")).params!.size, 60);
            const running = await startManual({ params: { size: 99 } });
            await status(running.jobId, "running");
            await alice.clientMethods.cancelManualJob!.run({
              jobId: running.jobId,
            });
            await status(running.jobId, "cancelled");
            const resumed = await startManual({
              jobId: running.jobId,
              params: { size: 70 },
            });
            await status(resumed.jobId, "succeeded");
            delete manual.runAs;
            for (const rollback of [false, true]) {
              let startedId = "";
              const transaction = instance!.db.tx(async (dbx) => {
                const jobs = instance!.jobs.withTransaction(dbx);
                startedId = (await jobs.start("manual")).jobId;
                assert.equal((await jobs.get(startedId))!.status, "pending");
                assert.equal(await instance!.jobs.get(startedId), undefined);
                await jobs.cancel(startedId);
                if (rollback) {
                  await assert.rejects(
                    jobs.start("manual", { size: "bad" }),
                    /Invalid job parameter/,
                  );
                }
              });
              if (rollback) await assert.rejects(transaction, /Invalid job parameter/);
              else await transaction;
              assert.equal(
                (await instance!.jobs.get(startedId))?.status,
                rollback ? undefined : "cancelled",
              );
            }
          } finally {
            delete definitions.manual;
            delete functions.startManualJob;
            delete functions.rerunManualJob;
            delete functions.cancelManualJob;
            await instance!.update(
              {
                jobs: { tableName: queueName, definitions },
                functions: options.functions,
              },
              true,
            );
          }
        },
      );
      await t.test(
        "manual row starts validate and link rows atomically without automatic triggers",
        async () => {
          const trigger = definitions.process!.trigger;
          assert(trigger.type === "row");
          const originalOn = trigger.on;
          const originalColumns = trigger.columns;
          trigger.on = [];
          try {
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
            const { row } = await insert();
            await instance!.db.records.update({ id: row.id }, { revision: 2 });
            assert.equal(
              (
                await records("target_row_pkey = ${row:json}", {
                  row: { id: row.id },
                })
              ).length,
              0,
            );
            await assert.rejects(instance!.jobs.start("process"), /primary key is unavailable/);
            await assert.rejects(
              instance!.jobs.start("process", {}, { row: {} }),
              /primary key is unavailable/,
            );
            await assert.rejects(
              instance!.jobs.start("process", {}, { row: { id: -1 } }),
              /Job row is unavailable/,
            );
            const disabled = await insert({ enabled: false });
            await assert.rejects(
              instance!.jobs.start("process", {}, { row: { id: disabled.row.id } }),
              /does not satisfy its trigger condition/,
            );
            const { jobId } = await instance!.jobs.start(
              "process",
              { size: 25 },
              { row: { id: row.id } },
            );
            assert.equal((await instance!.db.records.findOne({ id: row.id }))!.job_id, jobId);
            assert.deepEqual((await status(jobId, "succeeded")).params, {
              size: 25,
            });
            assert.equal(seen.find(({ id }) => id === jobId)!.revision, 2);
            assert.equal(seen.find(({ id }) => id === jobId)!.reason, "trigger");

            const beforeRollback = (await records()).length;
            await assert.rejects(
              instance!.db.tx(async (dbx) => {
                await instance!.jobs
                  .withTransaction(dbx)
                  .start("process", {}, { row: { id: row.id } });
                throw new Error("Rollback manual start");
              }),
              /Rollback manual start/,
            );
            rejectHook = true;
            await assert.rejects(instance!.jobs.start("process", {}, { row: { id: row.id } }), {
              message: "Reject row",
            });
            rejectHook = false;
            assert.equal((await records()).length, beforeRollback);
            assert.equal((await instance!.db.records.findOne({ id: row.id }))!.job_id, jobId);

            definitions.unlinked = defineJob({
              trigger: { type: "row", table, on: [] },
              run: ({ row }) => Promise.resolve({ revision: row.revision }),
            });
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
            const unlinked = await instance!.jobs.start("unlinked", {}, { row: { id: row.id } });
            assert.deepEqual((await status(unlinked.jobId, "succeeded")).output, {
              revision: 2,
            });
            assert.equal((await instance!.db.records.findOne({ id: row.id }))!.job_id, jobId);

            /* Published controls also work when all automatic row triggers are disabled. */
            const alice = await instance!.getClientDBHandlers({ userId: "alice" }, undefined);
            const { row: controlledRow } = await insert({
              mode: "block",
              owner: "alice",
            });
            const controlInput = { row: { id: controlledRow.id } };
            const controlled = (await alice.clientMethods.controlRecord!.run(controlInput)) as {
              jobId: string;
            };
            await status(controlled.jobId, "running");
            await alice.clientMethods.cancelRecord!.run(controlInput);
            await status(controlled.jobId, "cancelled");
            const retried = (await alice.clientMethods.controlRecord!.run(controlInput)) as {
              jobId: string;
            };
            released.add(retried.jobId);
            await status(retried.jobId, "succeeded");
            const rerunControl = (await alice.clientMethods.rerunRecord!.run(controlInput)) as {
              jobId: string;
            };
            released.add(rerunControl.jobId);
            await status(rerunControl.jobId, "succeeded");
            assert.equal(
              (await instance!.db.records.findOne({ id: controlledRow.id }))!.job_id,
              rerunControl.jobId,
            );
            assert.equal(
              (
                await records("target_row_pkey = ${row:json}", {
                  row: { id: controlledRow.id },
                })
              ).length,
              3,
            );

            trigger.on = originalOn;
            delete trigger.columns;
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
            const beforeAutomatic = (await records()).length;
            const started = await instance!.jobs.start("process", {}, { row: { id: row.id } });
            await status(started.jobId, "succeeded");
            assert.equal((await records()).length, beforeAutomatic + 1);
          } finally {
            rejectHook = false;
            delete definitions.unlinked;
            trigger.on = originalOn;
            trigger.columns = originalColumns;
            await instance!.update({ jobs: { tableName: queueName, definitions } }, true);
          }
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

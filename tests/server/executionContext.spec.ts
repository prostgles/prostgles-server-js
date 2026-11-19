import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createProstgles,
  defineFunction,
  type ExecutionContext,
  type AuditTableRow,
  type InitResult,
  type ProstglesInitOptions,
} from "prostgles-server";
import type { DB, DBHandlerServerInternal } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";

export const testExecutionContext = async (db: DB) => {
  await test("execution context follows functions, hooks and deferred transaction callbacks", async () => {
    const schema = `execution_${randomUUID().replaceAll("-", "")}`;
    const records = "records";
    const events = "events";
    const noKey = "no_key";
    const auditTable = "execution_history";
    const readHistory = () =>
      db.any<AuditTableRow>(`SELECT * FROM ${schema}.${auditTable} ORDER BY id`);
    const observed: { phase: string; execution: ExecutionContext }[] = [];
    const workflowStarted = createDeferred<ExecutionContext>();
    const finishWorkflow = createDeferred<void>();
    const nonAuditedWorkflowStarted = createDeferred<ExecutionContext>();
    const finishNonAuditedWorkflow = createDeferred<void>();
    let publishRawSQL = true;
    let readExecution: () => ExecutionContext | undefined = () => undefined;
    let readOtherExecution: () => ExecutionContext | undefined = () => undefined;
    let transaction: DBHandlerServerInternal | undefined;
    let instance: Pick<InitResult, "destroy" | "getClientDBHandlers"> | undefined;
    let other: InitResult | undefined;
    const capture = async (phase: string) => {
      const execution = readExecution();
      assert(execution);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(readExecution(), execution);
      assert.equal(readOtherExecution(), undefined);
      observed.push({ phase, execution });
      return execution;
    };
    try {
      await db.none(`
        CREATE SCHEMA ${schema};
        CREATE TABLE ${schema}.${records} (tenant INTEGER, id INTEGER, slug TEXT UNIQUE, PRIMARY KEY (tenant, id));
        INSERT INTO ${schema}.${records} VALUES (1, 2, 'first'), (1, 3, 'second');
        CREATE TABLE ${schema}.${events} (id SERIAL PRIMARY KEY, value TEXT);
        CREATE TABLE ${schema}.${noKey} (value TEXT);
        INSERT INTO ${schema}.${noKey} VALUES ('keyless'), ('first value'), ('second value');
      `);
      const options = {
        dbConnection: {
          ...getConnectionDetails(db),
          options: `-c search_path=${schema},public`,
        } as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 as const },
        transactions: true,
        publish: "*" as const,
        publishRawSQL: ({ user }: { user?: { id: string } }) =>
          Promise.resolve(publishRawSQL && user?.id === "alice"),
        auth: {
          getUser: () => undefined,
          findUser: () => ({ id: "alice", type: "default" }),
        },
        onReady: () => {},
      };
      other = await createProstgles()({
        ...options,
        createContext: ({ getExecution }) => {
          readOtherExecution = getExecution;
          return undefined;
        },
        functions: {
          all: {
            userFilter: {},
            functions: {
              read: { run: () => readOtherExecution() },
              workflow: {
                run: async () => {
                  const execution = readOtherExecution();
                  assert(execution);
                  nonAuditedWorkflowStarted.resolve(execution);
                  await finishNonAuditedWorkflow.promise;
                },
              },
            },
          },
        },
      });
      /* A running execution permits raw SQL when audit is disabled, but expires with its root. */
      const nonAuditedClient = await other.getClientDBHandlers({ userId: "alice" }, undefined);
      const nonAuditedWorkflow = nonAuditedClient.clientMethods.workflow!.run();
      const nonAuditedExecution = await nonAuditedWorkflowStarted.promise;
      let nonAuditedProxy: typeof nonAuditedClient;
      try {
        nonAuditedProxy = await other.getClientDBHandlers(
          { userId: "alice", runId: nonAuditedExecution.runId },
          { allowSql: true },
        );
        assert.equal(nonAuditedProxy.clientSchema.rawSQL, true);
        assert.deepEqual(
          await nonAuditedProxy.clientSql("SELECT 1 AS value", undefined, { returnType: "rows" }),
          [{ value: 1 }],
        );
      } finally {
        finishNonAuditedWorkflow.resolve();
        await nonAuditedWorkflow;
      }
      await assert.rejects(nonAuditedProxy.clientSql("SELECT 1"), /is not running/);
      const created = await createProstgles()<{ capture: typeof capture }>({
        ...options,
        audit: {
          tableName: auditTable,
          tables: { [events]: 1, [noKey]: { idColumns: ["value"] } },
        },
        auth: {
          getUser: () => undefined,
          findUser: (filter) => ({
            id: "id" in filter && typeof filter.id === "string" ? filter.id : "alice",
            type: "default",
          }),
        },
        createContext: ({ getExecution }) => {
          assert.equal(getExecution(), undefined);
          readExecution = getExecution;
          return { capture };
        },
        tableHooks: {
          [events]: {
            beforeEach: [
              {
                commands: { insert: 1, update: 1 },
                validate: async () => {
                  await capture("before");
                },
              },
            ],
            afterEach: [
              {
                commands: { insert: 1, update: 1, delete: 1 },
                validate: async ({ onCommit, onRollback, dbx }) => {
                  await capture("each");
                  await dbx[noKey]!.insert({ value: "downstream" });
                  onCommit(async () => {
                    await capture("commit");
                  });
                  onRollback(async () => {
                    await capture("rollback");
                  });
                },
              },
            ],
            afterAll: [
              {
                commands: { insert: 1, update: 1, delete: 1 },
                validate: async () => {
                  await capture("all");
                },
              },
            ],
            afterCommit: [
              {
                commands: { insert: 1, update: 1, delete: 1 },
                run: async () => {
                  await capture("afterCommit");
                },
              },
            ],
          },
          [noKey]: {
            afterEach: [
              {
                commands: { insert: 1 },
                validate: async () => {
                  await capture("noKey");
                },
              },
            ],
            onInsteadOfDelete: async ({ tx, filterOpts, returningQuery }) => {
              const execution = await capture("insteadOfDelete");
              assert.deepEqual(getTriggerInvocation(execution.invocations.at(-1)).rowParts, [
                filterOpts.filter,
              ]);
              return tx.any(`DELETE FROM ${noKey} ${filterOpts.where} ${returningQuery}`);
            },
          },
        },
        functions: {
          all: {
            userFilter: {},
            functions: {
              readExecution: defineFunction({ run: () => readExecution() }),
              workflow: defineFunction({
                unrestrictedDbAccess: true,
                run: async (_args, { dbo, user }) => {
                  const execution = readExecution();
                  assert(execution && instance);
                  await assert.rejects(
                    instance.getClientDBHandlers(
                      { userId: user.id, runId: execution.runId },
                      undefined,
                    ),
                    /existing execution context/,
                  );
                  return dbo.tx(async (tx) => {
                    await tx[noKey]!.insert!({ value: "parent write" });
                    workflowStarted.resolve(execution);
                    await finishWorkflow.promise;
                    throw new Error("parent transaction rollback");
                  });
                },
              }),
              child: defineFunction({
                unrestrictedDbAccess: true,
                run: async (_args, { dbo, sql, user }) => {
                  const execution = await capture("child");
                  if (!transaction) {
                    await dbo[noKey]!.insert!({ value: `child:${user.id}` });
                    await sql(`INSERT INTO ${noKey} VALUES ($1)`, [`raw child:${user.id}`]);
                  }
                  return execution;
                },
              }),
              outer: defineFunction({
                input: {
                  rows: { type: "RowLookup[]", table: records },
                  slug: { type: "ValueLookup", table: records, column: "slug" },
                  keylessRow: { type: "RowLookup", table: noKey },
                  values: { type: "ValueLookup[]", table: noKey, column: "value" },
                  fail: "boolean",
                },
                unrestrictedDbAccess: true,
                run: async ({ fail }, { dbo, user, clientReq, getClientDBHandlers, context }) => {
                  const execution = await context.capture("outer");
                  assert.equal(execution.user, user);
                  assert.equal(execution.clientReq, clientReq);
                  const handlers = await getClientDBHandlers(undefined);
                  const child = (await handlers.clientMethods.child!.run()) as ExecutionContext;
                  assert.equal(child.runId, execution.runId);
                  assert.deepEqual(
                    child.invocations.map(
                      (invocation) => getFunctionInvocation(invocation).functionName,
                    ),
                    ["outer", "child"],
                  );
                  assert.equal(readExecution(), execution);
                  const otherHandlers = await other!.getClientDBHandlers(
                    { userId: "alice" },
                    undefined,
                  );
                  const otherExecution =
                    (await otherHandlers.clientMethods.read!.run()) as ExecutionContext;
                  assert.notEqual(otherExecution.runId, execution.runId);
                  const row = await (transaction ?? dbo)[events]!.insert!(
                    { value: user.id },
                    { returning: "*" },
                  );
                  if (fail) throw new Error("execution failure");
                  return { execution, row };
                },
              }),
            },
          },
        },
      });
      instance = created;
      const dbo = created.db as unknown as DBHandlerServerInternal;
      const alice = await created.getClientDBHandlers({ userId: "alice" }, undefined);
      const bob = await created.getClientDBHandlers({ userId: "bob" }, undefined);
      /* The proxy commits its writes independently of the workflow's transaction. */
      const workflow = alice.clientMethods.workflow!.run();
      const parent = await Promise.race([
        workflowStarted.promise,
        workflow.then((): never => {
          throw new Error("Workflow finished before the proxy request");
        }),
      ]);
      const request = { userId: "alice", runId: parent.runId };
      let proxy: typeof alice;
      try {
        assert.equal(readExecution(), undefined);
        await assert.rejects(created.getClientDBHandlers(request, undefined), /raw SQL/);
        await assert.rejects(created.getClientDBHandlers(request, { allowSql: true }), /raw SQL/);
        await assert.rejects(
          created.getClientDBHandlers({ ...request, userId: "bob" }, undefined),
          /was not initiated by this user/,
        );
        await assert.rejects(other.getClientDBHandlers(request, undefined), /is not running/);
        for (const runId of ["", randomUUID()]) {
          await assert.rejects(
            created.getClientDBHandlers({ ...request, runId }, undefined),
            /is not running/,
          );
        }

        proxy = await created.getClientDBHandlers(request, {
          tables: { [noKey]: { insert: true } },
          methods: { readExecution: true },
        });
        assert.equal(proxy.clientSchema.rawSQL, false);
        assert.throws(() => proxy.clientSql("SELECT 1"), /raw SQL/);
        assert.throws(() => proxy.clientMethods.outer!.run(), /PermissionScope/);
        const child = (await proxy.clientMethods.readExecution!.run()) as ExecutionContext;
        assert.equal(child.runId, parent.runId);
        assert.deepEqual(child.invocations.slice(0, -1), parent.invocations);
        assert.equal(getFunctionInvocation(child.invocations.at(-1)).functionName, "readExecution");

        await proxy.clientDb[noKey]!.insert!({ value: "proxy write" });
        await proxy.withClientDbTx((tx) => tx[noKey]!.insert!({ value: "proxy transaction" }));
        await created.db.tx((tx) =>
          proxy.getClientDbForTransaction(tx)[noKey]!.insert!({ value: "bound transaction" }),
        );

        /* A later permission grant cannot enable SQL on an attributed handler. */
        publishRawSQL = false;
        const noSql = await created.getClientDBHandlers(request, undefined);
        publishRawSQL = true;
        assert.throws(() => noSql.clientSql("SELECT 1"), /raw SQL/);
      } finally {
        finishWorkflow.resolve();
        await assert.rejects(workflow, /parent transaction rollback/);
      }

      const proxyHistory = await readHistory();
      assert.deepEqual(
        proxyHistory.map(({ new_row }) => new_row?.value),
        ["proxy write", "proxy transaction", "bound transaction"],
      );
      for (const entry of proxyHistory) {
        assert.deepEqual(entry.execution_context, {
          runId: parent.runId,
          invocations: [
            { type: "function", id: parent.invocations[0]!.id, functionName: "workflow" },
          ],
        });
        assert.equal(entry.actor?.id, request.userId);
      }
      await assert.rejects(created.getClientDBHandlers(request, undefined), /is not running/);
      await assert.rejects(proxy.clientDb[noKey]!.insert!({ value: "expired" }), /is not running/);
      await assert.rejects(proxy.clientMethods.readExecution!.run(), /is not running/);
      await assert.rejects(proxy.withClientDbTx(() => undefined), /is not running/);
      const input = {
        rows: [{ tenant: 1, id: 2, slug: "first" }, { tenant: 1, id: 3 }, { slug: "first" }],
        slug: "second",
        keylessRow: { value: "keyless" },
        values: ["first value", "second value"],
        fail: false,
      };
      const results = await Promise.all(
        [alice, bob].map(
          async (handlers) =>
            (await handlers.clientMethods.outer!.run(input)) as {
              execution: ExecutionContext;
              row: { id: number };
            },
        ),
      );
      assert.notEqual(results[0]!.execution.runId, results[1]!.execution.runId);
      assert.deepEqual(
        results.map(({ execution }) => execution.user!.id),
        ["alice", "bob"],
      );
      assert.equal(readExecution(), undefined);
      for (const { execution, row } of results) {
        /* Audit preserves invocation ancestry without request objects or lookup/row payloads. */
        const runHistory = (await readHistory()).filter(
          ({ execution_context }) => execution_context?.runId === execution.runId,
        );
        const outerInvocation = {
          type: "function",
          id: execution.invocations[0]!.id,
          functionName: "outer",
        };
        assert.deepEqual(
          runHistory.find(({ table_name }) => table_name === events)?.execution_context,
          { runId: execution.runId, invocations: [outerInvocation] },
        );
        const child = observed.find(
          (item) => item.phase === "child" && item.execution.runId === execution.runId,
        )!.execution;
        assert.deepEqual(runHistory[0]!.execution_context, {
          runId: execution.runId,
          invocations: [
            outerInvocation,
            { type: "function", id: child.invocations[1]!.id, functionName: "child" },
          ],
        });
        assert.equal(
          (await readHistory()).find(
            ({ new_row }) => new_row?.value === `raw child:${execution.user?.id}`,
          )?.execution_context,
          null,
        );
        assert.deepEqual(getFunctionInvocation(execution.invocations[0]).relatedRecords, [
          { argName: "rows", tableName: records, rowPart: { tenant: 1, id: 2, slug: "first" } },
          { argName: "rows", tableName: records, rowPart: { tenant: 1, id: 3 } },
          { argName: "rows", tableName: records, rowPart: { slug: "first" } },
          { argName: "slug", tableName: records, rowPart: { slug: "second" } },
          { argName: "keylessRow", tableName: noKey, rowPart: { value: "keyless" } },
          { argName: "values", tableName: noKey, rowPart: { value: "first value" } },
          { argName: "values", tableName: noKey, rowPart: { value: "second value" } },
        ]);
        const hooks = observed.filter(
          (item) =>
            item.phase !== "noKey" &&
            item.execution.runId === execution.runId &&
            item.execution.invocations.at(-1)?.type === "trigger",
        );
        assert.deepEqual(
          hooks.map(({ phase }) => phase),
          ["before", "each", "all", "commit", "afterCommit"],
        );
        for (const hook of hooks) {
          assert.deepEqual(hook.execution.invocations.slice(0, -1), execution.invocations);
          assert.deepEqual(
            getTriggerInvocation(hook.execution.invocations.at(-1)).rowParts,
            hook.phase === "before" ?
              [{ value: execution.user!.id }]
            : [{ id: row.id, value: execution.user!.id }],
          );
        }
        assert.equal(hooks[1]!.execution, hooks[3]!.execution);
        assert.deepEqual(runHistory.at(-1)!.execution_context, {
          runId: execution.runId,
          invocations: [
            outerInvocation,
            { type: "trigger", id: hooks[1]!.execution.invocations.at(-1)!.id, tableName: events },
          ],
        });
        const nested = observed.find(
          (item) =>
            item.phase === "noKey" &&
            item.execution.invocations[1]?.id === hooks[1]!.execution.invocations[1]!.id,
        )!.execution;
        assert.deepEqual(
          nested.invocations.map(({ type }) => type),
          ["function", "trigger", "trigger"],
        );
        assert.deepEqual(nested.invocations.slice(0, -1), hooks[1]!.execution.invocations);
        assert.equal(getTriggerInvocation(nested.invocations[1]).tableName, events);
        const nestedTrigger = getTriggerInvocation(nested.invocations[2]);
        assert.equal(nestedTrigger.tableName, noKey);
        assert.deepEqual(nestedTrigger.rowParts, [{ value: "downstream" }]);
      }

      observed.length = 0;
      await dbo.tx!(async (tx, rawTx) => {
        transaction = tx;
        await alice.clientMethods.outer!.run(input);
        assert.equal(readExecution(), undefined);
        assert(!observed.some(({ phase }) => phase === "afterCommit"));
        /* Raw SQL must not inherit the completed invocation's transaction-local audit context. */
        await rawTx.none(`INSERT INTO ${noKey} (value) VALUES ($1)`, [
          "raw outside invocation in transaction",
        ]);
        await tx[noKey]!.insert({ value: "outside invocation in transaction" });
      });
      transaction = undefined;
      const deferred = observed.find(({ phase }) => phase === "afterCommit")!.execution;
      assert.equal(getFunctionInvocation(deferred.invocations[0]).functionName, "outer");
      assert.equal(deferred.user!.id, "alice");

      observed.length = 0;
      await assert.rejects(
        dbo.tx!(async (tx) => {
          transaction = tx;
          await alice.clientMethods.outer!.run({ ...input, fail: true });
        }),
        /execution failure/,
      );
      transaction = undefined;
      assert(!observed.some(({ phase }) => phase === "afterCommit" || phase === "commit"));
      const rolledBack = observed.find(({ phase }) => phase === "rollback")!.execution;
      assert(
        !(await readHistory()).some(
          ({ execution_context }) => execution_context?.runId === rolledBack.runId,
        ),
      );
      assert.equal(getFunctionInvocation(rolledBack.invocations[0]).functionName, "outer");
      assert.equal(readExecution(), undefined);

      observed.length = 0;
      await bob.clientDb[events]!.update!({ id: results[0]!.row.id }, { value: "updated" });
      assert(observed.every(({ execution }) => execution.user?.id === "bob"));
      assert(
        observed.every(({ execution }) =>
          execution.invocations.every(({ type }) => type === "trigger"),
        ),
      );
      assert.deepEqual(getTriggerInvocation(observed[0]!.execution.invocations[0]).rowParts, [
        { value: "updated" },
      ]);
      await bob.clientDb[events]!.delete!({ id: results[0]!.row.id });
      assert.deepEqual(getTriggerInvocation(observed.at(-1)!.execution.invocations[0]).rowParts, [
        { id: results[0]!.row.id, value: "updated" },
      ]);
      await created.db[noKey]!.insert!({ value: "no key" });
      const history = await readHistory();
      assert.equal(history.at(-1)!.execution_context, null);
      for (const value of [
        "outside invocation in transaction",
        "raw outside invocation in transaction",
      ]) {
        assert.equal(
          history.find(({ new_row }) => new_row?.value === value)?.execution_context,
          null,
        );
      }
      assert.deepEqual(getTriggerInvocation(observed.at(-1)!.execution.invocations[0]).rowParts, [
        { value: "no key" },
      ]);
      const deleteFilter = { value: { $in: ["no key", "downstream"] } };
      await created.db[noKey]!.delete!(deleteFilter);
      assert.equal(observed.at(-1)!.phase, "insteadOfDelete");
      assert.equal(readExecution(), undefined);
    } finally {
      await instance?.destroy();
      await other?.destroy();
      await db.none(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });
};

const getFunctionInvocation = (invocation: ExecutionContext["invocations"][number] | undefined) => {
  assert(invocation?.type === "function");
  return invocation;
};

const getTriggerInvocation = (invocation: ExecutionContext["invocations"][number] | undefined) => {
  assert(invocation?.type === "trigger");
  return invocation;
};

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

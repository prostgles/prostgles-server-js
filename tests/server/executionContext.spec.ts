import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createProstgles,
  defineFunction,
  type ExecutionContext,
  type InitResult,
  type ProstglesInitOptions,
} from "prostgles-server";
import type { DB, DBHandlerServerInternal } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";

export const testExecutionContext = async (db: DB) => {
  await test("execution context follows functions, hooks and deferred transaction callbacks", async () => {
    const schema = `execution_${randomUUID().replaceAll("-", "")}`;
    const records = `${schema}.records`;
    const events = `${schema}.events`;
    const noKey = `${schema}.no_key`;
    const observed: { phase: string; execution: ExecutionContext }[] = [];
    let readExecution: () => ExecutionContext | undefined = () => undefined;
    let readOtherExecution: () => ExecutionContext | undefined = () => undefined;
    let transaction: DBHandlerServerInternal | undefined;
    let instance: Pick<InitResult, "destroy"> | undefined;
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
        CREATE TABLE ${records} (tenant INTEGER, id INTEGER, slug TEXT UNIQUE, PRIMARY KEY (tenant, id));
        INSERT INTO ${records} VALUES (1, 2, 'first'), (1, 3, 'second');
        CREATE TABLE ${events} (id SERIAL PRIMARY KEY, value TEXT);
        CREATE TABLE ${noKey} (value TEXT);
        INSERT INTO ${noKey} VALUES ('keyless'), ('first value'), ('second value');
      `);
      const options = {
        dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
        schemaFilter: { [schema]: 1 as const },
        transactions: true,
        publish: "*" as const,
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
            },
          },
        },
      });
      const created = await createProstgles()<{ capture: typeof capture }>({
        ...options,
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
              child: defineFunction({ run: async () => capture("child") }),
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
        const nested = observed.find(
          (item) => item.phase === "noKey" && item.execution.runId === execution.runId,
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
      await dbo.tx!(async (tx) => {
        transaction = tx;
        await alice.clientMethods.outer!.run(input);
        assert.equal(readExecution(), undefined);
        assert(!observed.some(({ phase }) => phase === "afterCommit"));
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

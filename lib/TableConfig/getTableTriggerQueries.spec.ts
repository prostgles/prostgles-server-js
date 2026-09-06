import assert from "node:assert/strict";
import test from "node:test";
import { asName } from "prostgles-types";
import type { DB } from "../initProstgles";
import { getTableTriggerQueries } from "./getTableTriggerQueries";

void test("trigger configuration quotes names and bodies and preserves unmanaged triggers", async () => {
  const db = {
    any: () =>
      Promise.resolve([
        { name: "manual", comment: null },
        { name: "old_insert", comment: "prostgles.tableConfig:old" },
      ]),
  } as unknown as DB;
  const queries = await getTableTriggerQueries(
    db,
    "Odd ' table",
    {
      triggers: {
        audit: {
          type: "after",
          actions: ["insert"],
          forEach: "row",
          query: "BEGIN RAISE NOTICE '$$'; RETURN NULL; END;",
        },
      },
    },
    asName,
  );
  assert.ok(queries.some((query) => query.includes('ON "Odd \' table"')));
  assert.ok(
    queries.some((query) =>
      query.includes("AS 'BEGIN RAISE NOTICE ''$$''; RETURN NULL; END;';"),
    ),
  );
  assert.ok(
    queries.some((query) => query.includes('DROP TRIGGER "old_insert"')),
  );
  assert.ok(!queries.some((query) => query.includes('DROP TRIGGER "manual"')));
});

void test("unchanged triggers do not produce DDL; changed bodies replace them", async () => {
  const trigger = {
    type: "after",
    actions: ["update"],
    forEach: "row",
    query: "BEGIN RETURN NULL; END;" as string,
  } as const;
  const config = {
    triggers: { audit: { ...trigger, actions: [...trigger.actions] } },
  };
  const first = await getTableTriggerQueries(
    { any: () => Promise.resolve([]) } as unknown as DB,
    "records",
    config,
    asName,
  );
  const commentQuery = first.find((query) => query.startsWith("COMMENT ON"))!;
  const comment = commentQuery.split(" IS '")[1]!.slice(0, -2);
  const db = {
    any: () => Promise.resolve([{ name: "audit_update", comment }]),
  } as unknown as DB;
  assert.deepEqual(
    await getTableTriggerQueries(db, "records", config, asName),
    [],
  );
  config.triggers.audit.query =
    "BEGIN RAISE NOTICE 'changed'; RETURN NULL; END;";
  assert.ok(
    (await getTableTriggerQueries(db, "records", config, asName)).some(
      (query) => query.startsWith("CREATE OR REPLACE FUNCTION"),
    ),
  );
  assert.deepEqual(await getTableTriggerQueries(db, "records", {}, asName), [
    'DROP TRIGGER "audit_update" ON "records";',
  ]);
});

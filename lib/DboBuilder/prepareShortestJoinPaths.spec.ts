import assert from "node:assert/strict";
import test from "node:test";
import type { DboBuilder } from "./DboBuilder";
import { prepareShortestJoinPaths } from "./prepareShortestJoinPaths";

void test("configured joins are deferred only during table configuration", async () => {
  const builder = {
    prostgles: { preparingTableConfig: true, opts: { joins: [
      { tables: ["conditions", "members"], on: [{ project_id: "project_id" }], type: "many-many" },
    ] } },
    tablesOrViews: [],
  } as unknown as DboBuilder;
  assert.deepEqual((await prepareShortestJoinPaths(builder)).joins, []);
  builder.prostgles.preparingTableConfig = false;
  await assert.rejects(prepareShortestJoinPaths(builder), (error: unknown) =>
    typeof error === "string" && error.includes("Table not found: conditions")
  );
});

void test("existing configured joins remain available during table configuration", async () => {
  const join = { tables: ["conditions", "members"], on: [{ project_id: "project_id" }], type: "many-many" };
  const builder = {
    prostgles: { preparingTableConfig: true, opts: { joins: [join] } },
    tablesOrViews: ["conditions", "members"].map((name) => ({ name, columns: [{ name: "project_id" }] })),
  } as unknown as DboBuilder;
  assert.deepEqual((await prepareShortestJoinPaths(builder)).joins, [join]);
  builder.prostgles.preparingTableConfig = false;
  assert.deepEqual((await prepareShortestJoinPaths(builder)).joins, [join]);
});

import assert from "node:assert/strict";
import test from "node:test";
import type { DboBuilder } from "../DboBuilder";
import { prepareShortestJoinPaths } from "./prepareShortestJoinPaths";
import type { Join } from "../../ProstglesTypes";

void test("duplicate configured table pairs are rejected even during table configuration", () => {
  const join: Join = {
    tables: ["conditions", "members"],
    on: [{ project_id: "project_id" }],
    type: "many-many",
  };
  for (const preparingTableConfig of [false, true]) {
    for (const override of [false, true]) {
      for (const tables of [join.tables, [...join.tables].reverse() as Join["tables"]]) {
        const builder = {
          prostgles: {
            preparingTableConfig,
            opts: { joins: [join, { ...join, tables, override }] },
          },
          tablesOrViews: [],
        } as unknown as DboBuilder;
        assert.throws(
          () => prepareShortestJoinPaths(builder),
          /Duplicate configured join for table pair/,
        );
      }
    }
  }
});

void test("configured joins are deferred only during table configuration", () => {
  const builder = {
    prostgles: {
      preparingTableConfig: true,
      opts: {
        joins: [
          {
            tables: ["conditions", "members"],
            on: [{ project_id: "project_id" }],
            type: "many-many",
          },
        ],
      },
    },
    tablesOrViews: [],
  } as unknown as DboBuilder;
  assert.deepEqual(prepareShortestJoinPaths(builder).joins, []);
  builder.prostgles.preparingTableConfig = false;
  assert.throws(
    () => prepareShortestJoinPaths(builder),
    (error: unknown) => typeof error === "string" && error.includes("Table not found: conditions"),
  );
});

void test("existing configured joins remain available during table configuration", () => {
  const join = {
    tables: ["conditions", "members"],
    on: [{ project_id: "project_id" }],
    type: "many-many",
  };
  const builder = {
    prostgles: { preparingTableConfig: true, opts: { joins: [join] } },
    tablesOrViews: ["conditions", "members"].map((name) => ({
      name,
      columns: [{ name: "project_id" }],
    })),
  } as unknown as DboBuilder;
  assert.deepEqual(prepareShortestJoinPaths(builder).joins, [join]);
  builder.prostgles.preparingTableConfig = false;
  assert.deepEqual(prepareShortestJoinPaths(builder).joins, [join]);
});

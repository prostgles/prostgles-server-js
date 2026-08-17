import assert from "node:assert";
import { resolve } from "node:path";
import { describe, test } from "node:test";
import { getServerFunctionReturnTypes } from "./getServerFunctionReturnTypes";
import type {} from "./getServerFunctionReturnTypes.fixture";

void describe("getServerFunctionReturnTypes", async () => {
  await test("reads grouped functions and stops at recursive types", () => {
    const fixturePath = resolve(
      __dirname,
      "../../lib/DBSchemaBuilder/getServerFunctionReturnTypes.fixture.ts",
    );
    const result = getServerFunctionReturnTypes(fixturePath);

    assert.equal(result.get("scalarResult"), "number");
    assert.equal(result.get("externalScalar"), "string");
    assert.equal(result.get("recursiveResult"), "{ value: string; next?: unknown }");
    assert.equal(
      result.get("sampleSchemas"),
      'Array<(({ name: string; path: string } & { type: "sql"; file: string }) | ({ name: string; path: string } & { type: "dir"; workspaceConfig?: (undefined | { workspaces: Array<{ options?: (undefined | { hideCounts?: (undefined | false | true); tableListEndInfo?: (undefined | "count" | "size" | "none") }) }> }) }))>',
    );
  });
});

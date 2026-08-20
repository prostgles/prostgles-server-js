import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import type { AuthClientRequest } from "./Auth/AuthTypes";
import type { Prostgles } from "./Prostgles";
import { runClientMethod } from "./runClientRequest";

void describe("runClientMethod", async () => {
  const getProstgles = (run: () => string) =>
    ({
      dboBuilder: {
        dboMap: new Map([["items", {}]]),
      },
      publishParser: {
        getAllowedFunctions: () =>
          Promise.resolve(
            new Map([
              [
                "testLookup",
                {
                  input: { table: { type: "TableLookup" } },
                  run,
                },
              ],
            ]),
          ),
      },
    }) as unknown as Prostgles;

  await test("accepts valid lookup values", async () => {
    const result = await runClientMethod.call(
      getProstgles(() => "ok"),
      { name: "testLookup", input: { table: "items" } },
      {} as AuthClientRequest,
    );

    assert.equal(result, "ok");
  });

  await test("rejects invalid lookup values before running the function", async () => {
    let didRun = false;
    const error = await runClientMethod
      .call(
        getProstgles(() => {
          didRun = true;
          return "ok";
        }),
        { name: "testLookup", input: { table: "missing" } },
        {} as AuthClientRequest,
      )
      .catch((error: unknown) => error);

    assert.equal(error, 'table references an unknown table "missing"');
    assert.equal(didRun, false);
  });
});

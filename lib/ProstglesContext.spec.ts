import assert from "node:assert";
import { describe, test } from "node:test";
import type { DboBuilder } from "./DboBuilder/DboBuilder";
import { Prostgles } from "./Prostgles";

void describe("Prostgles context", async () => {
  await test("recreates context and runs cleanups in reverse order", async () => {
    const events: string[] = [];
    let contextId = 0;
    const prostgles = new Prostgles({
      dbConnection: "postgres://unused",
      onReady: () => {},
      createContext: ({ onCleanup }) => {
        const id = ++contextId;
        events.push(`create:${id}`);
        onCleanup(() => {
          events.push(`cleanup:first:${id}`);
        });
        onCleanup(() => {
          events.push(`cleanup:second:${id}`);
        });
        return { id };
      },
    });
    prostgles.db = {} as typeof prostgles.db;
    prostgles.dboBuilder = {
      build: async () => {},
      dbo: {},
      sql: {},
      tables: [],
    } as unknown as DboBuilder;

    await prostgles.refreshDBO();
    assert.deepEqual(prostgles.context, { id: 1 });
    await prostgles.refreshDBO();
    assert.deepEqual(prostgles.context, { id: 2 });
    await prostgles.cleanupContext();

    assert.deepEqual(events, [
      "create:1",
      "cleanup:second:1",
      "cleanup:first:1",
      "create:2",
      "cleanup:second:2",
      "cleanup:first:2",
    ]);
    assert.equal(prostgles.context, undefined);
  });

  await test("cleans partially-created context after an error", async () => {
    const events: string[] = [];
    const prostgles = new Prostgles({
      dbConnection: "postgres://unused",
      onReady: () => {},
      createContext: ({ onCleanup }) => {
        onCleanup(() => {
          events.push("cleanup");
        });
        throw new Error("create failed");
      },
    });
    prostgles.db = {} as typeof prostgles.db;
    prostgles.dbo = {};
    prostgles.dboBuilder = {
      sql: {},
      tables: [],
    } as unknown as DboBuilder;

    await assert.rejects(
      prostgles.createContext({ type: "init" }),
      /create failed/,
    );
    assert.deepEqual(events, ["cleanup"]);
    assert.equal(prostgles.context, undefined);
  });
});

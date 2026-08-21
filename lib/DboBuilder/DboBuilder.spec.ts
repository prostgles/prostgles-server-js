import assert from "node:assert";
import { describe, test } from "node:test";
import type { EventInfo } from "../Logging";
import type { Prostgles } from "../Prostgles";
import { DboBuilder } from "./DboBuilder";

const createDboBuilder = ({
  events,
  logs,
}: {
  events: string[];
  logs: EventInfo[];
}) => {
  const transaction = {};
  const prostgles = {
    db: {
      tx: async (callback: (tx: object) => unknown) => {
        const result = await callback(transaction);
        events.push("committed");
        return result;
      },
    },
    opts: {
      onLog: (event: EventInfo) => {
        logs.push(event);
      },
    },
  } as unknown as Prostgles;
  const dboBuilder = Reflect.construct(DboBuilder, [prostgles]) as DboBuilder;
  dboBuilder.tablesOrViews = [];
  return dboBuilder;
};

void describe("DboBuilder onCommit", async () => {
  await test("awaits callbacks after commit and logs callback errors", async () => {
    const events: string[] = [];
    const logs: EventInfo[] = [];
    const dboBuilder = createDboBuilder({ events, logs });

    const result = await dboBuilder.getTX((_dbTX, transaction) => {
      dboBuilder.registerOnCommitCallback(transaction, async ({ db, dbo }) => {
        assert.equal(db, dboBuilder.db);
        assert.equal(dbo, dboBuilder.dbo);
        await Promise.resolve();
        events.push("first callback");
        throw new Error("callback failed");
      });
      dboBuilder.registerOnCommitCallback(transaction, () => {
        events.push("second callback");
        return 123;
      });
      events.push("transaction callback");
      return "mutation result";
    });

    assert.equal(result, "mutation result");
    assert.deepEqual(events, [
      "transaction callback",
      "committed",
      "first callback",
      "second callback",
    ]);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.type, "debug");
    if (logs[0]?.type === "debug") {
      assert.equal(logs[0].command, "DboBuilder.onCommit");
    }
  });

  await test("discards callbacks on rollback", async () => {
    const events: string[] = [];
    const dboBuilder = createDboBuilder({ events, logs: [] });

    await assert.rejects(
      dboBuilder.getTX((_dbTX, transaction) => {
        dboBuilder.registerOnCommitCallback(transaction, () => {
          events.push("callback");
        });
        throw new Error("rollback");
      }),
      /rollback/,
    );

    assert.deepEqual(events, []);
  });
});

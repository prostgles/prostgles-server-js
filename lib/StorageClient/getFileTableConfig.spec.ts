import assert from "node:assert/strict";
import test from "node:test";
import type { Prostgles } from "../Prostgles";
import { getFileTableConfig } from "./getFileTableConfig";

void test("managed files preserve hooks on other tables and append file hooks", () => {
  const guard = { afterEach: [{ commands: { insert: 1 }, validate: async () => {} }] };
  const fileGuard = { beforeEach: [{ commands: { insert: 1 }, validate: async () => {} }] };
  const prostgles = {
    opts: {
      fileTable: { tableName: "files", storageClient: {}, expressApp: {} },
      tableHooks: { documents: guard, files: fileGuard },
    },
  } as unknown as Prostgles;
  const result = getFileTableConfig(prostgles);
  assert.equal(result.tableHooks?.documents, guard);
  assert.equal(result.tableHooks.files?.beforeEach?.length, 2);
  assert.equal(result.tableHooks.files.beforeEach[1], fileGuard.beforeEach[0]);
});

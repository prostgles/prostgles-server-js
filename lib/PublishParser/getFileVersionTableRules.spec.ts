import assert from "node:assert/strict";
import test from "node:test";
import type { FileTableConfig } from "../ProstglesTypes";
import { parseFieldFilter } from "../DboBuilder/ViewHandler/parseFieldFilter";
import type { PublishParser } from "./PublishParser";
import { getFileVersionTableRules } from "./getFileVersionTableRules";

void test("file version rules inherit fields and restrictive select options", async () => {
  const fileColumns = ["id", "updated", "metadata"];
  const versionColumns = ["id", "file_id", "created", "metadata"];
  const getHandler = (columns: string[]) => ({
    column_names: columns,
    parseFieldFilter: (fields: any = "*") => parseFieldFilter(fields, true, columns),
  });
  const parser = {
    dbo: {
      files: getHandler(fileColumns),
      files_versions: getHandler(versionColumns),
    },
    getTableRules: () => Promise.resolve({
      select: {
        fields: "*",
        maxLimit: 5,
        subscribeThrottle: 20,
        disableMethods: { subscribe: 1 },
      },
    }),
  } as unknown as PublishParser;

  const rules = await getFileVersionTableRules.call(
    parser,
    { tableName: "files", versioning: {} } as FileTableConfig,
    {
      select: {
        fields: "*",
        maxLimit: 10,
        subscribeThrottle: 10,
        disableMethods: { sync: 1 },
      },
    },
    undefined,
    undefined,
    undefined,
    undefined,
  );

  assert(rules?.select);
  assert.deepEqual(rules.select.fields, {
    id: 1,
    file_id: 1,
    created: 1,
    metadata: 1,
  });
  assert.equal(rules.select.maxLimit, 5);
  assert.equal(rules.select.subscribeThrottle, 20);
  assert.deepEqual(rules.select.disableMethods, { subscribe: 1, sync: 1 });
});

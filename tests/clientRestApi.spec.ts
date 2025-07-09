import { strict as assert } from "assert";
import type { DBHandlerClient, AuthHandler } from "./client";
import { DBSchemaTable, omitKeys } from "prostgles-types";
import { describe, test } from "node:test";

export const clientRestApi = async (
  db: DBHandlerClient,
  auth: AuthHandler,
  log: (...args: any[]) => any,
  methods,
  tableSchema: DBSchemaTable[],
  token: string
) => {
  await describe("clientRestApi", async () => {
    const rest = async (
      { tableName, command, noAuth }: { tableName: string; command: string; noAuth?: boolean },
      ...params: any[]
    ) => post({ path: `db/${tableName}/${command}`, noAuth, token }, ...(params ?? []));
    const dbRest = (tableName: string, command: string, ...params: any[]) =>
      rest({ tableName, command }, ...(params ?? []));
    const dbRestNoAuth = (tableName: string, command: string, ...params: any[]) =>
      rest({ tableName, command, noAuth: true }, ...(params ?? []));
    const sqlRest = (query: string, ...params: any[]) =>
      post({ path: `db/sql`, token }, query, ...(params ?? []));
    const dbMethod = (methodName: string, ...params: any[]) =>
      post({ path: `methods/${methodName}`, token }, ...(params ?? []));

    await test("Rest api test", async () => {
      const dataFilter = { id: 123123123, last_updated: Date.now() };
      const dataFilter1 = { id: 123123124, last_updated: Date.now() };
      await db.planes.insert?.(dataFilter);
      const item = await db.planes.findOne?.(dataFilter);
      const itemR = await dbRest("planes", "findOne", dataFilter);
      /** last_updated excluded from select.fields and select.filterFields */
      assert.deepStrictEqual(
        await dbRestNoAuth("planes", "findOne", dataFilter).catch((error) => error),
        {
          error: {
            message:
              'planes.last_updated is invalid/disallowed for filtering. Allowed columns: "id", "x", "y", "flight_number"',
          },
        }
      );
      const itemRNA = await dbRestNoAuth("planes", "findOne", { id: dataFilter.id });
      assert.deepStrictEqual(item, itemR);
      const { last_updated, ...allowedData } = item!;
      assert.deepStrictEqual(allowedData, itemRNA);

      await dbRest("planes", "insert", dataFilter1);
      const filter = { "id.>=": dataFilter.id };
      const count = await db.planes.count?.(filter);
      const restCount = await dbRest("planes", "count", filter);
      assert.equal(count, 2);
      assert.equal(restCount, 2);

      const sqlRes = await sqlRest("select 1 as a", {}, { returnType: "rows" });
      assert.deepStrictEqual(sqlRes, [{ a: 1 }]);

      const restTableSchema = await post({ path: "schema", token });
      assert.deepStrictEqual(tableSchema, restTableSchema.tableSchema);
      await Promise.all(
        tableSchema.map(async (tbl) => {
          const cols = await db[tbl.name]?.getColumns?.();
          const info = await db[tbl.name]?.getInfo?.();
          if (db[tbl.name]?.getColumns) {
            const restCols = await dbRest(tbl.name, "getColumns", {});
            assert.deepStrictEqual(tbl.columns, cols);
            assert.deepStrictEqual(tbl.columns, restCols);
            assert.deepStrictEqual(tbl.info, info);
          }
        })
      );

      const two22 = await dbMethod("myfunc", {});
      assert.equal(two22, 222);
    });
  });
};

const post = async (
  { path, noAuth, token }: { path: string; token: string; noAuth?: boolean },
  ...params: any[]
) => {
  const headers = new Headers({
    Authorization: `Bearer ${Buffer.from(noAuth ? "noAuth" : token, "utf-8").toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  const res = await fetch(`http://127.0.0.1:3001/api/${path}`, {
    method: "POST",
    headers,
    body: !params?.length ? undefined : JSON.stringify(params),
  });
  const resBodyJson = await res.text().then((text) => {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  });

  if (res.status !== 200) {
    return Promise.reject(resBodyJson);
  }
  return resBodyJson;
};

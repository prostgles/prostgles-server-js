import { strict as assert } from "assert";
import type { DBHandlerClient, AuthHandler } from "./client";
import { type DBSchemaTable, omitKeys, type AnyObject } from "prostgles-types";
import { describe, test } from "node:test";

export const clientRestApi = async (
  db: DBHandlerClient,
  tableSchema: DBSchemaTable[],
  token: string,
) => {
  const rest = async (
    { tableName, command, noAuth }: { tableName: string; command: string; noAuth?: boolean },
    ...params: any[]
  ) => post({ path: `db/${tableName}/${command}`, noAuth, token }, ...params);
  const dbRest = (tableName: string, command: string, ...params: any[]) =>
    rest({ tableName, command }, ...params);
  const dbRestNoAuth = (tableName: string, command: string, ...params: any[]) =>
    rest({ tableName, command, noAuth: true }, ...params);
  const sqlRest = (query: string, ...params: any[]) =>
    post({ path: `db/sql`, token }, query, ...params);
  const dbMethod = (methodName: string, input?: unknown) =>
    post({ path: `methods/${methodName}`, token, onlyFirstParam: true }, input);

  await describe("clientRestApi", async () => {
    await test("Rest api test", async () => {
      const dataFilter = { id: 123123123, last_updated: Date.now() };
      const dataFilter1 = { id: 123123124, last_updated: Date.now() };
      await db.planes?.insert?.(dataFilter);
      const item = await db.planes?.findOne?.(dataFilter);
      const itemR = await dbRest("planes", "findOne", dataFilter);
      /** last_updated excluded from select.fields and select.filterFields */
      assert.deepStrictEqual(
        await dbRestNoAuth("planes", "findOne", dataFilter).catch((error) => error),
        {
          error: {
            message:
              'planes.last_updated is invalid/disallowed for filtering. Allowed columns: "id", "x", "y", "flight_number"',
          },
        },
      );
      const itemRNA = await dbRestNoAuth("planes", "findOne", { id: dataFilter.id });
      assert.deepStrictEqual(item, itemR);
      const { last_updated, ...allowedData } = item!;
      assert.deepStrictEqual(allowedData, itemRNA);

      await dbRest("planes", "insert", dataFilter1);
      const filter = { "id.>=": dataFilter.id };
      const count = await db.planes?.count?.(filter);
      const restCount = await dbRest("planes", "count", filter);
      assert.equal(count, 2);
      assert.equal(restCount, 2);

      const sqlRes = await sqlRest("select 1 as a", {}, { returnType: "rows" });
      assert.deepStrictEqual(sqlRes, [{ a: 1 }]);

      const restTableSchema: typeof tableSchema = (await post({ path: "schema", token }))
        .tableSchema;

      assert.deepStrictEqual(tableSchema, restTableSchema);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const planesTable = restTableSchema.find((table) => table.name === "planes") as
        | (DBSchemaTable & {
            clientSchemaTest?: { sid?: string; tableIndex: number };
          })
        | undefined;
      assert.equal(planesTable?.clientSchemaTest?.sid, token);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const idColumn = planesTable.columns.find((column) => column.name === "id") as
        | (DBSchemaTable["columns"][number] & {
            clientSchemaTest?: { sid?: string; columnIndex: number };
          })
        | undefined;
      assert.equal(idColumn?.clientSchemaTest?.sid, token);
      // Connection setup and direct requests apply customization different numbers of times.
      const withoutPassCount = ({ clientSchemaTest, ...info }: AnyObject) => ({
        ...info,
        clientSchemaTest: clientSchemaTest && omitKeys(clientSchemaTest, ["passes"]),
      });
      await Promise.all(
        tableSchema.map(async ({ name, columns, ...otherInfo }) => {
          const cols = await db[name]?.getColumns?.();
          const info = await db[name]?.getInfo?.();
          if (db[name]?.getColumns) {
            const restCols = await dbRest(name, "getColumns", {});
            assert.deepStrictEqual(columns, cols);
            assert.deepStrictEqual(columns.map(withoutPassCount), restCols.map(withoutPassCount));
            assert.deepStrictEqual(withoutPassCount(otherInfo), withoutPassCount(info!));
            if (name === "planes") {
              assert.ok(restCols.length);
              for (const column of restCols) {
                assert.equal(column.clientSchemaTest.passes, 1);
                assert.equal(column.clientSchemaTest.sid, token);
              }
            }
          }
        }),
      );

      const err = await dbMethod("myfunc", {}).catch((error) => error);
      assert.deepStrictEqual(err, { error: { message: "arg1 is missing but required" } });
      const two22 = await dbMethod("myfunc", { arg1: 1 }).catch((error) => error);
      assert.equal(two22, 222);
    });

    await test("REST file inserts and updates preserve decoded bytes", async () => {
      const fileRest = (tableName: string, command: string, ...params: any[]) =>
        post({ path: `db/${tableName}/${command}`, token: "main" }, ...params);
      const bytes = Buffer.from([0, 1, 127, 128, 254, 255, 10]);
      const replacement = Buffer.from("Updated through REST ✓");
      const formats = [
        (value: Buffer) => Array.from(value),
        (value: Buffer) => value, // JSON.stringify invokes Buffer.toJSON().
        (value: Buffer) => ({ encoding: "base64", data: value.toString("base64") }),
        (value: Buffer) => ({ encoding: "base64", data: value.toString("base64").replace(/=+$/, "") }),
      ];
      const readFile = async (url: string) => {
        const response = await fetch(`http://127.0.0.1:3001${url}`, {
          headers: { Authorization: `Bearer ${Buffer.from("main").toString("base64")}` },
        });
        assert.equal(response.status, 200);
        return Buffer.from(await response.arrayBuffer());
      };
      for (const format of formats) {
        for (const nested of [false, true]) {
          const payload = { original_name: "rest.txt", data: format(bytes) };
          const row = await fileRest(
            nested ? "users_public_info" : "files",
            "insert",
            nested ? { name: "REST upload", avatar: payload } : payload,
            { returning: "*" },
          );
          const file = nested ? row.avatar : row;
          try {
            assert.deepEqual(await readFile(file.url), bytes);
            assert.equal(Number(file.content_length), bytes.length);
            const [updated] = await fileRest(
              "files",
              "update",
              { id: file.id },
              { original_name: "rest-updated.txt", data: format(replacement) },
              { returning: "*" },
            );
            assert.deepEqual(await readFile(updated.url), replacement);
            assert.equal(Number(updated.content_length), replacement.length);
            assert.equal(updated.version, 2);
          } finally {
            if (nested) await fileRest("users_public_info", "delete", { id: row.id });
            await fileRest("files", "delete", { id: file.id });
          }
        }
      }
      const count = await fileRest("files", "count", {});
      const invalidData = [
        [-1], [256], [1.5], ["1"],
        { type: "Buffer", data: [256] },
        { type: "Buffer", data: "invalid" },
        { encoding: "base64", data: "%%%" },
        { encoding: "base64", data: "YQ=" },
        { encoding: "base64", data: "YQ==junk" },
        { encoding: "base64", data: "YQ==\n" },
        { encoding: "base64", data: "-_8=" },
        { encoding: "base64", data: "YR==" },
        { encoding: "base64", data: "data:text/plain;base64,YQ==" },
        { encoding: "hex", data: "ff" },
        "unencoded string",
        null,
        undefined,
      ];
      for (const payload of [
        ...invalidData.map((data) => ({ original_name: "invalid.txt", data })),
        { data: [] },
        { original_name: 123, data: [] },
      ]) {
        await assert.rejects(
          () => fileRest("files", "insert", payload),
          (error: any) => {
            const message = error.error?.message;
            assert.match(message, /data|original_name/);
            if (
              payload.data && typeof payload.data === "object" &&
              "encoding" in payload.data && payload.data.encoding === "base64"
            ) {
              assert.ok(message.includes(
                'canonical standard base64, with correct "=" padding or no padding',
              ));
              assert.ok(message.includes('"YQ==" or "YQ"'));
            }
            if (payload.data === "unencoded string") {
              assert.ok(message.includes('Blob | integer[] | { type: "Buffer"; data: integer[] }'));
              assert.ok(message.includes('{ encoding: "base64"; data: string }'));
            }
            return true;
          },
        );
      }
      assert.equal(await fileRest("files", "count", {}), count);
    });

    await test("Rest api security", async () => {
      const sensitiveKeys = ["constructor", "__proto__", "prototype"];
      for (const key of sensitiveKeys) {
        const res = await dbRest(key, "find", {}).catch((error) => error);
        assert.deepStrictEqual(res, {
          error: { message: `tableName ${key} is invalid or not allowed` },
        });

        const res1 = await dbRest("planes", "find", JSON.parse(`{"${key}": {}}`)).catch(
          (error) => error,
        );
        assert.deepStrictEqual(
          res1,

          {
            error: {
              message: `planes.${key} is invalid/disallowed for filtering. Allowed columns: "id", "x", "y", "flight_number", "last_updated"`,
            },
          },
        );

        const methodRes = await dbMethod(key, {}).catch((error) => error);
        assert.deepStrictEqual(methodRes, {
          error: { message: `Disallowed/missing function "${key}"` },
        });
      }
    });
  });
};

const post = async (
  {
    path,
    noAuth,
    token,
    onlyFirstParam,
  }: { path: string; token: string; noAuth?: boolean; onlyFirstParam?: boolean },
  ...params: any[]
) => {
  const headers = new Headers({
    Authorization: `Bearer ${Buffer.from(noAuth ? "noAuth" : token, "utf-8").toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  });

  const body =
    !params.length ? undefined
    : onlyFirstParam ? JSON.stringify(params[0])
    : JSON.stringify(params);
  const res = await fetch(`http://127.0.0.1:3001/api/${path}`, {
    method: "POST",
    headers,
    body,
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

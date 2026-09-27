import express from "express";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { test } from "node:test";
import prostgles, {
  DB_GENERATED_NAMES,
  defineFunction,
  getLocalStorageClient,
  type ProstglesInitOptions,
  type PublishContextValue,
} from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { DB } from "prostgles-server/dist/Prostgles";
import { CHANNELS, type AnyObject, type ClientSchema } from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";
import ts from "typescript";

export const testClientSchemaTypes = async (db: DB) => {
  await test(
    "client publish profiles compile at startup and follow user types",
    { timeout: 30000 },
    async (t) => {
      const http = createServer();
      const io = new Server(http);
      const sockets: Socket[] = [];
      let instance:
        | Pick<
            Awaited<ReturnType<typeof prostgles>>,
            | "update"
            | "db"
            | "destroy"
            | "getTSSchema"
            | "reWriteDBSchema"
            | "options"
            | "getClientDBHandlers"
          >
        | undefined;
      const suffix = randomUUID().slice(0, 8);
      const schemaName = `client_schema_types_${suffix}`;
      const tableName = "correspondence";
      const privateTableName = "private_table";
      const fileTableName = "files";
      const generatedTypesDir = path.resolve("debug/client-schema-types", suffix);
      try {
        await db.none(`
        CREATE SCHEMA ${schemaName};
        CREATE TABLE ${schemaName}.${tableName} (
          id SERIAL PRIMARY KEY,
          body TEXT NOT NULL,
          created_by TEXT NOT NULL,
          note TEXT,
          internal TEXT NOT NULL DEFAULT 'default',
          synced BIGINT NOT NULL
        );
        CREATE TABLE ${schemaName}.${privateTableName} (id SERIAL PRIMARY KEY);
      `);
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        const userIdContextValue = {
          $prostglesContext: { objectName: "user", objectPropertyName: "id" },
        } as const satisfies PublishContextValue<{ user: { id: string } }>;
        instance = await prostgles({
          dbConnection: {
            ...getConnectionDetails(db),
            options: `-c search_path=${schemaName}`,
          } as unknown as ProstglesInitOptions["dbConnection"],
          tsGeneratedTypesDir: generatedTypesDir,
          transactions: true,
          schemaFilter: { [schemaName]: 1 },
          tableConfig: {
            [tableName]: {
              syncConfig: { id_fields: ["id"], synced_field: "synced" },
            },
          },
          fileTable: {
            tableName: fileTableName,
            expressApp: express(),
            storageClient: getLocalStorageClient({
              localFolderPath: path.join(generatedTypesDir, "files"),
            }),
          },
          io,
          auth: {
            sidKeyName: "token",
            getUser: (sid) => {
              if (!sid) return undefined;
              return {
                user: { id: `user-${sid}`, type: sid },
                clientUser: { id: sid, type: sid },
              };
            },
            findUser: (filter) =>
              (
                "$and" in filter &&
                filter.$and?.every((condition: AnyObject) => condition.id === "user-guest")
              ) ?
                { id: "user-guest", type: "guest" }
              : undefined,
          },
          functions: {
            guest: {
              userFilter: { id: "user-guest" },
              functions: {
                transactionTest: defineFunction({
                  input: { fail: "boolean" },
                  run: ({ fail }, { withClientDbTx }) =>
                    withClientDbTx(async (tx) => {
                      const row = await tx[tableName]!.insert!(
                        { body: fail ? "function-rollback" : "function-commit" },
                        { returning: "*" },
                      );
                      if (fail) {
                        await tx[tableName]!.update!({ id: row.id }, { internal: "forbidden" });
                      }
                      return row;
                    }),
                }),
              },
            },
          },
          publish: [
            {
              name: "GuestDBSchema",
              userTypes: ["guest", "member"],
              publish: {
                [fileTableName]: { select: "*", insert: "*", update: "*" },
                [tableName]: {
                  select: {
                    fields: "*",
                    forcedFilter: {
                      created_by: userIdContextValue as unknown as string,
                    },
                  },
                  update: {
                    fields: ["body", "note", "created_by", "synced"],
                    disableMethods: { updateBatch: 1 },
                    postValidate: ({ row }) => {
                      if (row.body === "denied-by-post-validate") {
                        throw new Error("Update rejected by postValidate");
                      }
                    },
                    forcedData: {
                      created_by: userIdContextValue,
                    },
                  },
                  insert: {
                    fields: { internal: 0 },
                    checkFilter: { body: { $ne: "denied-by-check-filter" } },
                    forcedData: {
                      created_by: userIdContextValue,
                    },
                  },
                },
              },
            },
            {
              name: "AdminDBSchema",
              userTypes: ["admin"],
              publish: {
                [tableName]: { select: "*", insert: "*", update: "*" },
                [privateTableName]: { select: "*" },
              },
            },
            {
              name: "ViewerDBSchema",
              userTypes: ["viewer"],
              publish: { [tableName]: { select: "*" } },
            },
          ],
          onReady: () => {},
        });
        const { tsSchema } = await instance.getTSSchema();
        assert.doesNotMatch(tsSchema, /\bimport(?:\s|\()/);
        assert.equal(
          readFileSync(path.join(generatedTypesDir, `${DB_GENERATED_NAMES.SCHEMA}.ts`), "utf8"),
          tsSchema,
        );
        await instance.reWriteDBSchema();
        assert.equal((await instance.getTSSchema()).tsSchema, tsSchema);
        assert.equal(io.sockets.sockets.size, 0);
        checkTypes(
          tsSchema,
          `
        import type { TableHandler, InsertDataWithNested, ClientSchemaFor } from "prostgles-types";
        import type { DBHandlerClient } from "prostgles-client";
        import type { DBOFullyTypedClient, InitResult, SessionUser } from "../server/node_modules/prostgles-server";
        import type { RestrictedFunctionContext, UnrestrictedFunctionContext } from "../server/node_modules/prostgles-server/dist/PublishParser/defineServerFunction";
        import type { getClientHandlers } from "../server/node_modules/prostgles-server/dist/WebsocketAPI/getClientHandlers";
        type Name = "${tableName}";
        type FileName = "${fileTableName}";
        declare const guest: TableHandler<GuestDBSchema, Name>;
        declare const files: TableHandler<GuestDBSchema, FileName>;
        declare const admin: TableHandler<AdminDBSchema, Name>;
        declare const combined: TableHandler<ClientDBSchema, Name>;
        declare const server: TableHandler<${DB_GENERATED_NAMES.SCHEMA}, Name>;
        declare const viewer: TableHandler<ViewerDBSchema, Name>;
        declare const client: DBHandlerClient<ClientDBSchema>;
        declare const adminClient: DBHandlerClient<AdminDBSchema>;
        declare const restricted: RestrictedFunctionContext<GuestDBSchema>;
        declare const unrestricted: UnrestrictedFunctionContext<DBGeneratedSchema>;
        declare const serverClient: DBOFullyTypedClient<ClientDBSchema>;
        declare const handlers: Awaited<ReturnType<typeof getClientHandlers<GuestDBSchema>>>;
        declare const instance: InitResult<DBGeneratedSchema, SessionUser, undefined, ClientDBSchema>;
        declare const guestClientSchema: ClientSchemaFor<ClientSchemas, "guest">;
        guestClientSchema satisfies GuestDBSchema;
        async () => {
          const combinedHandlers = await instance.getClientDBHandlers(null as never, undefined);
          const guestHandlers = await instance.getClientDBHandlers<GuestDBSchema>(null as never, undefined);
          await combinedHandlers.clientDb["${privateTableName}"]?.find();
          // @ts-expect-error the guest profile does not publish private_table
          await guestHandlers.clientDb["${privateTableName}"].find();
          const restrictedRow = await restricted.dbo["${tableName}"].insert({ body: "hello" }, { returning: "*" });
          restrictedRow.created_by satisfies string;
          await handlers.clientDb["${tableName}"].update({}, { body: "changed" });
          const transactionResult = await handlers.withClientDbTx(async (tx) => {
            const row = await tx["${tableName}"].insert({ body: "transaction" }, { returning: "*" });
            row.created_by satisfies string;
            // @ts-expect-error transactions preserve profile field restrictions
            await tx["${tableName}"].update({}, { internal: "private" });
            // @ts-expect-error transactions do not expose unpublished tables
            await tx["${privateTableName}"].find();
            // @ts-expect-error transactions do not expose raw SQL
            tx.sql("SELECT 1");
            // @ts-expect-error transactions do not expose nested transactions
            tx.tx(() => {});
            return row.id;
          });
          transactionResult satisfies number;
          restricted.withClientDbTx satisfies typeof handlers.withClientDbTx;
          // @ts-expect-error callbacks do not receive the unrestricted SQL transaction
          handlers.withClientDbTx((tx, rawTx) => rawTx.any("SELECT 1"));
          // @ts-expect-error getClientHandlers preserves profile field restrictions
          await handlers.clientDb["${tableName}"].update({}, { internal: "private" });
          // @ts-expect-error restricted functions respect forced insert fields
          await restricted.dbo["${tableName}"].insert({ body: "hello", created_by: "other" });
          // @ts-expect-error restricted functions cannot start transactions
          restricted.dbo.tx(() => {});
          // @ts-expect-error client wrappers do not expose isView
          restricted.dbo["${tableName}"].isView;
          // @ts-expect-error table is absent for some profiles
          await serverClient["${privateTableName}"].find();
          await serverClient["${privateTableName}"]?.find();
          await unrestricted.dbo.tx(async (tx) => {
            await tx["${tableName}"].update({}, { internal: "private" });
          });

          await client["${tableName}"].update({}, { body: "changed" });
          await guest.update({}, { body: 123 });
          // @ts-expect-error table is absent for guests and viewers
          await client["${privateTableName}"].find();
          await client["${privateTableName}"]?.find();
          await adminClient["${privateTableName}"].find();
          const updated = await guest.update({}, { body: "changed", note: null }, { returning: "*" });
          updated?.[0]?.created_by satisfies string | undefined;
          await guest.updateBatch([[{}, { body: "changed" }]]);
          // @ts-expect-error excluded update field
          await guest.update({}, { internal: "private" });
          const forcedUpdate = { body: "changed", created_by: "other" };
          // @ts-expect-error forced update field through a variable
          await guest.update({}, forcedUpdate);
          // @ts-expect-error casts must not bypass excluded fields
          await guest.update({}, { created_by: { $merge: [] } });
          // @ts-expect-error updateBatch respects allowed fields
          await guest.updateBatch([[{}, { internal: "private" }]]);
          // @ts-expect-error read-only profiles cannot update
          await viewer.update({}, {});
          await admin.update({}, { internal: "private" });
          await combined.update({}, { internal: "private" });
          await server.update({}, { internal: "private" });
          const row = await guest.insert({ body: "hello", note: null }, { returning: "*" });
          row.created_by satisfies string;
          row.synced satisfies string;
          await guest.insertMany([{ body: "hello" }]);
          // @ts-expect-error excluded fields cannot be inserted
          await guest.insert({ body: "hello", internal: "private" });
          // @ts-expect-error a read-only profile cannot insert
          await viewer.insert({ body: "hello" });
          // @ts-expect-error body remains required
          await guest.insert({});
          // @ts-expect-error forced values are forbidden
          await guest.insert({ body: "hello", created_by: "other" });
          const supplied = { body: "hello", created_by: "other" };
          // @ts-expect-error also reject forced fields through variables
          await guest.insert(supplied);
          await admin.insert({ body: "hello", created_by: "admin" });
          // @ts-expect-error admin must supply created_by
          await admin.insert({ body: "hello" });
          await combined.insert({ body: "hello" });
          await combined.insert({ body: "hello", created_by: "admin" });
          // @ts-expect-error read-only profiles do not relax required insert fields
          await combined.insert({});
          // @ts-expect-error server insert defaults are unchanged
          await server.insert({ body: "hello", created_by: "admin" });
          await server.insert({ body: "hello", created_by: "admin", synced: 1 });
          await files.insert({ original_name: "hello.txt", data: new Uint8Array() });
          await files.insert({ id: "file-id", original_name: "hello.txt", original_last_modified: null, data: new Uint8Array() });
          // @ts-expect-error file metadata is generated by the server
          await files.insert({ original_name: "hello.txt", data: new Uint8Array(), content_type: "text/plain" });
          const fileWithGeneratedMetadata = { original_name: "hello.txt", data: new Uint8Array(), content_type: "text/plain" };
          // @ts-expect-error file metadata is also rejected through variables
          await files.insert(fileWithGeneratedMetadata);
          // @ts-expect-error original_name is required
          await files.insert({ data: new Uint8Array() });
          await files.update({}, { original_name: "updated.txt", data: new Uint8Array() });
          // @ts-expect-error file metadata cannot be updated directly
          await files.update({}, { content_type: "text/plain" });
          // @ts-expect-error file metadata updates are also rejected through variables
          await files.update({}, fileWithGeneratedMetadata);
          // @ts-expect-error unpublished tables are absent
          type Private = GuestDBSchema["${privateTableName}"];
          type Nested = InsertDataWithNested<{}, GuestDBSchema, "parent">;
          const nested: Nested = { "${tableName}": [{ body: "hello" }] };
          // @ts-expect-error nested inputs also exclude forced fields
          const badNested: Nested = { "${tableName}": [{ created_by: "other" }] };
        };
      `,
        );
        const originalPublish = instance.options.publish;
        // await instance.update({ publish: originalPublish });
        const profiles: Record<string, ClientSchema> = {};
        for (const [role, name] of [
          ["guest", "GuestDBSchema"],
          ["admin", "AdminDBSchema"],
          ["viewer", "ViewerDBSchema"],
          ["member", "MemberDBSchema"],
          ["unknown", "UnknownDBSchema"],
          ["", "AnonymousDBSchema"],
        ] as const) {
          const socket = createClient(`http://127.0.0.1:${address.port}`, {
            transports: ["websocket"],
            reconnection: false,
            query: role ? { token: role } : {},
          });
          sockets.push(socket);
          profiles[name] = await new Promise<ClientSchema>((resolve, reject) => {
            socket.once("connect_error", reject);
            socket.once(CHANNELS.SCHEMA, resolve);
          });
        }
        const guestSchema = profiles.GuestDBSchema!;
        assert.equal(guestSchema.err, undefined);
        const table = guestSchema.tableSchema.find((t) => t.name === tableName);
        assert(table);
        assert.equal(table.columns.find((c) => c.name === "created_by")?.insert, false);
        assert.deepEqual(profiles.MemberDBSchema!.tableSchema, guestSchema.tableSchema);
        assert.deepEqual(profiles.UnknownDBSchema!.tableSchema, []);
        assert.deepEqual(profiles.AnonymousDBSchema!.tableSchema, []);
        const serverSocket = io.sockets.sockets.get(sockets[0]!.id!);
        assert(serverSocket);
        const handlers = await instance.getClientDBHandlers({ socket: serverSocket }, undefined);
        assert.equal(privateTableName in handlers.clientDb, false);
        assert.equal("delete" in handlers.clientDb[tableName]!, false);
        assert.equal(typeof handlers.clientDb[tableName]!.upsert, "function");
        assert.equal(typeof handlers.clientDb[tableName]!.insertMany, "function");
        assert.equal("updateBatch" in handlers.clientDb[tableName]!, false);
        const viewerSocket = io.sockets.sockets.get(sockets[2]!.id!);
        assert(viewerSocket);
        const viewerHandlers = await instance.getClientDBHandlers(
          { socket: viewerSocket },
          undefined,
        );
        assert.deepEqual(Object.keys(viewerHandlers.clientDb).sort(), [tableName]);
        assert.deepEqual(Object.keys(viewerHandlers.clientDb[tableName]!).sort(), [
          "count",
          "find",
          "findOne",
          "getColumns",
          "getInfo",
          "size",
          "subscribe",
          "subscribeOne",
        ]);
        const inserted = await handlers.clientDb[tableName]!.insert!(
          { body: "hello" },
          { returning: "*" },
        );
        assert.equal(inserted.created_by, "user-guest");
        assert(Number(inserted.synced) > 0);
        const updated = await handlers.clientDb[tableName]!.update!(
          { id: inserted.id },
          { body: "updated" },
          { returning: "*" },
        );
        assert.equal(updated![0]!.body, "updated");
        assert.equal(updated![0]!.created_by, "user-guest");
        assert.equal(
          (await handlers.clientDb[tableName]!.findOne!({
            id: inserted.id,
          }))!.created_by,
          "user-guest",
        );
        await assert.rejects(
          handlers.clientDb[tableName]!.update!({ id: inserted.id }, { internal: "forbidden" }),
        );
        const transactionRow = await handlers.withClientDbTx(async (...args) => {
          assert.equal(args.length, 1);
          const [tx] = args;
          assert.equal("sql" in tx, false);
          const row = await tx[tableName]!.insert!(
            { body: "transaction", created_by: "other" },
            { returning: "*" },
          );
          assert.equal(row.created_by, "user-guest");
          assert.equal(await tx[tableName]!.count!({ id: row.id }), 1);
          assert.equal(await handlers.clientDb[tableName]!.count!({ id: row.id }), 0);
          await tx[tableName]!.update!({ id: row.id }, { body: "committed" });
          return tx[tableName]!.findOne!({ id: row.id });
        });
        assert.equal(transactionRow!.body, "committed");
        assert.equal(await handlers.clientDb[tableName]!.count!({ id: transactionRow!.id }), 1);
        await instance.db[tableName]!.insert!({ body: "hidden", created_by: "other" });
        await handlers.withClientDbTx(async (tx) => {
          assert.equal(await tx[tableName]!.count!({ body: "hidden" }), 0);
          assert.equal(privateTableName in tx, false);
          assert.equal("delete" in tx[tableName]!, false);
          assert.equal("db" in tx[tableName]!, false);
          assert.equal("tx" in tx[tableName]!, false);
        });
        await t.test("caught subscription errors still roll back client transactions", async () => {
          const row = { body: "before-subscription-failure" };
          const error = { message: /subscribe/ };
          await assert.rejects(
            handlers.withClientDbTx(async (tx) => {
              await tx[tableName]!.insert!(row);
              await assert.rejects(tx[tableName]!.subscribe!({}, {}, undefined as any), error);
            }),
            error,
          );
          assert.equal(await handlers.clientDb[tableName]!.count!(row), 0);
        });
        for (const failure of ["throw", "permission", "database"] as const) {
          const body = `rollback-${failure}`;
          await assert.rejects(
            handlers.withClientDbTx(async (tx) => {
              await tx[tableName]!.insert!({ body });
              if (failure === "permission") {
                await tx[tableName]!.update!({}, { internal: "forbidden" });
              } else if (failure === "database") {
                await tx[tableName]!.insert!({ id: transactionRow!.id, body });
              } else {
                throw new Error("rollback");
              }
            }),
          );
          assert.equal(await handlers.clientDb[tableName]!.count!({ body }), 0);
        }
        await t.test("caught checkFilter errors still roll back client transactions", async () => {
          const row = { body: "denied-by-check-filter" };
          const error = { message: /failed the check condition/ };
          await assert.rejects(handlers.clientDb[tableName]!.insert!(row), error);
          assert.equal(await handlers.clientDb[tableName]!.count!(row), 0);

          await assert.rejects(
            handlers.withClientDbTx(async (tx) => {
              await tx[tableName]!.insert!({ body: "before-check-filter-failure" });
              await assert.rejects(tx[tableName]!.insert!(row), error);
              await assert.rejects(tx[tableName]!.update!({}, { internal: "forbidden" }));
            }),
            error,
          );
          assert.equal(await handlers.clientDb[tableName]!.count!(row), 0);
          assert.equal(
            await handlers.clientDb[tableName]!.count!({ body: "before-check-filter-failure" }),
            0,
          );
        });
        await t.test("caught postValidate errors still roll back client transactions", async () => {
          const error = { message: "Update rejected by postValidate" };
          await assert.rejects(
            handlers.withClientDbTx(async (tx) => {
              await assert.rejects(
                tx[tableName]!.update!(
                  { id: transactionRow!.id },
                  { body: "denied-by-post-validate" },
                ),
                error,
              );
            }),
            error,
          );
          const row = await handlers.clientDb[tableName]!.findOne!({ id: transactionRow!.id });
          assert.equal(row!.body, "committed");
        });
        const scopedHandlers = await instance.getClientDBHandlers(
          { socket: serverSocket },
          { tables: { [tableName]: { select: { forcedFilter: { body: "committed" } } } } },
        );
        assert.deepEqual(Object.keys(scopedHandlers.clientDb).sort(), [tableName]);
        assert.equal("insert" in scopedHandlers.clientDb[tableName]!, false);
        assert.equal("update" in scopedHandlers.clientDb[tableName]!, false);
        assert.equal("upsert" in scopedHandlers.clientDb[tableName]!, false);
        await scopedHandlers.withClientDbTx(async (tx) => {
          assert.equal(await tx[tableName]!.count!(), 1);
          assert.deepEqual(Object.keys(tx).sort(), Object.keys(scopedHandlers.clientDb).sort());
          assert.deepEqual(
            Object.keys(tx[tableName]!),
            Object.keys(scopedHandlers.clientDb[tableName]!),
          );
        });
        const functionRow = await handlers.clientMethods.transactionTest!.run({ fail: false });
        const committedRow = await handlers.clientDb[tableName]!.findOne!({
          body: "function-commit",
        });
        assert.equal(committedRow!.created_by, "user-guest");
        assert.deepEqual(functionRow, committedRow);
        await assert.rejects(
          () => handlers.clientMethods.transactionTest!.run({ fail: true }) as any,
        );
        assert.equal(await handlers.clientDb[tableName]!.count!({ body: "function-rollback" }), 0);
        sockets.forEach((socket) => socket.disconnect());
        io.disconnectSockets(true);
        await instance.update({ publish: originalPublish });
        await instance.update({
          publish: [{ name: "EmptyDBSchema", userTypes: ["empty"], publish: null }],
        });
        assert(
          (await instance.getTSSchema()).tsSchema.includes(
            "export type EmptyDBSchema = Record<string, never>;",
          ),
        );
        await instance.update({ publish: originalPublish });
        for (const [publish, error] of [
          [[{ userTypes: [], publish: null }], /userTypes must not be empty/],
          [
            [
              { userTypes: ["guest"], publish: null },
              { userTypes: ["guest"], publish: null },
            ],
            /Duplicate publish user type/,
          ],
          [
            [{ name: "ClientDBSchema", userTypes: ["guest"], publish: null }],
            /Invalid client schema name/,
          ],
          [
            [{ name: "ClientSchemas", userTypes: ["guest"], publish: null }],
            /Invalid client schema name/,
          ],
          [
            [
              { name: "SameSchema", userTypes: ["a"], publish: null },
              { name: "SameSchema", userTypes: ["b"], publish: null },
            ],
            /Duplicate publish schema name/,
          ],
        ] as const) {
          // await instance.update({ publish: publish });
          // await assert.rejects((handlers.clientDb as DBHandlerServer)[tableName]!.find!(), error);
          // await instance.update({ publish: originalPublish });
          await assert.rejects(instance.update({ publish }), error);
          assert.equal((await instance.getTSSchema()).tsSchema, tsSchema);
        }
        await instance.update({
          publish: [{ userTypes: ["guest"], publish: { [tableName]: { select: "*" } } }],
        });
        const updatedSchema = (await instance.getTSSchema()).tsSchema;
        assert(updatedSchema.includes("export type Publish1Schema"));
        assert(!updatedSchema.includes("GuestDBSchema"));
        assert.equal(
          readFileSync(path.join(generatedTypesDir, `${DB_GENERATED_NAMES.SCHEMA}.ts`), "utf8"),
          updatedSchema,
        );
        await instance.update({ publish: originalPublish });
        assert.equal((await instance.getTSSchema()).tsSchema, tsSchema);
      } finally {
        sockets.forEach((socket) => socket.disconnect());
        await instance?.destroy();
        await new Promise<void>((resolve) => io.close(() => resolve()));
        await db.none(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      }
    },
  );
};

const checkTypes = (schema: string, checks: string) => {
  const filename = path.resolve(__dirname, "../../../client/client-schema-typecheck.ts");
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
  };
  const host = ts.createCompilerHost(options);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const getSourceFile = host.getSourceFile;
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) =>
    name === filename ?
      ts.createSourceFile(name, schema + checks, languageVersion, true)
    : getSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
};

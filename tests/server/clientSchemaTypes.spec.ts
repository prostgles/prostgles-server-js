import express from "express";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import prostgles, {
  DB_GENERATED_NAMES,
  defineFunction,
  getLocalStorageClient,
  type ProstglesInitOptions,
  type Join,
  type PublishContextValue,
  type PublishedResult,
} from "prostgles-server";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import type { ViewHandler } from "prostgles-server/dist/DboBuilder/ViewHandler/ViewHandler";
import type { DB } from "prostgles-server/dist/Prostgles";
import {
  CHANNELS,
  getActionFunctions,
  ROW_ACTIONS_COLUMN,
  type AnyObject,
  type ClientSchema,
  type ClientServerFunctionSchema,
} from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";
import type prostglesClient from "../client/node_modules/prostgles-client";
import { checkGeneratedTypes } from "./checkGeneratedTypes";
import { FILE_TABLE_COLUMN_DEFINITIONS } from "prostgles-server/dist/StorageClient/fileTableDefinitions";

export const testClientSchemaTypes = async (db: DB) => {
  await test(
    "client publish profiles compile at startup and follow user types",
    { timeout: 30000 },
    async (t) => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.cookies = Object.fromEntries(
          (req.headers.cookie?.split(";") ?? []).map((cookie) => cookie.trim().split("=")),
        );
        next();
      });
      const http = createServer(app);
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
      const unconstrainedFileColumns = Object.fromEntries(
        Object.keys(FILE_TABLE_COLUMN_DEFINITIONS).map((column) => [column, {}]),
      );
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
        const serverUsers = new Map([
          ["user-guest", { id: "user-guest", type: "guest" }],
          ["user-admin", { id: "user-admin", type: "admin" }],
        ]);
        let networkAuthCalls = 0;
        let lookupCalls = 0;
        let functionAccessChecks = 0;
        instance = await prostgles({
          dbConnection: {
            ...getConnectionDetails(db),
            options: `-c search_path=${schemaName}`,
          } as unknown as ProstglesInitOptions["dbConnection"],
          tsGeneratedTypesDir: generatedTypesDir,
          transactions: true,
          schemaFilter: { [schemaName]: 1 },
          tableConfig: {
            [fileTableName]: {
              columns: { caption: "TEXT", error: "TEXT" },
              check: {
                $or: [
                  { ...unconstrainedFileColumns, caption: null },
                  { ...unconstrainedFileColumns, caption: { $ne: null }, error: { $ne: null } },
                ],
              },
            },
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
          restApi: { expressApp: app, path: "/api" },
          publishRawSQL: ({ user }) => user?.type === "admin",
          modifyClientFunctionSchema: (functionSchema, userData) => {
            assert.equal("run" in functionSchema, false);
            assert.equal(userData?.user?.id, "user-guest");
            return Promise.resolve({
              ...functionSchema,
              rendering: { label: functionSchema.name, result: "json" },
              clientSchemaUserId: userData.user.id,
            });
          },
          auth: {
            sidKeyName: "token",
            onUseOrSocketConnected: (_sid, _client, reqInfo) => {
              networkAuthCalls++;
              assert(reqInfo.socket ? reqInfo.socket.handshake : reqInfo.httpReq.headers);
            },
            getUser: (sid, _dbo, _db, _client, reqInfo) => {
              networkAuthCalls++;
              assert(reqInfo.socket ? reqInfo.socket.handshake : reqInfo.httpReq.headers);
              if (!sid) return undefined;
              return {
                user: { id: `user-${sid}`, type: sid },
                clientUser: { id: sid, type: sid },
              };
            },
            findUser: (filter) => {
              if ("$and" in filter) functionAccessChecks++;
              return (
                "id" in filter && typeof filter.id === "string" ? serverUsers.get(filter.id)
                : (
                  "$and" in filter &&
                  filter.$and?.every((condition: AnyObject) => condition.id === "user-guest")
                ) ?
                  { id: "user-guest", type: "guest" }
                : undefined
              );
            },
          },
          functions: {
            guest: {
              userFilter: { id: "user-guest" },
              functions: {
                lookupTest: defineFunction({
                  input: {
                    row: {
                      type: "RowLookup",
                      table: tableName,
                      optional: true,
                      filter: { body: { $ne: "lookup-filtered" } },
                    },
                    value: {
                      type: "ValueLookup",
                      table: tableName,
                      column: "id",
                      optional: true,
                      filter: { body: { $ne: "lookup-filtered" } },
                    },
                    rows: { type: "RowLookup[]", table: tableName, optional: true },
                    values: {
                      type: "ValueLookup[]",
                      table: tableName,
                      column: "id",
                      optional: true,
                    },
                    table: { type: "TableLookup", optional: true },
                    column: { type: "ColumnLookup", optional: true },
                    privateRow: { type: "RowLookup", table: privateTableName, optional: true },
                    privateValue: {
                      type: "ValueLookup",
                      table: privateTableName,
                      column: "id",
                      optional: true,
                    },
                  },
                  unrestrictedDbAccess: true,
                  run: () => ++lookupCalls,
                }),
                alwaysAction: defineFunction({
                  input: { row: { type: "RowLookup", table: tableName } },
                  run: () => undefined,
                }),
                valueAction: defineFunction({
                  input: {
                    id: {
                      type: "ValueLookup",
                      table: tableName,
                      column: "id",
                      filter: { body: "lookup-visible" },
                    },
                  },
                  run: () => undefined,
                }),
                arrayAction: defineFunction({
                  input: { rows: { type: "RowLookup[]", table: tableName } },
                  run: () => undefined,
                }),
                transactionTest: defineFunction({
                  description: "Insert a row in a client transaction",
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
                [fileTableName]: {
                  select: "*",
                  insert: "*",
                  update: { fields: { description: 0 } },
                },
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
                [fileTableName]: { select: "*", insert: "*", update: "*" },
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
        checkGeneratedTypes(
          tsSchema,
          `
        import type { TableHandler, InsertDataWithNested, ClientSchemaFor } from "prostgles-types";
        import type { DBHandlerClient } from "../../client/node_modules/prostgles-client";
        import type { DBHandlerServer, DBHandlerServerRestricted, DBOFullyTyped, DBOFullyTypedClient, InitResult, SessionUser } from "prostgles-server";
        import type { DBOFullyTyped as LegacyDBHandlerServer, DBOFullyTypedClient as LegacyDBHandlerServerRestricted } from "prostgles-server/dist/DBSchemaBuilder/DBSchemaBuilder";
        import type { RestrictedFunctionContext, UnrestrictedFunctionContext } from "prostgles-server/dist/PublishParser/defineServerFunction";
        import type { getClientHandlers } from "prostgles-server/dist/WebsocketAPI/getClientHandlers";
        type Name = "${tableName}";
        type FileName = "${fileTableName}";
        declare const guest: TableHandler<GuestDBSchema, Name>;
        declare const files: TableHandler<GuestDBSchema, FileName>;
        declare const adminFiles: TableHandler<AdminDBSchema, FileName>;
        declare const combinedFiles: TableHandler<ClientDBSchema, FileName>;
        declare const serverFiles: TableHandler<DBGeneratedSchema, FileName>;
        declare const admin: TableHandler<AdminDBSchema, Name>;
        declare const combined: TableHandler<ClientDBSchema, Name>;
        declare const server: TableHandler<${DB_GENERATED_NAMES.SCHEMA}, Name>;
        declare const viewer: TableHandler<ViewerDBSchema, Name>;
        declare const client: DBHandlerClient<ClientDBSchema>;
        declare const adminClient: DBHandlerClient<AdminDBSchema>;
        declare const restricted: RestrictedFunctionContext<GuestDBSchema>;
        declare const unrestricted: UnrestrictedFunctionContext<DBGeneratedSchema>;
        declare const serverClient: DBHandlerServerRestricted<ClientDBSchema>;
        declare const handlers: Awaited<ReturnType<typeof getClientHandlers<GuestDBSchema>>>;
        declare const instance: InitResult<DBGeneratedSchema, SessionUser, undefined, ClientDBSchema>;
        declare const guestClientSchema: ClientSchemaFor<ClientSchemas, "guest">;
        guestClientSchema satisfies GuestDBSchema;
        instance.db satisfies DBHandlerServer<DBGeneratedSchema>;
        instance.db satisfies DBOFullyTyped<DBGeneratedSchema>;
        instance.db satisfies LegacyDBHandlerServer<DBGeneratedSchema>;
        serverClient satisfies DBOFullyTypedClient<ClientDBSchema>;
        serverClient satisfies LegacyDBHandlerServerRestricted<ClientDBSchema>;
        async () => {
          const combinedHandlers = await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
          const guestHandlers = await instance.getClientDBHandlers<GuestDBSchema>({ userId: "user-guest" }, undefined);
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
          await server.insert({ body: "hello", created_by: "admin" });
          await server.insert({ body: "hello", created_by: "admin", synced: 1 });
          const serverInput: DBSchemaForInsert[Name] = { body: "hello", created_by: "admin" };
          await server.insert(serverInput);
          // @ts-expect-error Other required server insert columns remain required.
          await server.insert({ body: "hello" });
          // @ts-expect-error The sync timestamp retains its numeric type.
          await server.insert({ body: "hello", created_by: "admin", synced: false });
          const serverRow = await server.findOne({}, { select: "*" });
          if (serverRow) serverRow.synced satisfies string;
          await files.insert({ original_name: "hello.txt", data: new Uint8Array() });
          await files.insert({ original_name: "hello.txt", data: new Uint8Array(), description: "File description" });
          await adminFiles.update({ id: "file-id" }, { description: null });
          await combinedFiles.update({ id: "file-id" }, { description: "Allowed by admin" });
          const descriptionUpdate = { description: "Forbidden" };
          // @ts-expect-error Description updates are excluded by the guest profile.
          await files.update({}, descriptionUpdate);
          // @ts-expect-error Batch updates must respect the same permissions.
          await files.updateBatch([[{}, descriptionUpdate]]);
          await files.update({}, { caption: "custom metadata", error: "details" });
          const checkedFile = { original_name: "hello.txt", data: new Uint8Array(), caption: "custom metadata" };
          const validFile = { ...checkedFile, error: "details" };
          validFile satisfies DBSchemaForInsert[FileName];
          await files.insert(validFile);
          await serverFiles.insert(validFile);
          // @ts-expect-error The caption variant requires error details.
          checkedFile satisfies DBSchemaForInsert[FileName];
          // @ts-expect-error Server inserts must preserve file check variants.
          await serverFiles.insert(checkedFile);
          // @ts-expect-error Client inserts must preserve file check variants.
          await files.insert(checkedFile);
          // @ts-expect-error Combined profiles must preserve file check variants.
          await combinedFiles.insert(checkedFile);
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
        for (const synced of [undefined, 123]) {
          const row = await instance.db[tableName]!.insert!(
            { body: "server-sync-default", created_by: "admin", ...(synced && { synced }) },
            { returning: "*" },
          );
          assert(synced ? Number(row.synced) === synced : Number(row.synced) > 0);
          await instance.db[tableName]!.delete!({ id: row.id });
        }
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
            query: { ...(role ? { token: role } : {}), userId: "user-admin" },
            auth: { userId: "user-admin" },
            extraHeaders: { userId: "user-admin", cookie: "userId=user-admin" },
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
        for (const [profile, canUpdateDescription] of [
          [guestSchema, false],
          [profiles.AdminDBSchema!, true],
        ] as const) {
          const fileTable = profile.tableSchema.find((table) => table.name === fileTableName);
          assert(fileTable);
          assert.equal(
            fileTable.columns.find((column) => column.name === "description")?.update,
            canUpdateDescription,
          );
          assert.equal(fileTable.columns.find((column) => column.name === "caption")?.update, true);
        }
        assert.deepEqual(profiles.MemberDBSchema!.tableSchema, guestSchema.tableSchema);
        assert.deepEqual(profiles.UnknownDBSchema!.tableSchema, []);
        assert.deepEqual(profiles.AnonymousDBSchema!.tableSchema, []);
        assert.deepEqual(profiles.AdminDBSchema!.methods, []);
        assert.deepEqual(profiles.AnonymousDBSchema!.methods, []);
        const serverSocket = io.sockets.sockets.get(sockets[0]!.id!);
        assert(serverSocket);
        const handlers = await instance.getClientDBHandlers({ socket: serverSocket }, undefined);
        await t.test("file writes enforce generated variants and column permissions", async () => {
          assert(instance);
          const files = handlers.clientDb[fileTableName]!;
          const input = { original_name: "checked.txt", data: Buffer.from("checked file") };
          const file = await files.insert!(
            { ...input, description: "Keep this description" },
            { returning: "*" },
          );
          try {
            await assert.rejects(files.update!({ id: file.id }, { description: "Forbidden" }));
            await assert.rejects(files.insert!({ ...input, caption: "Missing error details" }));
            await files.update!({ id: file.id }, { caption: "custom metadata", error: "details" });
            const updated = await files.findOne!({ id: file.id });
            assert(updated);
            assert.equal(updated.description, file.description);
            assert.equal(updated.caption, "custom metadata");
          } finally {
            await instance.db[fileTableName]!.delete!({ id: file.id });
          }
        });
        assert.equal(privateTableName in handlers.clientDb, false);
        assert.equal("delete" in handlers.clientDb[tableName]!, false);
        assert.equal(typeof handlers.clientDb[tableName]!.upsert, "function");
        assert.equal(typeof handlers.clientDb[tableName]!.insertMany, "function");
        assert.equal("updateBatch" in handlers.clientDb[tableName]!, false);
        await t.test(
          "function and join schema metadata survives socket, REST and server-user handlers",
          async () => {
            assert(instance);
            // Publish a parameterized self-join to compare metadata across client transports.
            const originalTableConfig = instance.options.tableConfig;
            const namedJoin = {
              tables: [tableName, tableName],
              on: [
                {
                  $joinName: "nearby",
                  $params: { distance: "number" as const },
                  $sql: ({ left, right, params, asValue }) =>
                    `abs(${left("id")} - ${right("id")}) <= ${asValue(params.distance)}`,
                },
              ],
            } satisfies Join;
            await instance.update({
              tableConfig: {
                ...originalTableConfig,
                [tableName]: { ...originalTableConfig?.[tableName], getJoins: () => [namedJoin] },
              },
            });
            const expectedJoin = {
              tables: [tableName, tableName],
              on: "nearby",
              paramsSchema: { distance: "number" },
              supportsMultiHop: true,
            };
            const expectedMetadata = {
              rendering: { label: "transactionTest", result: "json" },
              clientSchemaUserId: "user-guest",
            };
            const expectedSchema = {
              name: "transactionTest",
              input: { fail: "boolean" },
              description: "Insert a row in a client transaction",
              ...expectedMetadata,
            } satisfies ClientServerFunctionSchema<typeof expectedMetadata>;
            assert.deepEqual(
              guestSchema.methods.find(({ name }) => name === "transactionTest"),
              expectedSchema,
            );
            assert.deepEqual(
              handlers.clientMethods.transactionTest!.rendering,
              expectedMetadata.rendering,
            );
            const serverUser = await instance.getClientDBHandlers(
              { userId: "user-guest" },
              undefined,
            );
            assert.deepEqual(
              serverUser.clientMethods.transactionTest!.rendering,
              expectedMetadata.rendering,
            );
            assert.equal(
              serverUser.clientMethods.transactionTest!.clientSchemaUserId,
              "user-guest",
            );
            const response = await fetch(`http://127.0.0.1:${address.port}/api/schema`, {
              method: "POST",
              headers: { cookie: "token=guest" },
            });
            assert.equal(response.status, 200);
            const restSchema = (await response.json()) as ClientSchema;
            assert.deepEqual(restSchema.methods, guestSchema.methods);
            // REST and server-user schemas must expose the configured join.
            assert(restSchema.joins.some((join) => join.on === "nearby"));
            assert.deepEqual(
              serverUser.clientSchema.joins.find((join) => join.on === "nearby"),
              expectedJoin,
            );

            const connectClient = createRequire(path.resolve("../client/package.json"))(
              "prostgles-client",
            ).default as typeof prostglesClient;
            const client = await connectClient({
              endpoint: `http://127.0.0.1:${address.port}`,
              socketOptions: {
                path: "/socket.io",
                transports: ["websocket"],
                reconnection: false,
                query: { token: "guest" },
              },
            });
            const { socket } = client;
            const originalHook = instance.options.modifyClientFunctionSchema;
            const nextSchema = () =>
              new Promise<ClientSchema>((resolve) => {
                socket.once(CHANNELS.SCHEMA, resolve);
              });
            try {
              assert(client.methodSchema && client.methods);
              // The socket client must expose join metadata and accept parameterized join queries.
              assert.deepEqual(
                client.joins?.find((join) => join.on === "nearby"),
                expectedJoin,
              );
              assert.deepEqual(
                await client.db[tableName]!.find!(
                  {},
                  {
                    select: {
                      related: {
                        $leftJoin: [{ table: tableName, on: "nearby", params: { distance: 0 } }],
                        select: { id: 1 },
                      },
                    },
                    limit: 0,
                  },
                ),
                [],
              );
              assert.deepEqual(
                client.methodSchema.transactionTest!.rendering,
                expectedMetadata.rendering,
              );
              assert.equal(client.methodSchema.transactionTest!.clientSchemaUserId, "user-guest");
              assert.deepEqual(client.methodSchema.transactionTest!.input, expectedSchema.input);
              const callsBeforeRun = lookupCalls;
              assert.equal(await client.methodSchema.lookupTest!.run({}), callsBeforeRun + 1);
              assert.equal(await client.methods.lookupTest!({}), callsBeforeRun + 2);
              // Updating join params must push the new schema to an already connected client.
              const updatedSchema = nextSchema();
              await instance.update({
                tableConfig: {
                  ...originalTableConfig,
                  [tableName]: {
                    ...originalTableConfig?.[tableName],
                    getJoins: () => [
                      {
                        ...namedJoin,
                        on: [
                          {
                            ...namedJoin.on[0]!,
                            $params: {
                              distance: "number",
                              includeSelf: { type: "boolean", optional: true },
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
                modifyClientFunctionSchema: (functionSchema) => ({
                  ...functionSchema,
                  rendering: { label: "Updated" },
                }),
              });
              const schema = await updatedSchema;
              assert.deepEqual(
                schema.joins.find((join) => join.on === "nearby"),
                {
                  ...expectedJoin,
                  paramsSchema: {
                    distance: "number",
                    includeSelf: { type: "boolean", optional: true },
                  },
                },
              );
              assert.deepEqual(
                schema.methods.find(({ name }) => name === "transactionTest")!.rendering,
                { label: "Updated" },
              );
              const unmodifiedSchema = nextSchema();
              await instance.update({ modifyClientFunctionSchema: undefined });
              const rawSchema = await unmodifiedSchema;
              assert.deepEqual(
                rawSchema.methods.find(({ name }) => name === "transactionTest"),
                {
                  name: expectedSchema.name,
                  input: expectedSchema.input,
                  description: expectedSchema.description,
                },
              );
            } finally {
              socket.disconnect();
              await instance.update({
                modifyClientFunctionSchema: originalHook,
                tableConfig: originalTableConfig,
              });
            }
          },
        );
        await t.test(
          "forUpdate requires a transaction and preserves client select permissions",
          async () => {
            assert(instance);
            const rows = await instance.db[tableName]!.insertMany!(
              [
                { body: "lock-visible", created_by: "user-guest" },
                { body: "lock-hidden", created_by: "other" },
              ],
              { returning: "*" },
            );
            const [visible, hidden] = rows;
            assert(visible && hidden);
            const filter = { id: { $in: rows.map((row) => row.id) } };
            const lockRow = (id: number) =>
              db.any(`SELECT id FROM ${schemaName}.${tableName} WHERE id = $1 FOR UPDATE NOWAIT`, [
                id,
              ]);
            try {
              for (const command of ["find", "findOne"] as const) {
                await assert.rejects(
                  handlers.clientDb[tableName]![command]!(filter, { forUpdate: true }),
                  (error: unknown) =>
                    JSON.stringify(error).includes("forUpdate requires a transaction"),
                );
                await handlers.withClientDbTx(async (clientDb) => {
                  const result = await clientDb[tableName]![command]!(filter, {
                    select: { id: 1 },
                    forUpdate: true,
                  });
                  assert.deepEqual(
                    result,
                    command === "find" ? [{ id: visible.id }] : { id: visible.id },
                  );
                  await assert.rejects(lockRow(visible.id), { code: "55P03" });
                  await lockRow(hidden.id);
                  assert.equal(
                    await clientDb[tableName]!.findOne!({ id: hidden.id }, { forUpdate: true }),
                    undefined,
                  );
                });
                await lockRow(visible.id);
              }
              const scoped = await instance.getClientDBHandlers(
                { socket: serverSocket },
                { tables: { [tableName]: { select: { fields: ["id"] } } } },
              );
              await assert.rejects(
                scoped.withClientDbTx((clientDb) =>
                  clientDb[tableName]!.findOne!(
                    { id: visible.id },
                    { select: { internal: 1 }, forUpdate: true },
                  ),
                ),
              );
            } finally {
              await instance.db[tableName]!.delete!(filter);
            }
          },
        );
        await t.test(
          "function lookups enforce caller permissions before unrestricted execution",
          async () => {
            assert(instance);
            const rows = await instance.db[tableName]!.insertMany!(
              [
                { body: "lookup-visible", created_by: "user-guest" },
                { body: "lookup-hidden", created_by: "other" },
                { body: "lookup-filtered", created_by: "user-guest" },
              ],
              { returning: "*" },
            );
            const [visible, hidden, filtered] = rows;
            assert(visible && hidden && filtered);
            const privateRow = await instance.db[privateTableName]!.insert!({}, { returning: "*" });
            try {
              const guest = await instance.getClientDBHandlers({ userId: "user-guest" }, undefined);
              for (const client of [handlers, guest]) {
                const actions = getActionFunctions(client.clientMethods, table);
                assert.deepEqual(
                  actions.map(({ methodName, argName }) => [methodName, argName]),
                  [
                    ["alwaysAction", "row"],
                    ["lookupTest", "row"],
                    ["lookupTest", "value"],
                    ["valueAction", "id"],
                  ],
                );
                assert.deepEqual(
                  actions.find(
                    ({ methodName, argName }) => methodName === "lookupTest" && argName === "row",
                  )!.lookup.filter,
                  { body: { $ne: "lookup-filtered" } },
                );
                assert.deepEqual(
                  getActionFunctions(client.clientMethods, {
                    ...table,
                    columns: table.columns.map((column) => ({ ...column, select: false })),
                  }).map(({ methodName, argName }) => [methodName, argName]),
                  [
                    ["alwaysAction", "row"],
                    ["lookupTest", "row"],
                  ],
                );
                const run = async (input: AnyObject) =>
                  await client.clientMethods.lookupTest!.run(input);
                const checksBeforeSelect = functionAccessChecks;
                for (const select of ["*" as const, ["id"], { body: 0 as const }]) {
                  await client.clientDb[tableName]!.findOne!({ id: visible.id }, { select });
                }
                assert.equal(functionAccessChecks, checksBeforeSelect);
                const select = { id: 1, [ROW_ACTIONS_COLUMN]: 1 } as const;
                assert.deepEqual(
                  await client.clientDb[tableName]!.find!(
                    { id: { $in: rows.map(({ id }) => id) } },
                    { select, orderBy: { id: 1 } },
                  ),
                  [
                    {
                      id: visible.id,
                      [ROW_ACTIONS_COLUMN]: ["lookupTest", "alwaysAction", "valueAction"],
                    },
                    { id: filtered.id, [ROW_ACTIONS_COLUMN]: ["alwaysAction"] },
                  ],
                );
                assert.deepEqual(
                  await client.clientDb[tableName]!.findOne!(
                    { id: visible.id },
                    { select: [ROW_ACTIONS_COLUMN] },
                  ),
                  {
                    [ROW_ACTIONS_COLUMN]: ["lookupTest", "alwaysAction", "valueAction"],
                  },
                );
                const before = lookupCalls;
                assert.equal(
                  await run({
                    row: { id: visible.id },
                    value: visible.id,
                    rows: [{ id: visible.id }],
                    values: [visible.id],
                    table: tableName,
                    column: { table: tableName, column: "id" },
                  }),
                  before + 1,
                );
                for (const input of [
                  { row: { id: hidden.id } },
                  { value: hidden.id },
                  { rows: [{ id: visible.id }, { id: hidden.id }] },
                  { values: [visible.id, hidden.id] },
                  { row: { id: filtered.id } },
                  { value: filtered.id },
                  { table: privateTableName },
                  { column: { table: privateTableName, column: "id" } },
                  { privateRow: { id: privateRow.id } },
                  { privateValue: privateRow.id },
                ]) {
                  await assert.rejects(() => run(input));
                  assert.equal(
                    lookupCalls,
                    before + 1,
                    "Rejected lookups must not execute the function",
                  );
                }
              }
              const scoped = await instance.getClientDBHandlers(
                { userId: "user-guest" },
                {
                  tables: { [tableName]: { select: true } },
                  methods: { alwaysAction: true },
                },
              );
              assert.deepEqual(
                await scoped.clientDb[tableName]!.findOne!(
                  { id: visible.id },
                  { select: { [ROW_ACTIONS_COLUMN]: 1 } },
                ),
                {
                  [ROW_ACTIONS_COLUMN]: ["alwaysAction"],
                },
              );
              assert.deepEqual(
                await instance.db[tableName]!.findOne!(
                  { id: visible.id },
                  { select: { [ROW_ACTIONS_COLUMN]: 1 } },
                ),
                {
                  [ROW_ACTIONS_COLUMN]: [],
                },
              );
            } finally {
              await instance.db[tableName]!.delete!({ id: { $in: rows.map(({ id }) => id) } });
              await instance.db[privateTableName]!.delete!({ id: privateRow.id });
            }
          },
        );
        await t.test(
          "server user handlers enforce permissions and reject client impersonation",
          async () => {
            assert(instance);
            assert(networkAuthCalls > 0);
            const networkAuthCallsBefore = networkAuthCalls;
            const admin = await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
            assert.equal(typeof admin.clientDb[privateTableName]!.find, "function");
            assert.deepEqual(await admin.clientDb[privateTableName]!.find!(), []);
            assert.equal(await admin.clientSql("SELECT 1", [], { returnType: "value" }), 1);
            const guest = await instance.getClientDBHandlers({ userId: "user-guest" }, undefined);
            assert.equal(privateTableName in guest.clientDb, false);
            const row = await guest.withClientDbTx((tx) =>
              tx[tableName]!.insert!({ body: "server-user" }, { returning: "*" }),
            );
            assert.equal(row.created_by, "user-guest");
            assert.equal(await guest.clientDb[tableName]!.count!({ id: row.id }), 1);
            await assert.rejects(guest.clientSql("SELECT 1"));
            await assert.rejects(() => guest.clientMethods.transactionTest!.run({ fail: true }));
            assert.equal(await guest.clientDb[tableName]!.count!({ body: "function-rollback" }), 0);
            const scoped = await instance.getClientDBHandlers(
              { userId: "user-admin" },
              { tables: { [tableName]: { select: { forcedFilter: { id: row.id } } } } },
            );
            assert.deepEqual(Object.keys(scoped.clientDb), [tableName]);
            assert.equal("insert" in scoped.clientDb[tableName]!, false);
            assert.equal(await scoped.withClientDbTx((tx) => tx[tableName]!.count!()), 1);
            assert.throws(() => scoped.clientSql("SELECT 1"), /PermissionScope/);
            assert.equal(networkAuthCalls, networkAuthCallsBefore);

            for (const userId of ["missing", "", undefined, 1, { $ne: null }]) {
              await assert.rejects(async () =>
                instance!.getClientDBHandlers({ userId: userId as string }, undefined),
              );
            }
            await assert.rejects(
              async () =>
                instance!.getClientDBHandlers(
                  // @ts-expect-error Explicit identity cannot be combined with a network request.
                  { userId: "user-admin", socket: serverSocket },
                  undefined,
                ),
              /userId cannot be combined/,
            );

            const socketError = await new Promise((resolve) => {
              sockets[0]!.emit(
                CHANNELS.DEFAULT,
                {
                  tableName: privateTableName,
                  command: "find",
                  userId: "user-admin",
                  clientReq: { userId: "user-admin" },
                },
                (error: unknown) => resolve(error),
              );
            });
            assert(socketError);
            for (const token of ["guest", undefined]) {
              const headers = {
                "content-type": "application/json",
                userId: "user-admin",
                cookie: "userId=user-admin",
                ...(token ?
                  { authorization: `Bearer ${Buffer.from(token).toString("base64")}` }
                : {}),
              };
              const response = await fetch(
                `http://127.0.0.1:${address.port}/api/schema?userId=user-admin`,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    userId: "user-admin",
                    clientReq: { userId: "user-admin" },
                  }),
                },
              );
              const schema = (await response.json()) as ClientSchema;
              assert.equal(response.status, 200, JSON.stringify(schema));
              assert.equal(schema.rawSQL, false);
              assert.equal(
                schema.tableSchema.some((table) => table.name === privateTableName),
                false,
              );
              const denied = await fetch(
                `http://127.0.0.1:${address.port}/api/db/${privateTableName}/find?userId=user-admin`,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify([{}, {}, { userId: "user-admin" }]),
                },
              );
              assert.equal(denied.status, 400);
            }

            serverUsers.set("user-admin", { id: "user-admin", type: "guest" });
            await assert.rejects(admin.clientDb[privateTableName]!.find!());
            await assert.rejects(admin.clientSql("SELECT 1"));
            assert.equal(await admin.clientDb[tableName]!.count!({ id: row.id }), 0);
            serverUsers.delete("user-admin");
            await assert.rejects(admin.clientDb[tableName]!.find!(), /User not found/);
            serverUsers.set("user-admin", { id: "wrong-id", type: "admin" });
            await assert.rejects(
              instance.getClientDBHandlers({ userId: "user-admin" }, undefined),
              /User not found/,
            );
            serverUsers.set("user-admin", { id: "user-admin", type: "admin" });
            await instance.db[tableName]!.delete!({ id: row.id });
          },
        );
        await t.test("a rejected guest abort cannot cancel a later server-user query", async () => {
          assert(instance);
          const admin = await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
          const abortSignalId = randomUUID();
          // The third wire argument supplies the cancellation ID used by the query handler.
          const findWithAbort = admin.clientDb[tableName]!.find! as ViewHandler["find"];
          const find = () => findWithAbort({}, {}, { abortSignalId });
          await find();

          // No query is active. This guest must not reserve the ID for another caller.
          const guestSocket = sockets[0]!;
          const abortError = await new Promise((resolve) => {
            guestSocket.emit(
              CHANNELS.DEFAULT,
              {
                tableName,
                command: "abort",
                param1: { command: "find", abortSignalId },
              },
              (error: unknown) => resolve(error),
            );
          });
          assert(abortError, "Aborting a nonexistent query must be rejected");
          await assert.doesNotReject(
            find,
            "A rejected guest abort must not leave a pending cancellation for the admin",
          );
        });
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
        await t.test("client handlers bind to an existing server transaction", async () => {
          assert(instance);
          assert.throws(
            () => handlers.getClientDbForTransaction(instance!.db),
            /Expected active transaction handlers/,
          );
          let boundClientDb: typeof handlers.clientDb | undefined;
          await instance.db.tx(async (dbx, transaction) => {
            await transaction.none("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
            boundClientDb = handlers.getClientDbForTransaction(dbx);
            assert.equal(privateTableName in boundClientDb, false);
            const row = await boundClientDb[tableName]!.insert!(
              { body: "bound-transaction", created_by: "other" },
              { returning: "*" },
            );
            assert.equal(row.created_by, "user-guest");
            assert.equal(await dbx[tableName]!.count!({ id: row.id }), 1);
            assert.equal(await handlers.clientDb[tableName]!.count!({ id: row.id }), 0);
            await instance!.db[tableName]!.update!(
              { id: transactionRow!.id },
              { body: "outside-snapshot" },
            );
            assert.equal(
              (await boundClientDb[tableName]!.findOne!({ id: transactionRow!.id }))!.body,
              "committed",
            );
          });
          assert(boundClientDb);
          await assert.rejects(
            boundClientDb[tableName]!.find!(),
            /Expected active transaction handlers/,
          );
          await instance.db[tableName]!.update!({ id: transactionRow!.id }, { body: "committed" });
          await assert.rejects(
            instance.db.tx(async (dbx) => {
              const clientDb = handlers.getClientDbForTransaction(dbx);
              await clientDb[tableName]!.insert!({ body: "bound-rollback" });
              await assert.rejects(clientDb[tableName]!.update!({}, { internal: "forbidden" }));
            }),
          );
          assert.equal(await handlers.clientDb[tableName]!.count!({ body: "bound-rollback" }), 0);
        });
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
        await instance.db.tx(async (dbx) => {
          const scopedDb = scopedHandlers.getClientDbForTransaction(dbx);
          assert.equal(await scopedDb[tableName]!.count!(), 1);
          assert.equal("insert" in scopedDb[tableName]!, false);
          assert.equal(privateTableName in scopedDb, false);
        });
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
        await assert.rejects(() => handlers.clientMethods.transactionTest!.run({ fail: true }));
        assert.equal(await handlers.clientDb[tableName]!.count!({ body: "function-rollback" }), 0);
        sockets.forEach((socket) => socket.disconnect());
        io.disconnectSockets(true);
        await instance.update({ publish: originalPublish });
        await t.test("tableConfig publish only restricts client access", async () => {
          assert(instance);
          const originalTableConfig = instance.options.tableConfig;
          const tableConfig = {
            ...originalTableConfig,
            [tableName]: {
              ...originalTableConfig?.[tableName],
              publish: { insert: false, update: false, delete: false },
            },
            [privateTableName]: {
              publish: { select: false, insert: false, update: false, delete: false },
            },
          } satisfies NonNullable<ProstglesInitOptions["tableConfig"]>;
          const savedInsert = handlers.clientDb[tableName]!.insert!;
          try {
            for (const publish of [
              "*",
              ["*", { select: true, insert: true, update: true, delete: true }],
              { [tableName]: "*" },
              { [tableName]: true },
              {
                [tableName]: {
                  select: { fields: ["body"], forcedFilter: { body: "restricted-row" } },
                  insert: false,
                  update: false,
                  delete: false,
                },
              },
              null,
            ] satisfies PublishedResult[]) {
              await instance.update({
                tableConfig,
                publish: [{ name: "RestrictedSchema", userTypes: ["admin"], publish }],
              });
              const restricted: Awaited<ReturnType<typeof instance.getClientDBHandlers>> =
                await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
              assert.equal(restricted.clientDb[privateTableName], undefined);
              const table = restricted.clientDb[tableName];
              if (!publish) {
                assert.equal(table, undefined);
                continue;
              }
              assert(table?.find);
              for (const command of ["insert", "update", "delete", "upsert"] as const) {
                assert.equal(table[command], undefined);
              }
              const row = await instance.db[tableName]!.insert!(
                { body: "restricted-row", created_by: "admin" },
                { returning: "*" },
              );
              await instance.db[tableName]!.update!({ id: row.id }, { note: "server write" });
              if (
                typeof publish === "object" &&
                !Array.isArray(publish) &&
                typeof publish[tableName] === "object"
              ) {
                assert.deepEqual(await table.find(), [{ body: "restricted-row" }]);
              }
              await instance.db[tableName]!.delete!({ id: row.id });
            }
            const wildcardPublish = [
              "*",
              { select: true, insert: true, update: true, delete: true },
            ] satisfies PublishedResult;
            for (const publish of [wildcardPublish, () => wildcardPublish]) {
              await instance.update({ publish });
              const restricted: Awaited<ReturnType<typeof instance.getClientDBHandlers>> =
                await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
              assert.equal(restricted.clientSchema.err, undefined);
              assert(restricted.clientDb[tableName]!.find);
              assert.equal(restricted.clientDb[tableName]!.insert, undefined);
              assert.equal(restricted.clientDb[privateTableName], undefined);
            }
            await instance.update({
              publish: [{ name: "AdminDBSchema", userTypes: ["admin"], publish: "*" }],
            });
            await assert.rejects(savedInsert({ body: "forbidden" }));
            checkGeneratedTypes(
              (await instance.getTSSchema()).tsSchema,
              `
              import type { TableHandler } from "prostgles-types";
              declare const table: TableHandler<AdminDBSchema, "${tableName}">;
              table.find();
              // @ts-expect-error tableConfig disables client inserts
              table.insert({});
              // @ts-expect-error tableConfig disables client updates
              table.update({}, {});
              // @ts-expect-error tableConfig cannot publish a denied table
              type Hidden = AdminDBSchema["${privateTableName}"];
              `,
            );
            for (const command of ["select", "insert", "update", "delete"] as const) {
              for (const rule of [true, "*"] as const) {
                await assert.rejects(
                  instance.update({
                    tableConfig: {
                      ...tableConfig,
                      [tableName]: {
                        ...originalTableConfig?.[tableName],
                        publish: { [command]: false },
                      },
                    },
                    publish: [
                      {
                        name: "ConflictingSchema",
                        userTypes: ["admin"],
                        publish: { [tableName]: { [command]: rule } },
                      },
                    ],
                  }),
                  (error: unknown) =>
                    String(error).endsWith(
                      `publish.${tableName}.${command} is disabled by tableConfig.${tableName}.publish`,
                    ),
                );
              }
            }
            await instance.update({
              tableConfig,
              publish: () => ({ [tableName]: { insert: "*" } }),
            });
            await assert.rejects(savedInsert({ body: "forbidden" }), {
              message: `publish.${tableName}.insert is disabled by tableConfig.${tableName}.publish`,
            });
            await assert.rejects(
              instance.update({
                tableConfig: {
                  ...tableConfig,
                  [tableName]: { ...originalTableConfig?.[tableName], publish: { select: false } },
                },
                publish: [
                  {
                    name: "WriterSchema",
                    userTypes: ["admin"],
                    publish: {
                      [tableName]: {
                        select: { fields: ["body"] },
                        update: { fields: ["note", "synced"] },
                      },
                    },
                  },
                ],
              }),
              (error: unknown) =>
                String(error).endsWith(
                  `publish.${tableName}.select is disabled by tableConfig.${tableName}.publish`,
                ),
            );
            await instance.update({
              publish: [
                {
                  name: "WriterSchema",
                  userTypes: ["admin"],
                  publish: {
                    [tableName]: {
                      update: {
                        fields: ["note", "synced"],
                        filterFields: ["body"],
                        returningFields: ["body"],
                      },
                    },
                  },
                },
              ],
            });
            const writer = await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
            assert.equal(writer.clientDb[tableName]!.find, undefined);
            const writerRow = await instance.db[tableName]!.insert!(
              { body: "writer-row", created_by: "admin" },
              { returning: "*" },
            );
            assert.deepEqual(
              await writer.clientDb[tableName]!.update!(
                { body: "writer-row" },
                { note: "allowed" },
                { returning: "*" },
              ),
              [{ body: "writer-row" }],
            );
            await instance.db[tableName]!.delete!({ id: writerRow.id });
          } finally {
            await instance.update({ tableConfig: originalTableConfig, publish: originalPublish });
          }
        });
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
        await t.test(
          "wildcard profile generation stays consistent during schema rebuilds",
          async () => {
            assert(instance);
            const addedTableName = "rebuilding_table";
            const dboBuilder = (instance.db[tableName] as unknown as ViewHandler).dboBuilder;
            await instance.update({
              publish: [{ name: "RebuildingSchema", userTypes: ["admin"], publish: "*" }],
            });
            try {
              await db.none(`CREATE TABLE ${schemaName}.${addedTableName} (id SERIAL PRIMARY KEY)`);
              // Pause after rebuilding the handlers, before replacing the publish parser.
              await dboBuilder.build();
              const schemaDuringRebuild = (await instance.getTSSchema()).tsSchema;
              // Newly added tables stay hidden until handlers and publish rules are both rebuilt.
              assert(!schemaDuringRebuild.includes(`"${addedTableName}"`));
              await dboBuilder.prostgles.rebuildDBO();
              const clientTableDefinition = `"${addedTableName}": ${DB_GENERATED_NAMES.SCHEMA}["${addedTableName}"] & {`;
              assert((await instance.getTSSchema()).tsSchema.includes(clientTableDefinition));
              // Removed tables stay in the published snapshot until the rebuild completes too.
              await db.none(`DROP TABLE ${schemaName}.${addedTableName}`);
              await dboBuilder.build();
              assert((await instance.getTSSchema()).tsSchema.includes(clientTableDefinition));
              await dboBuilder.prostgles.rebuildDBO();
              assert(!(await instance.getTSSchema()).tsSchema.includes(`"${addedTableName}"`));
            } finally {
              await db.none(`DROP TABLE IF EXISTS ${schemaName}.${addedTableName}`);
              await dboBuilder.prostgles.rebuildDBO();
              await instance.update({ publish: originalPublish });
            }
          },
        );
        await t.test(
          "schema updates apply table config before validating publish profiles",
          async () => {
            assert(instance);
            const addedTableName = "added_table";
            await instance.update({
              tableConfig: {
                ...instance.options.tableConfig,
                [addedTableName]: { columns: { id: "serial PRIMARY KEY", value: "text" } },
              },
              publish: [
                {
                  name: "AddedTableSchema",
                  userTypes: ["admin"],
                  publish: { [addedTableName]: { select: { fields: ["id", "value"] } } },
                },
              ],
            });
            assert(
              (await instance.getTSSchema()).tsSchema.includes("export type AddedTableSchema"),
            );
            const handlers = await instance.getClientDBHandlers(
              { userId: "user-admin" },
              undefined,
            );
            assert.deepEqual(await handlers.clientDb[addedTableName]!.find!(), []);
            await instance.update({ publish: originalPublish });
          },
        );
        await t.test("server user handlers require configured authentication", async () => {
          assert(instance);
          const handlers = await instance.getClientDBHandlers({ userId: "user-admin" }, undefined);
          await instance.update({ auth: undefined });
          await assert.rejects(handlers.clientDb[privateTableName]!.find!(), /auth.findUser/);
          await assert.rejects(
            instance.getClientDBHandlers({ userId: "user-admin" }, undefined),
            /auth.findUser/,
          );
        });
      } finally {
        sockets.forEach((socket) => socket.disconnect());
        await instance?.destroy();
        await new Promise<void>((resolve) => io.close(() => resolve()));
        await db.none(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
      }
    },
  );
};

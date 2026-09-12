import { DB_GENERATED_NAMES } from "prostgles-server/dist/DBSchemaBuilder/constants";
import { strict as assert } from "node:assert";
import { once } from "node:events";
import { createServer } from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import prostgles, { type DBHandlerServer, type ProstglesInitOptions } from "prostgles-server";
import type { DB } from "prostgles-server/dist/Prostgles";
import { getConnectionDetails } from "prostgles-server/dist/DboBuilder/runSql/getAdminClient";
import { CHANNELS, type ClientSchema } from "prostgles-types";
import { Server } from "socket.io";
import { io as createClient, type Socket } from "socket.io-client";
import ts from "typescript";

export const testClientSchemaTypes = async (db: DB) => {
  await test(
    "client publish profiles compile at startup and follow user types",
    { timeout: 30000 },
    async () => {
      const http = createServer();
      const io = new Server(http);
      const sockets: Socket[] = [];
      let instance: Awaited<ReturnType<typeof prostgles>> | undefined;
      try {
        await db.none(`
        CREATE SCHEMA client_schema_types;
        CREATE TABLE client_schema_types.correspondence (
          id SERIAL PRIMARY KEY,
          body TEXT NOT NULL,
          created_by TEXT NOT NULL,
          note TEXT,
          internal TEXT NOT NULL DEFAULT 'default',
          synced BIGINT NOT NULL
        );
        CREATE TABLE client_schema_types.private_table (id SERIAL PRIMARY KEY);
      `);
        http.listen(0, "127.0.0.1");
        await once(http, "listening");
        const address = http.address();
        assert(address && typeof address === "object");
        const tableName = "client_schema_types.correspondence";
        instance = await prostgles({
          dbConnection: getConnectionDetails(db) as unknown as ProstglesInitOptions["dbConnection"],
          tsGeneratedTypesDir: path.resolve("debug/client-schema-types"),
          schemaFilter: { client_schema_types: 1 },
          tableConfig: {
            [tableName]: {
              syncConfig: { id_fields: ["id"], synced_field: "synced" },
            },
          },
          io,
          auth: {
            sidKeyName: "token",
            getUser: async (sid) => {
              if (!sid) return undefined;
              return {
                user: { id: `user-${sid}`, type: sid },
                clientUser: { id: sid, type: sid },
              };
            },
            findUser: async () => undefined,
          },
          publish: [
            {
              name: "GuestDBSchema",
              userTypes: ["guest", "member"],
              publish: {
                [tableName]: {
                  select: "*",
                  update: {
                    fields: ["body", "note", "created_by", "synced"],
                    forcedData: { created_by: "guest" },
                  },
                  insert: {
                    fields: { internal: 0 },
                    forcedData: { created_by: "guest" },
                  },
                },
              },
            },
            {
              name: "AdminDBSchema",
              userTypes: ["admin"],
              publish: {
                [tableName]: { select: "*", insert: "*", update: "*" },
                "client_schema_types.private_table": { select: "*" },
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
        assert.equal(
          readFileSync(
            path.resolve(`debug/client-schema-types/${DB_GENERATED_NAMES.SCHEMA}.ts`),
            "utf8",
          ),
          tsSchema,
        );
        await instance.reWriteDBSchema();
        assert.equal((await instance.getTSSchema()).tsSchema, tsSchema);
        assert.equal(io.sockets.sockets.size, 0);
        checkTypes(
          tsSchema,
          `
        import type { TableHandler, InsertDataWithNested } from "prostgles-types";
        import type { DBHandlerClient } from "prostgles-client";
        import type { DBOFullyTypedClient } from "../server/node_modules/prostgles-server";
        import type { RestrictedFunctionContext, UnrestrictedFunctionContext } from "../server/node_modules/prostgles-server/dist/PublishParser/defineServerFunction";
        import type { getClientHandlers } from "../server/node_modules/prostgles-server/dist/WebsocketAPI/getClientHandlers";
        type Name = "${tableName}";
        declare const guest: TableHandler<GuestDBSchema[Name]["columns"], GuestDBSchema, Name>;
        declare const admin: TableHandler<AdminDBSchema[Name]["columns"], AdminDBSchema, Name>;
        declare const combined: TableHandler<ClientDBSchema[Name]["columns"], ClientDBSchema, Name>;
        declare const server: TableHandler<${DB_GENERATED_NAMES.SCHEMA}[Name]["columns"], ${DB_GENERATED_NAMES.SCHEMA}, Name>;
        declare const viewer: TableHandler<ViewerDBSchema[Name]["columns"], ViewerDBSchema, Name>;
        declare const client: DBHandlerClient<ClientDBSchema>;
        declare const adminClient: DBHandlerClient<AdminDBSchema>;
        declare const restricted: RestrictedFunctionContext<GuestDBSchema>;
        declare const unrestricted: UnrestrictedFunctionContext<DBGeneratedSchema>;
        declare const serverClient: DBOFullyTypedClient<ClientDBSchema>;
        declare const handlers: Awaited<ReturnType<typeof getClientHandlers<GuestDBSchema>>>;
        async () => {
          const restrictedRow = await restricted.dbo["${tableName}"].insert({ body: "hello" }, { returning: "*" });
          restrictedRow.created_by satisfies string;
          await handlers.clientDb["${tableName}"].update({}, { body: "changed" });
          // @ts-expect-error getClientHandlers preserves profile field restrictions
          await handlers.clientDb["${tableName}"].update({}, { internal: "private" });
          // @ts-expect-error restricted functions respect forced insert fields
          await restricted.dbo["${tableName}"].insert({ body: "hello", created_by: "other" });
          // @ts-expect-error restricted functions cannot start transactions
          restricted.dbo.tx(() => {});
          // @ts-expect-error client wrappers do not expose isView
          restricted.dbo["${tableName}"].isView;
          // @ts-expect-error table is absent for some profiles
          await serverClient["client_schema_types.private_table"].find();
          await serverClient["client_schema_types.private_table"]?.find();
          await unrestricted.dbo.tx(async (tx) => {
            await tx["${tableName}"].update({}, { internal: "private" });
          });

          await client["${tableName}"].update({}, { body: "changed" });
          // @ts-expect-error table is absent for guests and viewers
          await client["client_schema_types.private_table"].find();
          await client["client_schema_types.private_table"]?.find();
          await adminClient["client_schema_types.private_table"].find();
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
          // @ts-expect-error unpublished tables are absent
          type Private = GuestDBSchema["client_schema_types.private_table"];
          type Nested = InsertDataWithNested<{}, GuestDBSchema, "parent">;
          const nested: Nested = { "${tableName}": [{ body: "hello" }] };
          // @ts-expect-error nested inputs also exclude forced fields
          const badNested: Nested = { "${tableName}": [{ created_by: "other" }] };
        };
      `,
        );
        const originalPublish = instance.options.publish;
        assert(Array.isArray(originalPublish));
        await instance.update({
          publish: async ({ db, user }) => {
            assert.equal((await db.one("SELECT 1 AS value")).value, 1);
            assert(user === undefined || typeof user.type === "string");
            return originalPublish;
          },
        });
        const profiles: Record<string, ClientSchema> = {};
        for (const [role, name] of [
          ["guest", "GuestDBSchema"],
          ["admin", "AdminDBSchema"],
          ["viewer", "ViewerDBSchema"],
          ["member", "MemberDBSchema"],
          ["unknown", "UnknownDBSchema"],
          ["", "AnonymousDBSchema"],
        ]) {
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
        const inserted = await (handlers.clientDb as DBHandlerServer)[tableName]!.insert!(
          { body: "hello" },
          { returning: "*" },
        );
        assert.equal(inserted.created_by, "guest");
        assert(Number(inserted.synced) > 0);
        const updated = await handlers.clientDb[tableName]!.update!(
          { id: inserted.id },
          { body: "updated" },
          { returning: "*" },
        );
        assert.equal(updated![0].body, "updated");
        assert.equal(updated![0].created_by, "guest");
        await instance.update({ publish: () => originalPublish });
        assert.equal(
          (await (handlers.clientDb as DBHandlerServer)[tableName]!.findOne!({ id: inserted.id }))
            .created_by,
          "guest",
        );
        await assert.rejects(
          (handlers.clientDb as DBHandlerServer)[tableName]!.update!(
            { id: inserted.id },
            { internal: "forbidden" },
          ),
        );
        sockets.forEach((socket) => socket.disconnect());
        io.disconnectSockets(true);
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
            [
              { name: "SameSchema", userTypes: ["a"], publish: null },
              { name: "SameSchema", userTypes: ["b"], publish: null },
            ],
            /Duplicate publish schema name/,
          ],
        ] as const) {
          await instance.update({ publish: () => publish as unknown as typeof originalPublish });
          await assert.rejects((handlers.clientDb as DBHandlerServer)[tableName]!.find!(), error);
          await instance.update({ publish: originalPublish });
          await assert.rejects(
            instance.update({
              publish: publish as unknown as ProstglesInitOptions["publish"],
            }),
            error,
          );
          assert.equal((await instance.getTSSchema()).tsSchema, tsSchema);
        }
        await instance.update({
          publish: [{ userTypes: ["guest"], publish: { [tableName]: { select: "*" } } }],
        });
        const updatedSchema = (await instance.getTSSchema()).tsSchema;
        assert(updatedSchema.includes("export type Publish1Schema"));
        assert(!updatedSchema.includes("GuestDBSchema"));
        assert.equal(
          readFileSync(
            path.resolve(`debug/client-schema-types/${DB_GENERATED_NAMES.SCHEMA}.ts`),
            "utf8",
          ),
          updatedSchema,
        );
        await instance.update({ publish: originalPublish });
        assert.equal((await instance.getTSSchema()).tsSchema, tsSchema);
      } finally {
        sockets.forEach((socket) => socket.disconnect());
        await instance?.destroy();
        await new Promise<void>((resolve) => io.close(() => resolve()));
        await db.none("DROP SCHEMA IF EXISTS client_schema_types CASCADE");
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

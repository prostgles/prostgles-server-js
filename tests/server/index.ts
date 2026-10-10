import express from "express";
import path from "path";
import prostgles, { defineFunction, getLocalStorageClient } from "prostgles-server";
import { withUserRLS } from "prostgles-server/dist/DboBuilder/DboBuilder";
import { CHANNELS } from "prostgles-types";
import { delaySyncTriggerRegistration } from "../syncTriggerCleanup.spec";
import { testPublishTypes } from "./publishTypeCheck";
import { testPublish } from "./testPublish";
import { testTableConfig, testTableHooks } from "./testTableConfig";
import { VALIDATE_SCHEMA_FUNCTION_SQL_TEST } from "./VALIDATE_SCHEMA_FUNCTION_SQL_TEST";

const app = express();
app.use(express.json());
const http = require("http").createServer(app);

testPublishTypes();

const isClientTest = process.env.TEST_TYPE === "client";
if (
  process.env.TEST_TYPE === "server" &&
  process.env.TEST_NAME &&
  !["conflictUpdates", "jobs", "hooks", "audit"].includes(process.env.TEST_NAME)
) {
  throw new Error(`Unknown server test group: ${process.env.TEST_NAME}`);
}
const io = !isClientTest ? undefined : require("socket.io")(http, { path: "/teztz/s" });
const ioWatchSchema =
  !isClientTest ? undefined : require("socket.io")(http, { path: "/teztz/sWatchSchema" });

http.listen(3001);

import { isomorphicQueries } from "../isomorphicQueries.spec";
import { testBackgroundJobs } from "./backgroundJobs.spec";
import { testFileJobs } from "./fileJobs.spec";
import { testConflictUpdates } from "./conflictUpdates.spec";
import { testTableHookRecursion } from "./tableHookRecursion.spec";
import { testExecutionContext } from "./executionContext.spec";
import { testAudit } from "./audit.spec";
import { serverOnlyQueries } from "../serverOnlyQueries.spec";

import { type DBSchema as AliasedSchema, type DBGeneratedSchema } from "../DBGeneratedSchema";

import { spawn } from "child_process";
import type { DBHandlerServerInternal } from "prostgles-server";
export type { DBHandlerServerInternal } from "prostgles-server";

let logs: unknown[] = [];
const replicationErrors: unknown[] = [];

export const log = (msg: string, extra?: any, trace?: boolean) => {
  const msgs = msg.includes("show-logs") ? logs : ["(server): " + msg, extra].filter((v) => v);
  if (trace) {
    console.trace(...msgs);
  } else {
    console.log(...msgs);
  }
};
const stopTest = (err?: unknown) => {
  err ??= replicationErrors.length ? replicationErrors : undefined;
  log("Stopping server ...");
  if (err) {
    console.trace(err);
  }
  process.exit(err ? 1 : 0);
};

const sessions: { id: string; user_id: string }[] = [
  { id: "main", user_id: "1" },
  { id: "syncTriggerCleanup", user_id: "1" },
  { id: "rest_api", user_id: "1" },
];
type USER = {
  id: string;
  username: string;
  password: string;
  type: string;
};
const users: USER[] = [
  { id: "1", username: "public", password: "", type: "public" },
  { id: "2", username: "john", password: "secret", type: "default" },
];

process.on("unhandledRejection", (reason, p) => {
  console.trace("Unhandled Rejection at:", p, "reason:", reason);
  process.exit(1);
});

/**
 * To create a superuser in linux:
 *    sudo su - postgres
 *    createuser api -s -P
 *    createdb prostgles_server_tests -O api
 */
const dbConnection = {
  host: process.env.POSTGRES_HOST || "localhost",
  port: +(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || "prostgles_server_tests",
  user: process.env.POSTGRES_USER || "api",
  password: process.env.POSTGRES_PASSWORD || "api",
};

void (async () => {
  if (isClientTest && process.env.TEST_NAME === "useProstgles") {
    await prostgles<DBGeneratedSchema>({
      dbConnection,
      io: ioWatchSchema,
      transactions: true,
      schemaFilter: { public: 1, prostgles_test: 1 },
      onReady: async ({ dbo, db }) => {},
      publish: "*",
      watchSchema: true,
    });
  }

  void prostgles<DBGeneratedSchema>({
    dbConnection,
    sqlFilePath: path.join(__dirname + "/../../init.sql"),
    io,
    tsGeneratedTypesDir: path.join(__dirname + "/../../../"),
    tsGeneratedTypesFunctionsPath: path.join(__dirname + "/../../index.ts"),
    transactions: true,
    schemaFilter: { public: 1, prostgles_test: 1 },
    onLog: (ev) => {
      logs.push(ev);
      logs = logs.slice(-10);
      if (ev.type === "sync" && ev.command === "replicationError") {
        replicationErrors.push(ev);
      }
      if (ev.type === "debug" || ev.type === "connect" || ev.type === "disconnect") {
        // log("onLog", ev);
      }
      if (isClientTest && process.env.TEST_NAME === "syncTriggerCleanup") {
        return delaySyncTriggerRegistration(ev);
      }
    },
    tableConfig: testTableConfig,
    tableConfigMigrations: {
      version: 1,
      onMigrate: () => {
        throw new Error("onMigrate must not run for a fresh schema");
      },
    },
    tableHooks: testTableHooks,
    testRulesOnConnect: true,
    fileTable: {
      tableName: "files",
      versioning: {},
      storageClient: getLocalStorageClient({ localFolderPath: path.join(__dirname + "/media") }),
      expressApp: app,
      referencedTables: {
        users_public_info: {
          type: "column",
          referenceColumns: {
            avatar: {
              acceptedContent: "*",
            },
          },
        },
      },
    },
    // DEBUG_MODE: true,
    restApi: {
      expressApp: app,
      path: "/api",
    },

    onSocketConnect: ({ socket, db }) => {
      console.log("onSocketConnect", socket.id);
      if (isClientTest) {
        log("Client connected -> console does not work. use log function. socket.id:", socket.id);
        socket.emit("start-test", { server_id: Math.random() });
        socket.on("log", (data, cb) => {
          console.log("Client log ", data);
          if (typeof data === "string" && data.includes("show-logs")) {
            log(data);
          }
        });
        socket.on("reattach-syncs", () => {
          socket.emit(CHANNELS.SCHEMA, socket.prostgles!.values().next().value);
        });
        socket.on("stop-test", (err, cb) => {
          cb();
          console.log("Client test " + (!err ? "successful" : "failed"));
          stopTest(err);
        });
      }
    },

    onSocketDisconnect: ({ socket, db }) => {
      if (isClientTest) {
        log("Client disconnected. socket.id:", socket.id);
      }
    },
    auth: {
      sidKeyName: "token",
      getUser: (sid) => {
        if (!sid) return;
        const s = sessions.find((s) => s.id === sid);
        if (!s) {
          return;
        }
        const user = users.find((u) => s.user_id === u.id);
        if (!user) {
          return;
        }
        return {
          sid: s.id,
          user,
          clientUser: {
            sid: s.id,
            uid: user.id,
            id: user.id,
            type: user.type,
          },
        };
      },
      findUser: (userFilter, dbo) => dbo.users.findOne(userFilter) as any,
      cacheSession: {
        getSession: (sid) => {
          const s = sessions.find((s) => s.id === sid);
          return s ? { sid: s.id, expires: Infinity, onExpiration: "redirect" } : undefined;
        },
      },
      loginSignupConfig: {
        app,
        login: (loginData) => {
          if (loginData.type !== "username") throw "Only username login is supported";
          const { username, password } = loginData;
          const u = users.find((u) => u.username === username && u.password === password);
          if (!u) {
            return "no-match";
          }
          let s = sessions.find((s) => s.user_id === u.id);
          if (!s) {
            s = { id: "SID" + Date.now(), user_id: u.id };
            sessions.push(s);
          }
          log("Logged in!");
          return { session: { sid: s.id, expires: Infinity, onExpiration: "redirect" } };
        },
        logout: async (sid) => {},
        onGetRequestOK(req, res, params) {
          log(req.originalUrl);
          res.sendFile(path.join(__dirname, "../../index.html"), { dotfiles: "allow" });
        },
        loginWithOAuth: {
          websiteUrl: "http://localhost:3001",
          OAuthProviders: {
            github: {
              clientID: "GITHUB_CLIENT_ID",
              clientSecret: "GITHUB",
            },
          },
          onProviderLoginStart: () => ({ success: true }),
          onProviderLoginFail: console.error,
        },
      },
    },
    functions: {
      schemaTests: {
        userFilter: { type: "schema-tests" },
        functions: {
          schemaResult: defineFunction({ run: (): SchemaResult | undefined => undefined }),
          schemaArray: defineFunction({ run: (): ReferencedTables => [] }),
          schemaArrayElement: defineFunction({
            run: (): NonNullable<ReferencedTables>[number] => ({ name: "users", minFiles: 1 }),
          }),
          schemaNestedField: defineFunction({
            run: (): DeepValue<NonNullable<ReferencedTables>[number]> => ({
              a: {
                b: {
                  c: {
                    d: {
                      e: { f: { g: { h: { i: { j: { k: { name: "users", minFiles: 1 } } } } } } },
                    },
                  },
                },
              },
            }),
          }),
          unrelatedSchema: defineFunction({
            run: (): DBSchema["users"] => ({ other: "ok" }),
          }),
          recursiveResult: defineFunction({ run: (): RecursiveResult => ({ value: "ok" }) }),
          sampleSchemas: defineFunction({ run: (): SampleSchema[] => [] }),
          scalarResult: defineFunction({
            input: { value: "number" },
            run: ({ value }, { dbo }) => {
              value satisfies number;
              void dbo.users.find();
              // @ts-expect-error Function contexts must preserve the database schema.
              void dbo.missingTable;
              return value;
            },
          }),
        },
      },
      allUsers: {
        userFilter: {},
        functions: {
          myfunc: defineFunction({
            input: { arg1: { type: "number" } },
            run: (
              {
                arg1,
                //@ts-expect-error
                dwadwa,
              },
              params,
            ) => {
              params.user;
              return 222;
            },
          }),
          myfuncVoid: defineFunction({
            run: async () => {
              await new Promise((res) => setTimeout(res, 100));
            },
          }),
          myfuncWithBadReturn: defineFunction({
            input: { arg1: { type: "number" } },
            run: () => "222",
          }),
          myfuncWithComplexReturn: defineFunction({
            input: { arg1: { type: "number" } },
            run: () => {
              if (Math.random() > 0.5) {
                return { a: 1, b: "str", c: { d: true } };
              } else {
                return [1, 2, 3];
              }
            },
          }),
        },
      },
      admins: {
        userFilter: { email: "admin@example.com" },
        functions: {
          myAdminFunc: defineFunction({
            input: { arg1: { type: "number" } },
            run: ({ arg1 }, { user }) => {
              user.email === "dwadaw";
              //@ts-expect-error
              user.invalid_field === "dwadaw";
              return 222;
            },
          }),
        },
      },
      defaultUsers: {
        userFilter: { email: "john@example.com" },
        functions: {
          myfuncForDefault: defineFunction({
            run: async () => {
              await new Promise((res) => setTimeout(res, 100));
            },
          }),
          myfuncForDefault2: defineFunction({
            input: { name: "string" },
            run: async () => {
              await new Promise((res) => setTimeout(res, 100));
              if (Math.PI) return { a: 1 };
              return { b: "1" };
            },
          }),
        },
      },
    },
    publish: testPublish,
    publishRawSQL: (params) => {
      return true; // Boolean(user && user.type === "admin")
    },
    modifyClientSchema: (table, tableConfig, userData) => {
      const passes =
        ((table as typeof table & { clientSchemaTest?: { passes: number } }).clientSchemaTest
          ?.passes ?? 0) + 1;
      return {
        ...table,
        clientSchemaTest: {
          sid: userData?.sid,
          tableIndex: 0,
          ...(table.name === "planes" && {
            passes,
            primaryKeys: table.columns
              .filter((column) => column.is_pkey)
              .map((column) => column.name),
          }),
        },
        columns:
          table.name === "tr2" ?
            table.columns
          : table.columns.map((column, columnIndex) => ({
              ...column,
              clientSchemaTest: {
                sid: userData?.sid,
                columnIndex,
                ...(table.name === "planes" && { passes }),
              },
            })),
      };
    },
    joins: [
      {
        tables: ["items", "items2"],
        on: [{ name: "name" }],
        type: "many-many",
        override: true,
      },
      {
        tables: ["items2", "items3"],
        on: [{ name: "name" }],
        type: "many-many",
      },
      {
        tables: ["items4a", "items"],
        on: [{ items_id: "id" }],
        type: "many-many",
      },
      {
        tables: ["items4a", "items2"],
        on: [{ items2_id: "id" }],
        type: "many-many",
      },
      {
        tables: ["items_multi", "items"],
        on: [{ items0_id: "id" }, { items1_id: "id" }, { items2_id: "id" }, { items3_id: "id" }],
        type: "many-many",
      },
    ],
    onReady: async ({ dbo, sql, db }) => {
      log("prostgles onReady");
      await dbo.users.upsert(
        { id: 1 },
        {
          email: "public@example.com",
          status: "active",
          type: "public",
          preferences: { others: [] },
        },
      );
      await dbo.users.upsert(
        { id: 2 },
        {
          email: "john@example.com",
          status: "active",
          type: "default",
          preferences: { others: [] },
        },
      );
      await db.any(VALIDATE_SCHEMA_FUNCTION_SQL_TEST);
      try {
        if (isClientTest) {
          const execPath = path.resolve(`${__dirname}/../../../client`);
          /** For some reason the below doesn't work anymore */
          // const proc = spawn("npm", ["run", "test"], { cwd: execPath, stdio: "inherit" });

          spawn(
            "node",
            [
              // "--inspect-brk",
              "dist/client/index.js",
            ],
            {
              cwd: execPath,
              stdio: "inherit",
            },
          );

          log("Waiting for client...");
        } else if (process.env.TEST_TYPE === "server") {
          if (process.env.TEST_NAME === "audit") {
            await testAudit(db);
            stopTest();
            return;
          }
          if (process.env.TEST_NAME === "hooks") {
            await testExecutionContext(db);
            await testTableHookRecursion(db);
            stopTest();
            return;
          }
          if (process.env.TEST_NAME === "conflictUpdates") {
            await testConflictUpdates(db);
            stopTest();
            return;
          }
          if (process.env.TEST_NAME === "jobs") {
            await testBackgroundJobs(db);
            await testFileJobs(db);
            stopTest();
            return;
          }
          await serverOnlyQueries(dbo as unknown as DBHandlerServerInternal, db, withUserRLS);
          log("Server-only query tests successful");
          await isomorphicQueries(dbo, sql, log);
          log("Server isomorphic tests successful");

          stopTest();
        }
      } catch (err) {
        console.trace(err);
        if (process.env.TEST_TYPE) {
          stopTest(err ?? "Error");
        }
      }
    },
  });
})();

type DBSchema = { users: { other: string } };
type ReferencedTables = NonNullable<AliasedSchema["tjson"]["table_config"]>["referencedTables"];
type SchemaForInsert = {
  [K in keyof DBGeneratedSchema]: DBGeneratedSchema[K]["columns"];
};
type SchemaResult = {
  rows: AliasedSchema["users"][];
  inserts: SchemaForInsert["users"][];
  selection: Pick<AliasedSchema["users"], "id" | "preferences">;
  preferences: AliasedSchema["users"]["preferences"];
  optional: Partial<AliasedSchema["users"]>;
  unrelated: { nested: { enabled: boolean } };
  tags: string[];
  created: Date;
};
type DeepValue<T> = {
  a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: T } } } } } } } } } };
};
type RecursiveResult = { value: string; next?: RecursiveResult };
type SampleSchema = { name: string; path: string } & (
  | { type: "sql"; file: string }
  | {
      type: "dir";
      workspaceConfig?: {
        workspaces: {
          options?: {
            hideCounts?: boolean;
            tableListEndInfo?: "count" | "size" | "none";
          };
        }[];
      };
    }
);

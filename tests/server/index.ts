import express from "express";
import path from "path";
import prostgles, { createServerFunctionWithContext } from "prostgles-server";
import { testPublishTypes } from "./publishTypeCheck";
import { testPublish } from "./testPublish";
import { testTableConfig } from "./testTableConfig";
const app = express();
app.use(express.json());
const http = require("http").createServer(app);

testPublishTypes();

const isClientTest = process.env.TEST_TYPE === "client";
const io = !isClientTest ? undefined : require("socket.io")(http, { path: "/teztz/s" });
const ioWatchSchema =
  !isClientTest ? undefined : require("socket.io")(http, { path: "/teztz/sWatchSchema" });

http.listen(3001);

import { isomorphicQueries } from "../isomorphicQueries.spec";
import { serverOnlyQueries } from "../serverOnlyQueries.spec";

import { DBGeneratedSchema } from "../DBGeneratedSchema";

import { spawn } from "child_process";
import type { DBOFullyTyped } from "prostgles-server";
import type { PublishParams } from "prostgles-server";
import type { SessionUser } from "prostgles-server";
import { defineServerFunction } from "prostgles-server";
export type { DBHandlerServer } from "prostgles-server";

let logs = [];

export const log = (msg: string, extra?: any, trace?: boolean) => {
  const msgs = msg.includes("show-logs") ? logs : ["(server): " + msg, extra].filter((v) => v);
  if (trace) {
    console.trace(...msgs);
  } else {
    console.log(...msgs);
  }
};
const stopTest = (err?) => {
  log("Stopping server ...");
  if (err) {
    console.trace(err);
  }
  process.exit(err ? 1 : 0);
};

const sessions: { id: string; user_id: string }[] = [];
type USER = {
  id: string;
  username: string;
  password: string;
  type: string;
};
const users: USER[] = [{ id: "1a", username: "john", password: "secret", type: "default" }];

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
  port: +process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "prostgles_server_tests",
  user: process.env.POSTGRES_USER || "api",
  password: process.env.POSTGRES_PASSWORD || "api",
};

function dd() {
  const dbo: DBOFullyTyped<{
    tbl: { is_view: true; columns: { col1: { type: number } } };
  }> = 1 as any;
  if (!dbo) return;
  dbo.tbl.find;
}

(async () => {
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

  prostgles<DBGeneratedSchema>({
    dbConnection,
    sqlFilePath: path.join(__dirname + "/../../init.sql"),
    io,
    tsGeneratedTypesDir: path.join(__dirname + "/../../../"),
    transactions: true,
    schemaFilter: { public: 1, prostgles_test: 1 },
    onLog: async (ev) => {
      logs.push(ev);
      logs = logs.slice(-10);
      if (ev.type === "debug" || ev.type === "connect" || ev.type === "disconnect") {
        // log("onLog", ev);
      }
    },
    tableConfig: testTableConfig,
    testRulesOnConnect: true,
    fileTable: {
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
      localConfig: {
        localFolderPath: path.join(__dirname + "/media"),
      },
      expressApp: app,
      tableName: "files",
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
        socket.on("log", async (data, cb) => {
          console.log("Client log ", data);
          if (typeof data === "string" && data.includes("show-logs")) {
            log(data);
          }
        });
        socket.on("stop-test", async (err, cb) => {
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
      getUser: async (sid) => {
        if (sid) {
          const s = sessions.find((s) => s.id === sid);
          if (s) {
            const user = users.find((u) => s && s.user_id === u.id);
            if (user) {
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
            }
          }
        }
        return undefined;
      },
      cacheSession: {
        getSession: async (sid) => {
          const s = sessions.find((s) => s.id === sid);
          return s ? { sid: s.id, expires: Infinity, onExpiration: "redirect" } : undefined;
        },
      },
      loginSignupConfig: {
        app,
        login: async (loginData) => {
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
          res.sendFile(path.join(__dirname, "../../index.html"));
        },
        loginWithOAuth: {
          websiteUrl: "http://localhost:3001",
          OAuthProviders: {
            github: {
              clientID: "GITHUB_CLIENT_ID",
              clientSecret: "GITHUB",
            },
          },
          onProviderLoginStart: async () => ({ success: true }),
          onProviderLoginFail: console.error,
        },
      },
    },
    functions: (params) => {
      const forAllUsers = createServerFunctionWithContext(params);
      const forAdmins = createServerFunctionWithContext(
        params?.user?.type === "admin" ? { ...params, type: "admin" as const } : undefined
      );
      return {
        myfunc: forAllUsers({
          input: { arg1: { type: "number" } },
          output: "number",
          run: (
            {
              arg1,
              //@ts-expect-error
              dwadwa,
            },
            params
          ) => {
            params.user;
            return 222;
          },
        }),
        myAdminFunc: forAdmins({
          input: { arg1: { type: "number" } },
          output: "number",
          run: ({ arg1 }, { user, type }) => {
            type === "admin";
            user.type === "dwadaw";
            return 222;
          },
        }),
        myfuncWithBadReturn: forAllUsers({
          input: { arg1: { type: "number" } },
          output: "number",
          run: () => "222",
        }),
      };
    },
    publish: testPublish,
    publishRawSQL: async (params) => {
      return true; // Boolean(user && user.type === "admin")
    },
    joins: [
      {
        tables: ["items", "items2"],
        on: [{ name: "name" }],
        type: "many-many",
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
    onReady: async ({ dbo, db }) => {
      log("prostgles onReady");

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
            }
          );

          log("Waiting for client...");
        } else if (process.env.TEST_TYPE === "server") {
          await serverOnlyQueries(dbo as any);
          log("Server-only query tests successful");
          await isomorphicQueries(dbo as any, log);
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

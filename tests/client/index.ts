import prostgles from "prostgles-client";
import io from "socket.io-client";

import type { DBHandlerClient, UseProstglesClientProps } from "prostgles-client";
import { AuthHandler } from "prostgles-client/dist/getAuthHandler";
import type { ClientFunctionHandler } from "prostgles-client/dist/getMethods";
import { DBSchemaTable, type SQLHandler } from "prostgles-types";
import { clientFileTests } from "../clientFileTests.spec";
import { clientOnlyQueries } from "../clientOnlyQueries.spec";
import { clientRestApi } from "../clientRestApi.spec";
import { isomorphicQueries } from "../isomorphicQueries.spec";
import { isomorphicQueriesTyped } from "../isomorphicQueriesTyped.spec";
import { clientHooks } from "./hooks.spec";
import { newly_created_table, useProstglesTest } from "./useProstgles.spec";
export { DBHandlerClient } from "prostgles-client";
export { AuthHandler } from "prostgles-client/dist/getAuthHandler";
export type { ClientFunctionHandler } from "prostgles-client/dist/getMethods";

const start = Date.now();
const log = (msgOrObj: any, extra?: any) => {
  const msg = msgOrObj && typeof msgOrObj === "object" ? JSON.stringify(msgOrObj) : msgOrObj;
  console.log(...[`(client) t+ ${Date.now() - start}ms ` + msg, extra].filter((v) => v));
};
log("Started client...");

const { TEST_NAME } = process.env;
const url = "http://127.0.0.1:3001";
const defaultPath = "/teztz/s";
const pathWatchSchema = "/teztz/sWatchSchema";
const getClientOptions = (watchSchema = false) => {
  const path = watchSchema ? pathWatchSchema : defaultPath;
  return {
    endpoint: url,
    // token: TEST_NAME,
    socketOptions: {
      query: { token: TEST_NAME },
      path,
    },
  } satisfies UseProstglesClientProps;
};
const { endpoint, socketOptions } = getClientOptions();
const socket = io(endpoint, { ...socketOptions });

type ClientTestSpecV2 = (args: {
  db: DBHandlerClient<void>;
  sql: SQLHandler | undefined;
  methods: ClientFunctionHandler;
  tableSchema: DBSchemaTable[];
  isReconnect?: boolean;
  auth: AuthHandler;
}) => Promise<void>;

const tests: Record<string, ClientTestSpecV2> = {
  main: async ({ db, sql, methods, tableSchema, auth }) => {
    await sql(`DROP TABLE IF EXISTS ${newly_created_table}`);
    await isomorphicQueries(db, sql, log);
    await isomorphicQueriesTyped(
      //@ts-ignore
      db,
    );
    await clientOnlyQueries(db, sql, auth, log, methods, tableSchema, TEST_NAME);
    await clientHooks(db);
  },
  useProstgles: async ({ db, sql }) => {
    await useProstglesTest(db, sql, getClientOptions);
  },
  files: async ({ db, sql }) => {
    await clientFileTests(db, sql);
  },
  rest_api: async ({ db, tableSchema }) => {
    await clientRestApi(db, tableSchema, TEST_NAME);
  },
};

const testFileFunc = tests[TEST_NAME];
if (!testFileFunc) {
  throw `Invalid TEST_NAME env var provided (${TEST_NAME}). Expecting one of: ${Object.keys(tests)}`;
}

const stopTest = (args?: { err: any }) => {
  const { err } = args ?? {};
  if (args) {
    log(`TEST_NAME: ${TEST_NAME} Error: ${JSON.stringify(err)}`, err);
  } else {
    log(`TEST_NAME: ${TEST_NAME} Finished OK`);
  }

  setTimeout(() => {
    socket.emit(
      "stop-test",
      !args ? undefined : { err: (err ?? "Unknown").toString(), error: err },
      (cb) => {
        log("Stopping client...");
        if (err) console.trace(err);
      },
    );
    setTimeout(() => {
      process.exit(err ? 1 : 0);
    }, 1000);
  }, 1000);
};

try {
  socket.on("connected", () => {
    log("Client connected.");
  });
  socket.on("connect", () => {
    log("Client connect.");
  });
  socket.on("connect_failed", (err) => {
    log("connect_failed", err);
  });
  socket.on("start-test", (data) => {
    //@ts-ignore
    prostgles({
      socket,
      onReconnect: (socket) => {
        log("Reconnected");
      },
      onReady: async ({ db, sql, methods, tableSchema, auth, isReconnect }) => {
        log(`TEST_NAME: ${TEST_NAME} Started`);
        try {
          //@ts-ignore
          if (typeof window !== "undefined") {
            const onLog = (...args: any[]) => {
              socket.emit(
                "log",
                args.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)).join(" "),
              );
            };
            //@ts-ignore
            window.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
              console.error("Error occured: " + errorMsg);
              stopTest({ err: errorMsg });
              return false;
            };
            console.log = onLog;
          }
          await testFileFunc({ db, sql, methods, tableSchema, auth, isReconnect });

          stopTest();
        } catch (err) {
          stopTest({ err });
        }
      },
    });
  });
} catch (e) {
  console.trace(e);
  stopTest(e);
  throw e;
}

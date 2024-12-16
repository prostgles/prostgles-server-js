import prostgles from "prostgles-client";
import io from "socket.io-client";

import { AuthHandler } from "prostgles-client/dist/Auth";
export { AuthHandler } from "prostgles-client/dist/Auth";
import type {
  DBHandlerClient,
  MethodHandler,
} from "prostgles-client/dist/prostgles";
import { DBSchemaTable } from "prostgles-types";
import { clientFileTests } from "../clientFileTests.spec";
import { clientOnlyQueries } from "../clientOnlyQueries.spec";
import { clientRestApi } from "../clientRestApi.spec";
import { isomorphicQueries } from "../isomorphicQueries.spec";
import { clientHooks } from "./hooks.spec";
import { newly_created_table, useProstglesTest } from "./useProstgles.spec";
export { DBHandlerClient } from "prostgles-client/dist/prostgles";

const start = Date.now();
const log = (msgOrObj: any, extra?: any) => {
  const msg =
    msgOrObj && typeof msgOrObj === "object"
      ? JSON.stringify(msgOrObj)
      : msgOrObj;
  console.log(
    ...[`(client) t+ ${Date.now() - start}ms ` + msg, extra].filter((v) => v),
  );
};
log("Started client...");

const { TEST_NAME } = process.env;
const url = "http://127.0.0.1:3001";
const path = "/teztz/s";
const pathWatchSchema = "/teztz/sWatchSchema";
const getSocketOptions = (watchSchema = false) => ({
  uri: url,
  path: watchSchema ? pathWatchSchema : path,
  query: { token: TEST_NAME },
});
const { uri, ...socketOpts } = getSocketOptions();
const socket = io(uri, socketOpts);

type ClientTestSpecV2 = (args: {
  db: DBHandlerClient<void>;
  methods: MethodHandler;
  tableSchema: DBSchemaTable[];
  isReconnect?: boolean;
  auth: AuthHandler;
}) => Promise<void>;

const tests: Record<string, ClientTestSpecV2> = {
  main: async ({ db, methods, tableSchema, auth }) => {
    await db.sql(`DROP TABLE IF EXISTS ${newly_created_table}`);
    await isomorphicQueries(db, log);
    await clientOnlyQueries(db, auth, log, methods, tableSchema, TEST_NAME);
    await clientHooks(db, getSocketOptions);
  },
  useProstgles: async ({ db }) => {
    await useProstglesTest(db, getSocketOptions);
  },
  files: async ({ db, methods, tableSchema, auth }) => {
    await clientFileTests(db, auth, log, methods, tableSchema);
  },
  rest_api: async ({ db, methods, tableSchema, auth }) => {
    await clientRestApi(db, auth, log, methods, tableSchema, TEST_NAME);
  },
};

const test = tests[TEST_NAME];
if (!test) {
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
      onReady: async (db, methods, tableSchema, auth, isReconnect) => {
        log(`TEST_NAME: ${TEST_NAME} Started`);
        try {
          //@ts-ignore
          if (typeof window !== "undefined") {
            const onLog = (...args: any[]) => {
              socket.emit(
                "log",
                args
                  .map((v) => (typeof v === "object" ? JSON.stringify(v) : v))
                  .join(" "),
              );
            };
            //@ts-ignore
            window.onerror = function myErrorHandler(
              errorMsg,
              url,
              lineNumber,
            ) {
              console.error("Error occured: " + errorMsg);
              stopTest({ err: errorMsg });
              return false;
            };
            console.log = onLog;
          }
          await test({ db, methods, tableSchema, auth, isReconnect });

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

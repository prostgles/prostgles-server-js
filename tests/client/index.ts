import prostgles from "prostgles-client";
import io from "socket.io-client";

import { isomorphicQueries } from "../isomorphicQueries.spec";
import { clientOnlyQueries } from "../clientOnlyQueries.spec"; 
import { clientRestApi } from "../clientRestApi.spec"; 
import { clientFileTests } from "../clientFileTests.spec"; 
import { InitOptions } from "prostgles-client/dist/prostgles";
export { DBHandlerClient, Auth } from "prostgles-client/dist/prostgles";

const start = Date.now();
const log = (msgOrObj: any, extra?: any) => {
  const msg = msgOrObj && typeof msgOrObj === "object"? JSON.stringify(msgOrObj) : msgOrObj;
  console.log(...[`(client) t+ ${(Date.now() - start)}ms ` + msg, extra].filter(v => v));
}
log("Started client...");

const { TEST_NAME } = process.env;

type ClientTestSpec = {
  onRun: InitOptions["onReady"]
};

const tests: Record<string, ClientTestSpec> = {
  main: {
    onRun: async (db, methods, tableSchema, auth) => {
      await isomorphicQueries(db, log);
      await clientOnlyQueries(db, auth, log, methods, tableSchema, TEST_NAME);
    },
  },
  files: {
    onRun: async (db, methods, tableSchema, auth) => {
      await clientFileTests(db, auth, log, methods, tableSchema)
    },

  },
  rest_api: {
    onRun: async (db, methods, tableSchema, auth) => {
      await clientRestApi(db, auth, log, methods, tableSchema, TEST_NAME);
    }
  },
};

const test = tests[TEST_NAME];
if(!test){
  throw `Invalid TEST_NAME env var provided (${TEST_NAME}). Expecting one of: ${Object.keys(tests)}`;
}

const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001";
const path = process.env.PRGL_CLIENT_PATH || "/teztz/s";
const socket = io(url, { path, query: { token: TEST_NAME }  });  
const stopTest = (args?: { err: any; }) => {
  const { err } = args ?? {};
  if(args) {
    log(`TEST_NAME: ${TEST_NAME} Error: ${JSON.stringify(err)}`, err);
  } else {
    log(`TEST_NAME: ${TEST_NAME} Finished OK`);
  }

  setTimeout(() => {
    socket.emit("stop-test", !args? undefined : { err: (err ?? "Unknown").toString(), error: err }, cb => {

      log("Stopping client...");
      if(err) console.trace(err);

    });
    setTimeout(() => {
      process.exit(err? 1 : 0)
    }, 1000);
  }, 1000);
  
};
  
try {
  socket.on("connected", () => {
    log("Client connected.")
  });
  socket.on("connect", () => {
    log("Client connect.")
  });
  socket.on("connect_failed", (err) => {
    log("connect_failed", err)
  })
  socket.on("start-test", (data) => {
 
    //@ts-ignore
    prostgles({
      socket,
      onReconnect: (socket) => {
        log("Reconnected");
      },
      onReady: async (db, methods, tableSchema, auth, isReconnect) => {
        log(`TEST_NAME: ${TEST_NAME} Started`)
        try {
          if(typeof window !== "undefined"){
            const onLog = (...args: any[]) => {
              socket.emit("log", args.map(v => typeof v === "object"? JSON.stringify(v) : v).join(" "));
            }
            window.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
              console.error("Error occured: " + errorMsg);
              stopTest({ err: errorMsg });
              return false;
            }
            console.log = onLog;
          }
          await test.onRun(db, methods, tableSchema, auth, isReconnect);
  
          stopTest();

        } catch (err){
          stopTest({ err });
        }
      }
    }); 
  
  })

} catch(e) {
  console.trace(e)
  stopTest(e);
  throw e;
}
 
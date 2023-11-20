import prostgles from "prostgles-client";
import io from "socket.io-client";

import isomorphic from "../isomorphic_queries";
import client_only from "../client_only_queries"; 
import client_rest_api from "../client_rest_api"; 
import client_files from "../client_files"; 
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
      await isomorphic(db, log);
      await client_only(db, auth, log, methods, tableSchema, TEST_NAME);
    },
  },
  files: {
    onRun: async (db, methods, tableSchema, auth) => {
      await client_files(db, auth, log, methods, tableSchema)
    },

  },
  rest_api: {
    onRun: async (db, methods, tableSchema, auth) => {
      await client_rest_api(db, auth, log, methods, tableSchema, TEST_NAME);
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
 
import prostgles from "prostgles-client";
import io from "socket.io-client";

import isomorphic from "../isomorphic_queries";
import client_only from "../client_only_queries"; 
import client_files from "../client_files"; 
import { InitOptions } from "prostgles-client/dist/prostgles";
export { DBHandlerClient, Auth } from "prostgles-client/dist/prostgles";

const start = Date.now();
const log = (msg: string, extra?: any) => {
  console.log(...[`(client) t+ ${(Date.now() - start)}ms ` + msg, extra].filter(v => v));
}
log("Started client...");


type ClientTestSpec = {
  onRun: InitOptions["onReady"]
};

const tests: Record<string, ClientTestSpec> = {
  main: {
    onRun: async (db, methods, tableSchema, auth) => {

      log("Starting Client isomorphic tests");
      await isomorphic(db as any, log);
      log("Client isomorphic tests successful");

      await client_only(db as any, auth, log, methods, tableSchema);
      log("Client-only replication tests successful");

    },
  },
  files: {
    onRun: async (db, methods, tableSchema, auth) => {
      await client_files(db as any, auth, log, methods, tableSchema)
    },

  },
};

const { TEST_NAME } = process.env;
const test = tests[TEST_NAME];
if(!test){
  throw `Invalid TEST_NAME env var provided (${TEST_NAME}). Expecting one of: ${Object.keys(tests)}`;
}

const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001";
const path = process.env.PRGL_CLIENT_PATH || "/teztz/s";
const socket = io(url, { path, query: { token: TEST_NAME }  });  
const stopTest = (err?) => {
  if(err) log("Stopping client due to error: " + JSON.stringify(err));

  setTimeout(() => {
    socket.emit("stop-test", !err? err : { err: err.toString(), error: err }, cb => {

      log("Stopping client...");
      if(err) console.trace(err);

    });
    setTimeout(() => {
      process.exit(err? 1 : 0)
    }, 1000);
  }, 1000);
  
};
  
try {
  /* TODO find out why connection does not happen on rare occasions*/
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
    log("start-test " + TEST_NAME, data);

    // @ts-ignore
    prostgles({
      socket, // or simply io()
      onReconnect: (socket) => {
        log("Reconnected")          
      },
      onReady: async (db, methods, tableSchema, auth, isReconnect) => {
        log(`TEST_NAME: ${TEST_NAME}, onReady.auth`, auth)
        try {
          await test.onRun(db, methods, tableSchema, auth, isReconnect);
  
          stopTest();

        } catch (err){
          console.trace(err)
          stopTest(err);
          // throw err;
        }
      }
    }); 
  
  })

} catch(e) {
  console.trace(e)
  stopTest(e);
  throw e;
}
 
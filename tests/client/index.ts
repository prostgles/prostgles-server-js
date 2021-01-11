import prostgles from "prostgles-client";
import io from "socket.io-client";

import isomorphic from "../isomorphic_queries";
import client_only from "../client_only_queries";
export { DBHandlerClient, SQLResult } from "prostgles-client/dist/prostgles";

const start = Date.now();
const log = (msg: string, extra?: any) => {
  console.log(...[`(client) t+ ${(Date.now() - start)}ms ` + msg, extra].filter(v => v));
}
log("Started client...");

const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001",
  path = process.env.PRGL_CLIENT_PATH || "/teztz/s",
  socket = io(url, { path }),
  stopTest = (err?) => {
    socket.emit("stop-test", !err? err : { err: err.toString() }, cb => {

      log("Stopping client...");
      if(err) console.error(err);
  
      setTimeout(() => {
        process.exit(err? 1 : 0)
      }, 1000);

    });
    
  };

try {
  /* TODO find out why connection does not happen on rare occasions*/
  socket.on("connected", () => {
    log("Client connected.")
  });
  socket.on("connect", () => {
    log("Client connect.")
  });
  socket.on("start-test", () => {
  
    prostgles({
      socket, // or simply io()
      onReconnect: (socket) => {
        log("Reconnected")          
      },
      onReady: async (db, methods, fullSchema, auth) => {
        log("onReady.auth", auth)
        try {
          await isomorphic(db);
          log("Client isomorphic tests successful")
  
          await client_only(db, auth, log);
          log("Client-only replication tests successful")
  
  
          stopTest();

        } catch (err){
          stopTest(err);
        }
      }
    }); 
  
  })

} catch(e) {
  stopTest(e);
}
 
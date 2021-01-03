import prostgles from "prostgles-client";
import io from "socket.io-client";

import isomorphic from "../isomorphic_queries";
import client_only from "../client_only_queries";
export { DBHandlerClient, SQLResult } from "prostgles-client/dist/prostgles";


console.log("Starting client")
const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001",
  path = process.env.PRGL_CLIENT_PATH || "/teztz/s",
  socket = io(url, { path }),
  stopTest = (err?) => {
    socket.emit("stop-test", !err? err : { err: err.toString() }, cb => {

      console.log("Stopping client...");
      if(err) console.error(err);
  
      setTimeout(() => {
        process.exit(err? 1 : 0)
      }, 1000);

    });
    
  };

  try {
    socket.on("start-test", () => {
    
      prostgles({
        socket, // or simply io()
        onReconnect: (socket) => {
          
          
        },
        onReady: async (db, methods) => {
          
          try {
            await isomorphic(db);
            console.log("Client isomorphic tests successful")
    
            await client_only(db);
            console.log("Client-only replication tests successful")
    
    
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
 
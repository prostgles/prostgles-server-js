import prostgles from "prostgles-client";
import io from "socket.io-client";

import isomorphic from "../isomorphic_queries";

const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001",
  path = process.env.PRGL_CLIENT_PATH || "/teztz/s",
  socket = io(url, { path });

socket.on("start-test", () => {

  prostgles({
    socket, // or simply io()
    onReconnect: (socket) => {
      
      
    },
    onReady: async (db, methods) => {
  
      try {
        await isomorphic(db);
        console.log("Client tests successful")
        socket.emit("stop-test");
        process.exit(0)
      } catch (err){
        socket.emit("stop-test", { err: err.toString() });
        console.error(err);
        process.exit(1)
      }
    }
  }); 

})
 
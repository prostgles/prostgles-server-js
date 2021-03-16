

/* Dashboard */
import path from 'path';
import express from 'express';
import prostgles from "prostgles-server";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
const io = require("socket.io")(http, { 
  path: "/s" 
});
http.listen(3001);

const log = (msg: string, extra?: any) => {
  console.log(...["(server): " + msg, extra].filter(v => v));
}


import { DBObj } from "./DBoGenerated";


// import WebSocket from 'ws';
// const wss = new WebSocket.Server({
//   // port: 3001,
//   server: http,
//   path: "/s",
//   perMessageDeflate: {
//     zlibDeflateOptions: {
//       // See zlib defaults.
//       chunkSize: 1024,
//       memLevel: 7,
//       level: 3
//     },
//     zlibInflateOptions: {
//       chunkSize: 10 * 1024
//     },
//     // Other options settable:
//     clientNoContextTakeover: true, // Defaults to negotiated value.
//     serverNoContextTakeover: true, // Defaults to negotiated value.
//     serverMaxWindowBits: 10, // Defaults to negotiated value.
//     // Below options specified as default values.
//     concurrencyLimit: 10, // Limits zlib concurrency for perf.
//     threshold: 1024 // Size (in bytes) below which messages
//     // should not be compressed.
//   }
// });
// wss.on("connection", s => {
//   s.on("message", console.log)
// })

prostgles({
  dbConnection: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: +process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || "postgres",
    user: process.env.POSTGRES_USER || "api",
    password:  process.env.POSTGRES_PASSWORD || "api"
  },
  io,
  tsGeneratedTypesDir: path.join(__dirname + '/'),
  watchSchema: true,
  // transactions: true,	
  publishRawSQL: async (socket, db: any, _db: any, user: any) => {
    // log("set auth logic")
    return true
  },
  publish: async (socket, dbo: any, _db: any, user: any) => {
    
    return "*";
    
  },
  joins: "inferred",
  onReady: async (db: any, _db: any) => {
    // await _db.any("CREATE TABLE IF NOT EXISTS ttt(id INTEGER, t TEXT)");
    // // await db.ttt.insert([{ t: "a" }, { t: "b" }]);
    // await db.ttt.update({t: "a"}, { id: -1 })
    // await db.ttt.updateBatch([
    //   [{t: "a"}, { id: -2 }],
    //   [{t: "a"}, { id: -2 }]
    // ])
    // console.log("ok", await db.ttt.count({ t: "z" }), await db.ttt.count({ id: -1 }));

    app.get('*', function(req, res){
      log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		});

		console.log("onReady ", Boolean(db.t))
		// if(!db.hehe)	await _db.any("CREATE TABLE hehe(id SERIAL);");
		// setTimeout(() => {
		// 	_db.any("DROP TABLE IF EXISTS hehe;");
		// }, 5000);
  },
});
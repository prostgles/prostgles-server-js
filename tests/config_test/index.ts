

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
  watchSchema: true,// "hotReloadMode",
	sqlFilePath: path.join(__dirname+'/init.sql'),
  // transactions: true,	
  publishRawSQL: async (socket, db: any, _db: any, user: any) => {
    // log("set auth logic")
    return true
  },
  publish: async (socket, dbo: any, _db: any, user: any) => {
    
    return "*";
    
  },
  joins: "inferred",
  onReady: async (db: DBObj, _db: any) => {
    // await _db.any("CREATE TABLE IF NOT EXISTS ttt(id INTEGER, t TEXT)");

    app.get('*', function(req, res){
      log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		});

    // await db.items.insert([
    //   {name: "c"},
    //   {name: "c", tst: new Date()}
    // ])

    // await db.items.insert([{name: '2'}]);
    // const d = await db.items.findOne({ "id->hehe->hihi->final": ' '});  "id.$ilike": ' ', 

    try {
      const longGeomFilter = { idd: { "=": { "ST_MakeEnvelope": [1,2,3,4 ]}}},
        shortGeomFilter = { "id.=.ST_MakeEnvelope": [1,2,3,'$$--4\"\'$$\``' ] };
  
      const d = await db.items.findOne({ }, { select: { h: { "$ts_headline": ["name", "a"] } }});
      console.log(d)

    } catch(e) {
      console.error(e)
    }


		// console.log("onReady ", 
    //   await db.items.find(
    //     {}, //{ d: new Date() },
    //     { 
    //       select: { 
    //         name: 1, 
    //         d: { $date_trunc: ["days", "tst"] }, 
    //         count: { $countAll: [] } 
    //       },
    //       orderBy: { count: -1 , d: -1 }
    //     },
    //     // undefined,
    //     // undefined,
    //     // { returnQuery: false } 
    //   ).catch(console.error)
    // )
		// if(!db.hehe)	await _db.any("CREATE TABLE hehe(id SERIAL);");
		// setTimeout(() => {
		// 	_db.any("DROP TABLE IF EXISTS hehe;");
		// }, 5000);
  },
});
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* Dashboard */
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const prostgles_server_1 = __importDefault(require("prostgles-server"));
process.on('unhandledRejection', (reason, p) => {
    console.trace('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(1);
});
const app = express_1.default();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
const io = require("socket.io")(http, {
    path: "/s"
});
http.listen(process.env.NPORT || 3001);
const log = (msg, extra) => {
    console.log(...["(server): " + msg, extra].filter(v => v));
};
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
prostgles_server_1.default({
    dbConnection: {
        host: process.env.POSTGRES_HOST || "localhost",
        port: +process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || "postgres",
        user: process.env.POSTGRES_USER || "api",
        password: process.env.POSTGRES_PASSWORD || "api",
        application_name: "hehe" + Date.now()
    },
    io,
    tsGeneratedTypesDir: path_1.default.join(__dirname + '/'),
    watchSchema: true,
    sqlFilePath: path_1.default.join(__dirname + '/init.sql'),
    // transactions: true,	
    publishRawSQL: async (socket, db, _db, user) => {
        // log("set auth logic")
        return true;
    },
    publish: async (socket, dbo, _db, user) => {
        return "*";
        return {
            various: "*",
            v_various: "*",
        };
    },
    joins: "inferred",
    // onNotice: console.log,
    onReady: async (db, _db) => {
        // await _db.any("CREATE TABLE IF NOT EXISTS ttt(id INTEGER, t TEXT)");
        console.log("onReady");
        app.get('*', function (req, res) {
            log(req.originalUrl);
            res.sendFile(path_1.default.join(__dirname + '/index.html'));
        });
        // console.log(await db.various.find({ id: 2 }));
        // db.v_various.subscribe({ "id.>": 2 }, {}, console.log)
        // await db.items.insert([ 
        //   {name: "c"},
        //   {name: "c", tst: new Date()}
        // ])
        // await db.items.insert([{name: '2'}]);
        // const d = await db.items.findOne({ "id->hehe->hihi->final": ' '});  "id.$ilike": ' ', 
        try {
            const longGeomFilter = { idd: { "=": { "ST_MakeEnvelope": [1, 2, 3, 4] } } }, shortGeomFilter = { "id.=.ST_MakeEnvelope": [1, 2, 3, '$$--4\"\'$$\``'] };
            // const d = await db.items.findOne({ }, { select: { 
            //   h: { "$ts_headline_simple": ["name", { plainto_tsquery: "a" }] },
            //   hh: { "$ts_headline": ["name", "a"] },
            //   tst: 1,// "$date_trunc_5second", 
            //   tr15: { "$date_trunc_15minute": ["tst"] },
            //   trh: { "$date_trunc": ["hour", "tst"] }
            // }});
            // console.log(d)
            // const term = "cc23";
            // const res = await db.items.find(
            //   { "hIdx.>": -2 }, 
            //   { select: { 
            //       h: { $term_highlight: ["*", term, { noFields: true, edgeTruncate: 5 }] },
            //       hIdx:  { $term_highlight: [["name"], term, { returnIndex: true }] },
            //     },
            //     orderBy: { hIdx: -1 } 
            //   }
            // ); 
            // console.log(res.map(r => JSON.stringify(r)).join("\n"));//, null, 2))  
            const r = await db.items.findOne({ "id.=": 1 }, { select: { $rowhash: 1, "*": 1 } });
            // const rr = await db.items.update({ '$rowhash': r.$rowhash } as any, { name: 'a' } as any, { returning: "*"})
            console.log(r);
            if (true || process.env.NPORT) {
            }
        }
        catch (e) {
            console.error(e);
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
// prostgles({
//   dbConnection: {
//     host: process.env.POSTGRES_HOST || "localhost",
//     port: +process.env.POSTGRES_PORT || 5432,
//     database: process.env.POSTGRES_DB || "postgres",
//     user: process.env.POSTGRES_USER || "api",
//     password:  process.env.POSTGRES_PASSWORD || "api",
//     application_name: "hehe" + Date.now()
//   },
//   // io,
//   tsGeneratedTypesDir: path.join(__dirname + '/'),
//   watchSchema: (s) => {
//     console.log(s.command)
//   },
// 	sqlFilePath: path.join(__dirname+'/init.sql'),
//   // transactions: true,	
//   publishRawSQL: async (socket, db: any, _db: any, user: any) => {
//     // log("set auth logic")
//     return true
//   },
//   publish: async (socket, dbo: any, _db: any, user: any) => {
//     return {
//       various: "*",
//     };
//   },
//   joins: "inferred",
//   onReady: async (db: DBObj, _db: any) => {
//   }
// });

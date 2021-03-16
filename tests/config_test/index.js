"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* Dashboard */
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const prostgles_server_1 = __importDefault(require("prostgles-server"));
const app = express_1.default();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
const io = require("socket.io")(http, {
    path: "/s"
});
http.listen(3001);
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
        password: process.env.POSTGRES_PASSWORD || "api"
    },
    io,
    tsGeneratedTypesDir: path_1.default.join(__dirname + '/'),
    watchSchema: true,
    // transactions: true,	
    publishRawSQL: async (socket, db, _db, user) => {
        // log("set auth logic")
        return true;
    },
    publish: async (socket, dbo, _db, user) => {
        return "*";
    },
    joins: "inferred",
    onReady: async (db, _db) => {
        // await _db.any("CREATE TABLE IF NOT EXISTS ttt(id INTEGER, t TEXT)");
        // // await db.ttt.insert([{ t: "a" }, { t: "b" }]);
        // await db.ttt.update({t: "a"}, { id: -1 })
        // await db.ttt.updateBatch([
        //   [{t: "a"}, { id: -2 }],
        //   [{t: "a"}, { id: -2 }]
        // ])
        // console.log("ok", await db.ttt.count({ t: "z" }), await db.ttt.count({ id: -1 }));
        app.get('*', function (req, res) {
            log(req.originalUrl);
            res.sendFile(path_1.default.join(__dirname + '/index.html'));
        });
        console.log("onReady ", Boolean(db.hehe));
        // if(!db.hehe)	await _db.any("CREATE TABLE hehe(id SERIAL);");
        // setTimeout(() => {
        // 	_db.any("DROP TABLE IF EXISTS hehe;");
        // }, 5000);
    },
});

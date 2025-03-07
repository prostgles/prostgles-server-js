"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
process.on("unhandledRejection", (reason, p) => {
  console.trace("Unhandled Rejection at:", p, "reason:", reason);
  process.exit(1);
});
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
const io = require("socket.io")(http, {
  path: "/teztz/s",
  // maxHttpBufferSize: 1e8, // 100Mb
});
http.listen(process.env.NPORT || 3000);
const log = (msg, extra) => {
  console.log(...["(server): " + msg, extra].filter((v) => v));
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
const connectionString = `postgresql://api:api@localhost/postgres`;
// await db.sql(`
// DROP TABLE USERS;
// CREATE TABLE users (
//   id SERIAL,
//   email TEXT NOT NULL,
//   preferences JSONB,
//   status TEXT,
//   type TEXT
// );
// `);
// type DBGeneratedSchema = any;
// const user = await db.users.find(
//   { type: "admin", status: "active" },
//   { select: { email: 1 } }
// )
// await db.sql(`
// DROP TABLE USERS;
// CREATE TABLE users (
//   id SERIAL,
//   email TEXT NOT NULL,
//   preferences JSONB,
//   status TEXT NOT NULL,
//   type TEXT NOT NULL
// );
// `);
const prostgles_server_1 = __importDefault(require("prostgles-server"));
(0, prostgles_server_1.default)({
  dbConnection: { connectionString },
  tsGeneratedTypesDir: __dirname,
  watchSchema: true,
  onReady: async (db) => {
    await db.users.insert({});
  },
});

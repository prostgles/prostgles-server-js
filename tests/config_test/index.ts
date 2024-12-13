/* Dashboard */
import express from "express";

process.on("unhandledRejection", (reason, p) => {
  console.trace("Unhandled Rejection at:", p, "reason:", reason);
  process.exit(1);
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
http.listen(process.env.NPORT || 3000);

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

import prostgles from "prostgles-server";
import { DBGeneratedSchema } from "./DBoGenerated";

prostgles<DBGeneratedSchema>({
  dbConnection: { connectionString },
  tsGeneratedTypesDir: __dirname,
  watchSchema: true,
  onReady: async (db) => {
    await db.users.insert({});
  },
});



/* Dashboard */
import express from 'express';
import prostgles from "prostgles-server";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
 
const io = require("socket.io")(http, { path: "/" });

http.listen(3009);

prostgles({
  dbConnection: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: +process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || "postgres",
    user: process.env.POSTGRES_USER || "api",
    password:  process.env.POSTGRES_PASSWORD || "api"
  },
  io,
  // tsGeneratedTypesDir: path.join(__dirname + '/'),
  // watchSchema: true,
  // transactions: true,	
  publishRawSQL: async (socket, db: any, _db: any, user: any) => {
    // log("set auth logic")
    return true
  },
  publish: async (socket, dbo: any, _db: any, user: any) => {
    // log("set auth logic")
    return "*";// as unknown as any;
    // return false;
  },
  joins: "inferred",
  onReady: async (db: any, _db: any) => {
    console.log("ok")
  },
});

import path from 'path';
import express from 'express';
import prostgles from "prostgles-server";

process.on('unhandledRejection', (reason, p) => {
  console.trace('Unhandled Rejection at:', p, 'reason:', reason)
  process.exit(1)
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
import _http from "http";
const http = _http.createServer(app);
const io = require("socket.io")(http, { 
  path: "/s" 
});
const port = process.env.NPORT || 3004;
console.log("App listening on port: ", port)
http.listen(port);


prostgles({
  dbConnection: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: +process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || "postgres",
    user: process.env.POSTGRES_USER || "api",
    password:  process.env.POSTGRES_PASSWORD || "api",
    application_name: "manual_test" + Date.now()
  },
  io,
  tsGeneratedTypesDir: path.join(__dirname + '/'),
  watchSchema: s => {
    // console.log(s.command)
  },// "hotReloadMode",
	sqlFilePath: path.join(__dirname+'/init.sql'),
  // transactions: true,	
  joins: "inferred",
  publishRawSQL: async (params) => {
    // log("set auth logic")
    return true
  },
  publish: async (params) => {
     
    return "*" as "*"
    
  },
  onReady: async (db) => {
    app.get('*', function(req, res){
      console.log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		});


    const nestedRow = { name: "nested_insert" };
    const parentRow = { name: "parent insert" }
    // await db.items3.insert({ items_id: nestedRow, items2_id: nestedRow, ...parentRow });
    
    console.log({
      items: await db.items.find(),
      items_multi: await db.items_multi.find(),
    })
    // await _db.any("CREATE TABLE IF NOT EXISTS ttt(id INTEGER, t TEXT)");

    // console.log(await db.various.find({ "id.<": 1423 }) )
    // db.various.subscribe({ "id.<": 1423 }, {}, console.log)
    // console.log(await db.lookup_status.getJoinedTables())
  },
});
 
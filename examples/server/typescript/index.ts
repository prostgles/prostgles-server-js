import path from "path";
import express from "express";
import prostgles from "prostgles-server";
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
http.listen(3001);

prostgles({
  dbConnection: {
    host: "localhost",
    port: 5432,
    database: "postgres",
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD,
  },
  sqlFilePath: path.join(__dirname + "/init.sql"),
  io,
  tsGeneratedTypesDir: path.join(__dirname + "/"),
  publish: () => {
    return "*";
  },
  onReady: async ({ dbo }) => {
    try {
      await dbo.items.insert([{ name: "a" }, { name: "a" }]);
      console.log(await dbo.items.find());
    } catch (err) {
      console.error(err);
    }
  },
});

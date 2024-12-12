import express from "express";
import path from "path";
import prostgles from "prostgles-server";
const app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
http.listen(30009);

import { DBObj } from "./DBoGenerated";

prostgles({
  dbConnection: {
    host: "localhost",
    port: 5432,
    database: "example",
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD,
  },

  sqlFilePath: path.join(__dirname + "/init.sql"),
  io,
  tsGeneratedTypesDir: path.join(__dirname + "/"),
  publish: () => {
    return {
      planes: "*",
    };
  },
  publishMethods: ({ dbo }) => {
    return {
      insertPlanes: async (data) => {
        let res = await dbo.planes.insert(data);
        return res;
      },
    };
  },

  onReady: async (dbo: DBObj) => {
    let plane = await dbo.planes.findOne();

    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname + "/home.html"));
    });

    app.get("*", function (req, res) {
      res.status(404).send("Page not found");
    });
  },
});

import express from "express";
import path from "path";
import prostgles from "prostgles-server";
import http from "http";
import { Server } from "socket.io";
const app = express();
const httpServer = http.createServer(app);
httpServer.listen(30009);
const io = new Server(httpServer, {
  path: "/prgl-api",
});

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
  functions: ({ dbo }) => {
    return {
      insertPlanes: async (data) => {
        let res = await dbo.planes.insert(data);
        return res;
      },
    };
  },

  onReady: async ({ dbo }) => {
    let plane = await dbo.planes.findOne();

    app.get("/", (req, res) => {
      res.sendFile(path.join(__dirname + "/home.html"));
    });

    app.get("*", function (req, res) {
      res.status(404).send("Page not found");
    });
  },
});

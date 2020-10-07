"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const prostgles = require("prostgles-server");
const app = express_1.default();
const http = require('http').createServer(app);
const io = require("socket.io")(http);
http.listen(3001);
prostgles({
    dbConnection: {
        host: "localhost",
        port: 5432,
        database: "postgres",
        user: process.env.PRGL_USER,
        password: process.env.PRGL_PWD
    },
    sqlFilePath: path_1.default.join(__dirname + '/init.sql'),
    io,
    tsGeneratedTypesDir: path_1.default.join(__dirname + '/'),
    publish: (socket, dbo) => "*",
    onReady: async (dbo, db) => {
    },
});
//# sourceMappingURL=index.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* Dashboard */
const express_1 = __importDefault(require("express"));
const prostgles_server_1 = __importDefault(require("prostgles-server"));
const app = express_1.default();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
const io = require("socket.io")(http, { path: "/" });
http.listen(3009);
prostgles_server_1.default({
    dbConnection: {
        host: process.env.POSTGRES_HOST || "localhost",
        port: +process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || "postgres",
        user: process.env.POSTGRES_USER || "api",
        password: process.env.POSTGRES_PASSWORD || "api"
    },
    io,
    // tsGeneratedTypesDir: path.join(__dirname + '/'),
    // watchSchema: true,
    // transactions: true,	
    publishRawSQL: async (socket, db, _db, user) => {
        // log("set auth logic")
        return true;
    },
    publish: async (socket, dbo, _db, user) => {
        // log("set auth logic")
        return "*"; // as unknown as any;
        // return false;
    },
    joins: "inferred",
    onReady: async (db, _db) => {
        console.log("ok");
    },
});

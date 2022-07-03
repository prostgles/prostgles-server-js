"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const prostgles_server_1 = __importDefault(require("prostgles-server"));
process.on('unhandledRejection', (reason, p) => {
    console.trace('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(1);
});
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const _http = require("http");
const http = _http.createServer(app);
const io = require("socket.io")(http, {
    path: "/s"
});
const port = process.env.NPORT || 3004;
console.log("App listening on port: ", port);
http.listen(port);
(0, prostgles_server_1.default)({
    dbConnection: {
        host: process.env.POSTGRES_HOST || "localhost",
        port: +process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || "postgres",
        user: process.env.POSTGRES_USER || "api",
        password: process.env.POSTGRES_PASSWORD || "api",
        application_name: "manual_test" + Date.now()
    },
    io,
    tsGeneratedTypesDir: path_1.default.join(__dirname + '/'),
    watchSchema: s => {
        // console.log(s.command)
    },
    sqlFilePath: path_1.default.join(__dirname + '/init.sql'),
    // transactions: true,	
    joins: "inferred",
    publishRawSQL: async (params) => {
        // log("set auth logic")
        return true;
    },
    publish: async (params) => {
        return "*";
    },
    onReady: async (db) => {
        app.get('*', function (req, res) {
            console.log(req.originalUrl);
            res.sendFile(path_1.default.join(__dirname + '/index.html'));
        });
        const nestedRow = { name: "nested_insert" };
        const parentRow = { name: "parent insert" };
        // await db.items3.insert({ items_id: nestedRow, items2_id: nestedRow, ...parentRow });
        console.log({
            items: await db.items.find(),
            items_multi: await db.items_multi.find(),
        });
        // await _db.any("CREATE TABLE IF NOT EXISTS ttt(id INTEGER, t TEXT)");
        // console.log(await db.various.find({ "id.<": 1423 }) )
        // db.various.subscribe({ "id.<": 1423 }, {}, console.log)
        // console.log(await db.lookup_status.getJoinedTables())
    },
});

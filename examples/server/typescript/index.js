"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
// const prostgles = require("prostgles-server");
const index_1 = __importDefault(require("../../../dist/index"));
const app = express_1.default();
const http = require('http').createServer(app);
const io = require("socket.io")(http);
http.listen(3001);
index_1.default({
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
    transactions: "tt",
    publish: (socket, dbo) => {
        // const dd: DbHandler = {}
        // dd.aad.
        // return {
        // 	items: "*",
        // 	items2: "*"
        // }
        return {};
    },
    onReady: async (dbo, db) => {
        await db.any(`CREATE TABLE IF NOT EXISTS "table" (id text);`);
        await dbo.items.delete({});
        /* Transaction example */
        dbo.tt(async (t) => {
            const r = await t.items.insert({ name: "tr" }, { returning: "*" });
            console.log(r);
            console.log(await t.items.find());
            throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
        });
        console.log(await dbo.items.find()); // Item not present due to transaction block error
    },
});
//# sourceMappingURL=index.js.map
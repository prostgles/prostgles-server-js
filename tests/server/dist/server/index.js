"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const index_1 = __importDefault(require("../../dist/index"));
const app = express_1.default();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { path: "/teztz/s" });
http.listen(3001);
const isomorphic_queries_1 = __importDefault(require("../isomorphic_queries"));
const server_only_queries_1 = __importDefault(require("../server_only_queries"));
const stopTest = (err) => {
    console.log("Stopping server ...");
    if (err)
        console.error(err);
    process.exit(err ? 1 : 0);
};
index_1.default({
    dbConnection: {
        host: process.env.POSTGRES_HOST || "localhost",
        port: +process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || "postgres",
        user: process.env.POSTGRES_USER || "api",
        password: process.env.POSTGRES_PASSWORD || "api"
    },
    sqlFilePath: path_1.default.join(__dirname + '/init.sql'),
    io,
    tsGeneratedTypesDir: path_1.default.join(__dirname + '/'),
    watchSchema: true,
    transactions: true,
    onSocketConnect: (socket) => {
        if (process.env.TEST_TYPE === "client") {
            socket.on("stop-test", (err, cb) => {
                cb();
                stopTest(err);
            });
        }
        return true;
    },
    // DEBUG_MODE: true,
    publishRawSQL: async (socket, dbo, db, user) => {
        return true; // Boolean(user && user.type === "admin")
    },
    publish: (socket, dbo) => {
        // return "*";
        return {
            items: "*",
            items2: "*",
            items3: "*",
            planes: {
                select: "*",
                update: "*",
                insert: "*",
                delete: "*",
                sync: {
                    id_fields: ["id"],
                    synced_field: "last_updated"
                }
            },
        };
        // return {
        // 	items: {
        // 		select: {
        // 			fields: "*",
        // 			forcedFilter: {
        // 				$exists: { items3: { name: "a" } }
        // 			}
        // 		}
        // 	}
        // };
    },
    // joins: "inferred",
    joins: [
        {
            tables: ["items", "items2"],
            on: { name: "name" },
            type: "many-many"
        },
        {
            tables: ["items2", "items3"],
            on: { name: "name" },
            type: "many-many"
        }
    ],
    onReady: async (db, _db) => {
        app.get('*', function (req, res) {
            console.log(req.originalUrl);
            res.sendFile(path_1.default.join(__dirname + '/index.html'));
        });
        try {
            if (process.env.TEST_TYPE === "client") {
                console.log("Waiting for client...");
                io.on("connection", socket => {
                    socket.emit("start-test");
                    console.log("Client connected");
                });
            }
            else if (process.env.TEST_TYPE === "server") {
                await isomorphic_queries_1.default(db);
                console.log("Server isomorphic tests successful");
                await server_only_queries_1.default(db);
                console.log("Server-only query tests successful");
                stopTest();
            }
        }
        catch (err) {
            stopTest(err);
        }
    },
});
function randElem(items) {
    return items[Math.floor(Math.random() * items.length)];
}
//# sourceMappingURL=index.js.map
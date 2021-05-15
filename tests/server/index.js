"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const prostgles_server_1 = __importDefault(require("prostgles-server"));
const app = express_1.default();
const http = require('http').createServer(app);
const { exec } = require('child_process');
const clientTest = (process.env.TEST_TYPE === "client");
const io = !clientTest ? undefined : require("socket.io")(http, { path: "/teztz/s" });
http.listen(3001);
const isomorphic_queries_1 = __importDefault(require("../isomorphic_queries"));
const server_only_queries_1 = __importDefault(require("../server_only_queries"));
const log = (msg, extra) => {
    console.log(...["(server): " + msg, extra].filter(v => v));
};
const stopTest = (err) => {
    log("Stopping server ...");
    if (err)
        console.error(err);
    process.exit(err ? 1 : 0);
};
const sessions = [];
const users = [{ id: "1a", username: "john", password: "secret" }];
process.on('unhandledRejection', (reason, p) => {
    console.trace('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(1);
});
prostgles_server_1.default({
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
    // DEBUG_MODE: true,
    // onNotice: console.log,
    onSocketConnect: (socket) => {
        log("onSocketConnect");
        if (clientTest) {
            log("Client connected");
            socket.emit("start-test", { server_id: Math.random() });
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
    auth: {
        sidQueryParamName: "token",
        getClientUser: async ({ sid }) => {
            if (sid) {
                const s = sessions.find(s => s.id === sid);
                if (s) {
                    const u = users.find(u => s && s.user_id === u.id);
                    if (u)
                        return { sid: s.id, uid: u.id };
                }
            }
            return null;
        },
        getUser: async ({ sid }) => {
            if (sid) {
                const s = sessions.find(s => s.id === sid);
                if (s)
                    return users.find(u => s && s.user_id === u.id);
            }
            return null;
        },
        login: async ({ username, password } = {}) => {
            const u = users.find(u => u.username === username && u.password === password);
            if (!u)
                throw "something went wrong: " + JSON.stringify({ username, password });
            let s = sessions.find(s => s.user_id === u.id);
            if (!s) {
                s = { id: "SID" + Date.now(), user_id: u.id };
                sessions.push(s);
            }
            log("Logged in!");
            return { sid: s.id, expires: Infinity };
        }
    },
    publishMethods: async (socket, dbo, db, user) => {
        return {
            get: () => 222
        };
    },
    publish: async (socket, dbo, db, user) => {
        return {
            items: "*",
            items2: "*",
            items3: "*",
            v_items: "*",
            various: "*",
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
            items4: {
                select: user ? "*" : {
                    fields: { name: 0 },
                    forcedFilter: { name: "abc" }
                },
                insert: "*",
                update: "*",
                delete: "*"
            },
            items4_pub: "*",
            "*": {
                select: { fields: { "*": 0 } },
                insert: "*",
                update: "*",
            },
            [`"*"`]: {
                select: { fields: { [`"*"`]: 0 } },
                insert: "*",
                update: "*",
            }
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
            log(req.originalUrl);
            res.sendFile(path_1.default.join(__dirname + '/index.html'));
        });
        try {
            if (process.env.TEST_TYPE === "client") {
                const clientPath = `cd ${__dirname}/../client && npm test`;
                exec(clientPath, console.log);
                log("Waiting for client...");
            }
            else if (process.env.TEST_TYPE === "server") {
                await isomorphic_queries_1.default(db);
                log("Server isomorphic tests successful");
                await server_only_queries_1.default(db);
                log("Server-only query tests successful");
                stopTest();
            }
            else {
                // await db.items4.delete();
                // await db.items4.insert([
                // 	{ name: "abc", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
                // 	{ name: "abc", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
                // 	{ name: "abcd", public: "public data d", added: new Date('04 Dec 1996 00:12:00 GMT') }
                // ]);
                const v1 = await db.items.insert([{ name: "a" }, { name: "z" }, { name: "b" }]);
                await db.items2.insert([{ name: "a", items_id: 1 }]);
                await db.items2.insert([{ name: "a", items_id: 1 }]);
                await db.items2.insert([{ name: "b", items_id: 2 }]);
                await db.items2.insert([{ name: "b", items_id: 2 }]);
                await db.items2.insert([{ name: "b", items_id: 2 }]);
                await db.items3.insert([{ name: "a" }, { name: "za123" }]);
                const MonAgg = await db.items.find({}, { select: {
                        name: 1,
                        items2: { count: { $count: ["id"] } },
                    } });
                console.log(JSON.stringify(MonAgg, null, 2));
                await _db.any("DROP TABLE IF EXISTS tt; ");
                await _db.any("DROP TABLE IF EXISTS tt; CREATE TABLE tt(id serial);");
                // await _db.any("DROP EXTENSION IF EXISTS pgcrypto; CREATE EXTENSION pgcrypto;")
                // console.log(await db.items4.findOne({}, { select: { public: { "$ts_headline": ["public", "public"] } } }))
            }
        }
        catch (err) {
            console.trace(err);
            if (process.env.TEST_TYPE) {
                stopTest(err);
            }
        }
    },
});
function randElem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

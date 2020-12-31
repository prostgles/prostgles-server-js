var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
define("client_only_queries", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    async function client_only(db) {
        return new Promise(async (resolve, reject) => {
            let start = Date.now();
            await db.planes.delete();
            let inserts = new Array(100).fill(null).map((d, i) => ({ id: i, flight_number: `FN${i}`, x: Math.random(), y: i }));
            await db.planes.insert(inserts);
            db.planes.sync({}, { handlesOnData: true, patchText: true }, planes => {
                // console.log(0, planes.length)
                planes.map(p => {
                    // if(p.y === 1) window.up = p;
                    if (p.x < 10)
                        p.$update({ x: 10 });
                });
                if (planes.filter(p => p.x == 20).length === 100) {
                    // console.log(22)
                    // console.timeEnd("test")
                    console.log("Finished replication test. Inserting 100 rows then updating two times took: " + (Date.now() - start) + "ms");
                    resolve(true);
                }
            });
            const sP = await db.planes.subscribe({ x: 10 }, {}, async (planes) => {
                // console.log(1, planes[0])
                if (planes.filter(p => p.x == 10).length === 100) {
                    // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(console.log);
                    await db.planes.update({}, { x: 20, last_updated: Date.now() });
                    // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(console.log)
                    sP.unsubscribe();
                }
            });
            // assert.deepStrictEqual(fo,    { h: null, id: 1, name: 'a' }, "findOne query failed" );
            // assert.deepStrictEqual(f[0],  { h: null, id: 1, name: 'a' }, "findOne query failed" );
        });
    }
    exports.default = client_only;
});
define("client/index", ["require", "exports", "prostgles-client", "socket.io-client", "isomorphic_queries", "client_only_queries", "prostgles-client/dist/prostgles"], function (require, exports, prostgles_client_1, socket_io_client_1, isomorphic_queries_1, client_only_queries_1, prostgles_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    prostgles_client_1 = __importDefault(prostgles_client_1);
    socket_io_client_1 = __importDefault(socket_io_client_1);
    isomorphic_queries_1 = __importDefault(isomorphic_queries_1);
    client_only_queries_1 = __importDefault(client_only_queries_1);
    Object.defineProperty(exports, "DBHandlerClient", { enumerable: true, get: function () { return prostgles_1.DBHandlerClient; } });
    const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001", path = process.env.PRGL_CLIENT_PATH || "/teztz/s", socket = socket_io_client_1.default(url, { path }), stopTest = (err) => {
        socket.emit("stop-test", !err ? err : { err: err.toString() }, cb => {
            console.log("Stopping client...");
            if (err)
                console.error(err);
            setTimeout(() => {
                process.exit(err ? 1 : 0);
            }, 1000);
        });
    };
    try {
        socket.on("start-test", () => {
            prostgles_client_1.default({
                socket,
                onReconnect: (socket) => {
                },
                onReady: async (db, methods) => {
                    try {
                        await isomorphic_queries_1.default(db);
                        console.log("Client isomorphic tests successful");
                        await client_only_queries_1.default(db);
                        console.log("Client-only replication tests successful");
                        stopTest();
                    }
                    catch (err) {
                        stopTest(err);
                    }
                }
            });
        });
    }
    catch (e) {
        stopTest(e);
    }
});
define("isomorphic_queries", ["require", "exports", "assert"], function (require, exports, assert_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    async function isomorphic(db) {
        await db.items.delete({});
        await db.items2.delete({});
        await db.items3.delete({});
        // setTimeout(async () => {
        // 	await db.any("DROP TABLE IF EXISTS tt; CREATE TABLE tt(id serial);");
        // }, 500)
        /* Exists filter example */
        await db.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
        await db.items2.insert([{ name: "a", items_id: 1 }]);
        await db.items3.insert([{ name: "a" }]);
        const fo = await db.items.findOne(), f = await db.items.find();
        assert_1.strict.deepStrictEqual(fo, { h: null, id: 1, name: 'a' }, "findOne query failed");
        assert_1.strict.deepStrictEqual(f[0], { h: null, id: 1, name: 'a' }, "findOne query failed");
        // return;
        const expect0 = await db.items.count({
            $and: [
                { $exists: { items2: { name: "a" } } },
                { $exists: { items3: { name: "b" } } },
            ]
        });
        assert_1.strict.equal(expect0, 0, "$exists query failed");
        /* joinsTo filter example */
        const expect2 = await db.items.find({
            $and: [
                { $existsJoined: { "**.items3": { name: "a" } } },
                { $existsJoined: { items2: { name: "a" } } }
            ]
        });
        assert_1.strict.equal(expect2.length, 2, "$existsJoined query failed");
        /* exists with exact path filter example */
        const _expect2 = await db.items.find({
            $and: [
                // { "items2": { name: "a" } },
                // { "items2.items3": { name: "a" } },
                { $existsJoined: { items2: { name: "a" } } }
            ]
        });
        assert_1.strict.equal(_expect2.length, 2, "$existsJoined query failed");
        /* Upsert */
        await db.items.upsert({ name: "tx" }, { name: "tx" });
        await db.items.upsert({ name: "tx" }, { name: "tx" });
        assert_1.strict.equal(await db.items.count({ name: "tx" }), 1, "upsert command failed");
        /* Aggregate functions example */
        const aggs = await db.items.findOne({}, {
            select: {
                id: "$count",
                max_id: { $max: "id" },
                total: { $count: ["id"] },
                distinct_names: { $countDistinct: ["name"] },
            },
            orderBy: {
                max_id: -1
            }
        });
        assert_1.strict.deepStrictEqual(aggs, { id: '4', max_id: 4, total: '4', distinct_names: '3' }, "Aggregation query failed");
        /* Joins example */
        const items = await db.items.find({}, {
            select: {
                "*": 1,
                items3: "*",
                items22: db.leftJoin.items2({}, "*")
            }
        });
        if (!items.length || !items.every(it => Array.isArray(it.items3) && Array.isArray(it.items22))) {
            console.log(items[0].items3);
            throw "Joined select query failed";
        }
        const rowhash = await db.items.findOne({}, { select: { $rowhash: 1 } });
        if (typeof rowhash.$rowhash !== "string")
            throw "$rowhash query failed";
    }
    exports.default = isomorphic;
});
define("server_only_queries", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    async function f(db) {
        /* Transaction example */
        await db.tx(async (t) => {
            await t.items.insert({ name: "tx_" });
            const expect1 = await t.items.count({ name: "tx_" });
            const expect0 = await db.items.count({ name: "tx_" });
            if (expect0 !== 0 || expect1 !== 1)
                throw "db.tx failed";
            //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
        });
        const expect1 = await db.items.count({ name: "tx_" });
        if (expect1 !== 1)
            throw "db.tx failed";
    }
    exports.default = f;
});
define("server/index", ["require", "exports", "path", "express", "../../dist/index", "isomorphic_queries", "server_only_queries"], function (require, exports, path_1, express_1, index_1, isomorphic_queries_2, server_only_queries_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    path_1 = __importDefault(path_1);
    express_1 = __importDefault(express_1);
    index_1 = __importDefault(index_1);
    isomorphic_queries_2 = __importDefault(isomorphic_queries_2);
    server_only_queries_1 = __importDefault(server_only_queries_1);
    const app = express_1.default();
    const http = require('http').createServer(app);
    const io = require("socket.io")(http, { path: "/teztz/s" });
    http.listen(3001);
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
                    await isomorphic_queries_2.default(db);
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
});
//# sourceMappingURL=index.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const prostgles_server_1 = __importDefault(require("prostgles-server"));
// import prostgles from "../dist/index";
const app = express_1.default();
const http = require('http').createServer(app);
const io = require("socket.io")(http); //, { path: "/teztz" });
http.listen(3000);
prostgles_server_1.default({
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
    // transactions: true,
    publish: "*",
    // (socket, dbo: DBObj) => {
    // 	return "*";
    // },
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
    onReady: async (dbo, db) => {
        app.get('*', function (req, res) {
            console.log(req.originalUrl);
            res.sendFile(path_1.default.join(__dirname + '/index.html'));
        });
        try {
            await dbo.items.delete({});
            await dbo.items2.delete({});
            // await dbo.items3.delete({ });
            /* Exists filter example */
            await dbo.items.insert([{ name: "a" }, { name: "a" }]);
            await dbo.items2.insert([{ name: "a" }]);
            await dbo.items3.insert([{ name: "a" }]);
            const expect2 = await dbo.items.count({
                $and: [
                    { $exists: { items3: { name: "a" } } },
                    { $exists: { items2: { name: "a" } } }
                ]
            });
            if (expect2 !== 2)
                throw "$exists query failed";
            /* Transaction example */
            // await dbo.tx(async t => {
            //   await t.items.insert({ name: "tx" });
            //   const expect1 = await t.items.count({ name: "tx" });
            //   const expect0 = await dbo.items.count({ name: "tx" });
            //   if(expect0 !== 0 || expect1 !== 1) throw "dbo.tx failed";
            //   //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
            // });
            // const expect1 = await dbo.items.count({ name: "tx" });
            // if(expect1 !== 1) throw "dbo.tx failed";
            const aggs = await dbo.items.findOne({}, {
                select: {
                    id: "$count",
                    total: { $count: ["id"] },
                    distinct_names: { $countDistinct: ["name"] },
                }
            });
            // const { id, total, distinct_names } = aggs;
            // console.log(JSON.stringify(expect3O) === `{ id: '3', total: '3' }`, expect3O)
            console.log("All tests successful");
        }
        catch (err) {
            console.error(err);
        }
    },
});
//# sourceMappingURL=index.js.map
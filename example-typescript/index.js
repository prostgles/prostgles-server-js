"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app = express_1.default();
const path_1 = __importDefault(require("path"));
var http = require('http').createServer(app);
var io = require("socket.io")(http);
http.listen(3000);
var fs = require('fs');
// import * as Prostgles from "../dist/index.js";
// Prostgles({ io, dbConnection: {  }})
// console.log(Prostgles({}));
// Prostgles({ })
var prostgles = require("../dist/index");
prostgles({
    dbConnection: {
        host: "localhost",
        port: "5432",
        user: process.env.PRGL_USER,
        password: process.env.PRGL_PWD
    },
    dbOptions: {
        application_name: "prostgles_api",
        max: 100,
        poolIdleTimeout: 10000
    },
    sqlFilePath: path_1.default.join(__dirname + '/init.sql'),
    io,
    tsGeneratedTypesDir: path_1.default.join(__dirname + '/'),
    publish: ({ socket, dbo }) => {
        // if(!socket || !socket._user.admin && !socket._user.id){
        // 	return false;
        // }
        return {
            pixels: "*",
        };
    },
    publishMethods: ({ socket, dbo }) => {
        return {
            insertPixel: (data) => __awaiter(void 0, void 0, void 0, function* () {
                // let  tl = Date.now();
                let res = yield dbo.pixels.insert(data);
                // console.log(Date.now() - tl, "ms");
                return res;
            })
        };
    },
    isReady: (dbo) => __awaiter(void 0, void 0, void 0, function* () {
        let d = dbo;
        /* Benchmarking 10000 inserts */
        var tl = Date.now(), inserts = [];
        for (var i = 0; i < 10000; i++) {
            const data = { rgb: "black", xy: `${Math.random() * 400};${Math.random() * 400}` };
            inserts.push(data);
        }
        yield dbo.pixels.insert(inserts);
        console.log(Date.now() - tl, "ms");
        dbo.pixels.count({}).then(console.log);
        app.get('/', (req, res) => {
            res.sendFile(path_1.default.join(__dirname + '/home.html'));
        });
        app.get('*', function (req, res) {
            res.status(404).send('Page not found');
        });
    }),
});
//# sourceMappingURL=index.js.map
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const Prostgles = __importStar(require("../dist/index.js"));
var prostgles = require("prostgles-server");
// Prostgles({ io, dbConnection: {  }})
console.log(Prostgles);
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
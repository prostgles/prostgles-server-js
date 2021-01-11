"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prostgles_client_1 = __importDefault(require("prostgles-client"));
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const isomorphic_queries_1 = __importDefault(require("../isomorphic_queries"));
const client_only_queries_1 = __importDefault(require("../client_only_queries"));
const start = Date.now();
const log = (msg, extra) => {
    console.log(`(client) t+ ${(Date.now() - start)}ms ` + msg, extra);
};
log("Started client...");
const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001", path = process.env.PRGL_CLIENT_PATH || "/teztz/s", socket = socket_io_client_1.default(url, { path }), stopTest = (err) => {
    socket.emit("stop-test", !err ? err : { err: err.toString() }, cb => {
        log("Stopping client...");
        if (err)
            console.error(err);
        setTimeout(() => {
            process.exit(err ? 1 : 0);
        }, 1000);
    });
};
try {
    /* TODO find out why connection does not happen on rare occasions*/
    socket.on("connected", () => {
        log("Client connected.");
    });
    socket.on("connect", () => {
        log("Client connect.");
    });
    socket.on("start-test", () => {
        prostgles_client_1.default({
            socket,
            onReconnect: (socket) => {
                log("Reconnected");
            },
            onReady: async (db, methods, fullSchema, auth) => {
                log("onReady.auth", auth);
                try {
                    await isomorphic_queries_1.default(db);
                    log("Client isomorphic tests successful");
                    await client_only_queries_1.default(db, auth, log);
                    log("Client-only replication tests successful");
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

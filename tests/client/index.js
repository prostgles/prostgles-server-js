"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prostgles_client_1 = __importDefault(require("prostgles-client"));
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const isomorphic_queries_1 = __importDefault(require("../isomorphic_queries"));
const url = process.env.PRGL_CLIENT_URL || "http://127.0.0.1:3001", path = process.env.PRGL_CLIENT_PATH || "/teztz/s", socket = socket_io_client_1.default(url, { path });
socket.on("start-test", () => {
    prostgles_client_1.default({
        socket,
        onReconnect: (socket) => {
        },
        onReady: async (db, methods) => {
            try {
                await isomorphic_queries_1.default(db);
                console.log("Client tests successful");
                socket.emit("stop-test");
                process.exit(0);
            }
            catch (err) {
                socket.emit("stop-test", { err: err.toString() });
                console.error(err);
                process.exit(1);
            }
        }
    });
});
//# sourceMappingURL=index.js.map
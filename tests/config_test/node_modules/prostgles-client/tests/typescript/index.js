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
const socket_io_client_1 = __importDefault(require("socket.io-client"));
const prostgles_full_1 = __importDefault(require("../../dist/prostgles-full"));
const socket = socket_io_client_1.default("http://localhost:3001", { path: "/teztz" });
// console.log(socket)
prostgles_full_1.default({
    socket,
    onReady: (db) => __awaiter(void 0, void 0, void 0, function* () {
        console.log(db.items);
    })
});
//# sourceMappingURL=index.js.map
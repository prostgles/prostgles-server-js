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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DBEventsManager = void 0;
const PostgresNotifListenManager_1 = require("./PostgresNotifListenManager");
const prostgles_types_1 = require("prostgles-types");
class DBEventsManager {
    constructor(db_pg, pgp) {
        this.notifies = {};
        this.notice = {
            socketChannel: prostgles_types_1.CHANNELS.NOTICE_EV,
            socketUnsubChannel: prostgles_types_1.CHANNELS.NOTICE_EV + "unsubscribe",
            sockets: []
        };
        this.onNotif = ({ channel, payload }) => {
            // console.log(36, { channel, payload },  Object.keys(this.notifies));
            Object.keys(this.notifies)
                .filter(ch => ch === channel)
                .map(ch => {
                const sub = this.notifies[ch];
                sub.sockets.map(s => {
                    s.emit(sub.socketChannel, payload);
                });
                sub.localFuncs.map(lf => {
                    lf(payload);
                });
            });
        };
        this.onNotice = notice => {
            if (this.notice && this.notice.sockets.length) {
                this.notice.sockets.map(s => {
                    s.emit(this.notice.socketChannel, notice);
                });
            }
        };
        this.getNotifChannelName = (channel) => __awaiter(this, void 0, void 0, function* () {
            const c = yield this.db_pg.one("SELECT quote_ident($1) as c", channel);
            return c.c;
        });
        this.db_pg = db_pg;
        this.pgp = pgp;
    }
    addNotify(query, socket, func) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof query !== "string" || (!socket && !func)) {
                throw "Expecting (query: string, socket?, localFunc?) But received: " + JSON.stringify({ query, socket, func });
            }
            /* Remove comments */
            let q = query.trim()
                .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '\n')
                .split("\n").map(v => v.trim()).filter(v => v && !v.startsWith("--"))
                .join("\n");
            /* Find the notify channel name */
            if (!q.toLowerCase().startsWith("listen")) {
                throw "Expecting a LISTEN query but got: " + query;
            }
            q = q.slice(7).trim(); // Remove listen
            if (q.endsWith(";"))
                q = q.slice(0, -1);
            if (q.startsWith('"') && q.endsWith('"')) {
                q = q.slice(1, -1);
            }
            else {
                /* Replicate PG by lowercasing identifier if not quoted */
                q = q.toLowerCase();
            }
            q = q.replace(/""/g, `"`);
            let channel = q;
            let notifChannel = yield this.getNotifChannelName(channel);
            notifChannel = notifChannel.replace(/""/g, `"`);
            if (notifChannel.startsWith('"'))
                notifChannel = notifChannel.slice(1, -1);
            let socketChannel = prostgles_types_1.CHANNELS.LISTEN_EV + notifChannel;
            if (!this.notifies[notifChannel]) {
                this.notifies[notifChannel] = {
                    socketChannel,
                    sockets: socket ? [socket] : [],
                    localFuncs: func ? [func] : [],
                    notifMgr: new PostgresNotifListenManager_1.PostgresNotifListenManager(this.db_pg, this.onNotif, channel)
                };
            }
            else {
                if (socket && !this.notifies[notifChannel].sockets.find(s => s.id === socket.id)) {
                    this.notifies[notifChannel].sockets.push(socket);
                }
                else if (func) {
                    this.notifies[notifChannel].localFuncs.push(func);
                }
            }
            return {
                unsubscribe: () => this.removeNotify(notifChannel, socket, func),
                socketChannel,
                socketUnsubChannel: socketChannel + "unsubscribe",
                notifChannel,
            };
        });
    }
    removeNotify(channel, socket, func) {
        if (this.notifies[channel]) {
            if (socket) {
                this.notifies[channel].sockets = this.notifies[channel].sockets.filter(s => s.id !== socket.id);
            }
            else if (func) {
                this.notifies[channel].localFuncs = this.notifies[channel].localFuncs.filter(f => f !== func);
            }
        }
    }
    addNotice(socket) {
        if (!socket || !socket.id)
            throw "Expecting a socket obj with id";
        if (!this.notice.sockets.find(s => s.id === socket.id)) {
            this.notice.sockets.push(socket);
        }
        return {
            socketChannel: this.notice.socketChannel,
            socketUnsubChannel: this.notice.socketUnsubChannel,
        };
    }
    removeNotice(socket) {
        if (!socket || !socket.id)
            throw "Expecting a socket obj with id";
        this.notice.sockets = this.notice.sockets.filter(s => s.id !== socket.id);
    }
}
exports.DBEventsManager = DBEventsManager;
//# sourceMappingURL=DBEventsManager.js.map
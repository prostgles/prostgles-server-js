"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushSubData = void 0;
const subscribe_1 = require("../DboBuilder/subscribe");
const PubSubManager_1 = require("./PubSubManager");
async function pushSubData(sub, err) {
    if (!sub)
        throw "pushSubData: invalid sub";
    const { socket_id, channel_name } = sub; //, subOne = false 
    const localFuncs = (0, subscribe_1.parseLocalFuncs)(sub.localFuncs);
    sub.last_throttled = Date.now();
    if (err) {
        if (socket_id) {
            this.sockets[socket_id].emit(channel_name, { err });
        }
        return true;
    }
    return new Promise(async (resolve, reject) => {
        /* TODO: Retire subOne -> it's redundant */
        const { data, err } = await this.getSubData(sub);
        if (data) {
            if (socket_id && this.sockets[socket_id]) {
                (0, PubSubManager_1.log)("Pushed " + data.length + " records to sub");
                this.sockets[socket_id].emit(channel_name, { data }, () => {
                    resolve(data);
                });
                /* TO DO: confirm receiving data or server will unsubscribe
                  { data }, (cb)=> { console.log(cb) });
                */
            }
            else if (localFuncs) {
                localFuncs.onData(data);
                resolve(data);
            }
            sub.last_throttled = Date.now();
        }
        else {
            const errObj = { _err_msg: err.toString(), err };
            if (socket_id && this.sockets[socket_id]) {
                this.sockets[socket_id].emit(channel_name, { err: errObj });
            }
            else if (localFuncs) {
                if (!localFuncs.onError) {
                    console.error("Uncaught subscription error", err);
                }
                localFuncs.onError?.(errObj);
            }
            reject(errObj);
        }
    });
}
exports.pushSubData = pushSubData;
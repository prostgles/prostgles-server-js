"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addSub = void 0;
const PubSubManager_1 = require("./PubSubManager");
/* Must return a channel for socket */
/* The distinct list of {table_name, condition} must have a corresponding trigger in the database */
async function addSub(subscriptionParams) {
    const { socket, localFuncs, table_rules, filter = {}, params = {}, condition = "", throttle = 0, //subOne = false, 
    viewOptions, table_info, throttleOpts, } = subscriptionParams || {};
    const table_name = table_info.name;
    if (!socket && !localFuncs) {
        throw "socket AND func missing";
    }
    if (socket && localFuncs) {
        throw "addSub: cannot have socket AND func";
    }
    let validated_throttle = subscriptionParams.throttle || 10;
    const pubThrottle = table_rules?.subscribe?.throttle || 0;
    if (pubThrottle && Number.isInteger(pubThrottle) && pubThrottle > 0) {
        validated_throttle = pubThrottle;
    }
    if (throttle && Number.isInteger(throttle) && throttle >= pubThrottle) {
        validated_throttle = throttle;
    }
    const channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.${JSON.stringify(params)}.${"m"}.sub`;
    const mainTrigger = {
        table_name: table_name,
        condition: (0, PubSubManager_1.parseCondition)(condition),
        is_related: false,
    };
    const newSub = {
        channel_name,
        filter,
        localFuncs,
        params,
        last_throttled: 0,
        socket,
        throttleOpts,
        table_info,
        is_ready: true,
        is_throttling: false,
        socket_id: socket?.id,
        table_rules,
        throttle: validated_throttle,
        triggers: [
            mainTrigger
        ]
    };
    const result = {
        channelName: channel_name,
        channelNameReady: channel_name + ".ready",
        channelNameUnsubscribe: channel_name + ".unsubscribe"
    };
    const [matchingSub] = this.getSubs(mainTrigger.table_name, mainTrigger.condition, newSub, true);
    if (matchingSub) {
        console.error("Trying to add a duplicate sub for: ", channel_name);
        return result;
    }
    this.upsertSocket(socket);
    // const upsertSub = _upsertSub.bind(this);
    if (viewOptions) {
        for await (const relatedTable of viewOptions.relatedTables) {
            const relatedSub = {
                table_name: relatedTable.tableName,
                condition: (0, PubSubManager_1.parseCondition)(relatedTable.condition),
                is_related: true,
            };
            newSub.triggers.push(relatedSub);
            await this.addTrigger(relatedSub, viewOptions);
        }
    }
    if (localFuncs) {
        this.pushSubData(newSub);
    }
    else if (socket) {
        const removeListeners = () => {
            socket.removeAllListeners(channel_name);
            socket.removeAllListeners(result.channelNameReady);
            socket.removeAllListeners(result.channelNameUnsubscribe);
        };
        removeListeners();
        socket.once(result.channelNameReady, () => {
            this.pushSubData(newSub);
        });
        socket.once(result.channelNameUnsubscribe, (_data, cb) => {
            const res = "ok"; // this.onSocketDisconnected({ socket, subChannel: channel_name });
            this.subs = this.subs.filter(s => {
                const isMatch = s.socket && s.socket.id === socket.id && s.channel_name === channel_name;
                return !isMatch;
            });
            removeListeners();
            cb(null, { res });
        });
    }
    this.subs.push(newSub);
    /** A view does not have triggers. Only related triggers */
    if (table_info.is_view) {
        if (!viewOptions?.relatedTables.length) {
            throw "PubSubManager: view parent_tables missing";
        }
    }
    else {
        await this.addTrigger(mainTrigger);
    }
    return result;
}
exports.addSub = addSub;
// const _upsertSub = async function(
//   this: PubSubManager, 
//   newSubData: {
//     table_name: string; 
//     condition: string; 
//     is_ready: boolean; 
//     channel_name: string;
//     viewOptions: SubscriptionParams["viewOptions"];
//   },
//   consumer: Pick<SubscriptionParams, "channel_name" | "socket" | "func">,
//   isReadyOverride: boolean | undefined
// ){
//   const { table_name, condition: _cond, is_ready = false, viewOptions } = newSubData;
//   const { channel_name, func, socket } = consumer;
//   const condition = parseCondition(_cond);
//   const newSub: SubscriptionParams = {
//       socket,
//       table_name,
//       filter,
//       params,
//       table_rules,
//       channel_name,
//       parentSubParams,
//       func: func ?? undefined,
//       socket_id: socket?.id,
//       throttle: validated_throttle,
//       is_throttling: null,
//       last_throttled: 0,
//       is_ready,
//     };
//   this.subs[table_name] = this.subs[table_name] ?? {};
//   this.subs[table_name]![condition] = this.subs[table_name]![condition] ?? { subs: [] };
//   this.subs[table_name]![condition]!.subs = this.subs[table_name]![condition]!.subs ?? [];
//   // console.log("1034 upsertSub", this.subs)
//   const sub_idx = this.subs[table_name]![condition]!.subs.findIndex(s =>
//     s.channel_name === channel_name &&
//     (
//       socket && s.socket_id === socket.id ||
//       func && s.func === func
//     ) && 
//     JSON.stringify(s.viewOptions) === JSON.stringify((subscriptionParams.viewOptions)
//   ));
//   if (sub_idx < 0) {
//     this.subs[table_name]![condition]!.subs.push(newSub);
//     if (socket) {
//       const chnUnsub = channel_name + "unsubscribe";
//       socket.removeAllListeners(chnUnsub);
//       socket.once(chnUnsub, (_data: any, cb: BasicCallback) => {
//         const res = this.onSocketDisconnected({ socket, subChannel: channel_name });
//         cb(null, { res });
//       });
//     }
//   } else {
//     this.subs[table_name]![condition]!.subs[sub_idx] = newSub;
//   }
//   if (isReadyOverride ?? is_ready) {
//     this.pushSubData(newSub);
//   }
// };

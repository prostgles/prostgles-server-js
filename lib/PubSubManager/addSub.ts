import { BasicCallback, parseCondition, PubSubManager, Subscription, SubscriptionParams } from "./PubSubManager";

type AddSubscriptionParams = SubscriptionParams & {
  condition: string;
}

/* Must return a channel for socket */
/* The distinct list of {table_name, condition} must have a corresponding trigger in the database */
export async function addSub(this: PubSubManager, subscriptionParams: Omit<AddSubscriptionParams, "channel_name" | "parentSubParams">) {
  const {
    socket, func, table_rules, filter = {},
    params = {}, condition = "", throttle = 0,  //subOne = false, 
    viewOptions, table_info,
  } = subscriptionParams || {};
  
  const table_name = table_info.name;

  if (!socket && !func) {
    throw "socket AND func missing";
  }
  if (socket && func) {
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

  this.upsertSocket(socket);

  // const upsertSub = _upsertSub.bind(this);

  const newSub: Subscription = {
    channel_name,
    filter,
    func,
    params,
    last_throttled: 0,
    socket,
    table_info,
    is_ready: true,
    is_throttling: false,
    socket_id: socket?.id,
    table_rules,
    throttle: validated_throttle,
    triggers: [
      {
        table_name: table_name,
        condition: parseCondition(condition),
        is_related: false,
      }
    ]
  }

  if(viewOptions){
    for await(const relatedTable of viewOptions.relatedTables){
      const relatedSub = {
        table_name: relatedTable.tableName,
        condition: parseCondition(relatedTable.condition),
        is_related: true,
      } as const;

      newSub.triggers.push(relatedSub)
  
      await this.addTrigger(relatedSub, viewOptions);      
    }

  }

  setTimeout(() => {
    this.pushSubData(newSub);
  }, 1);

  if (socket) {
    const chnUnsub = channel_name + "unsubscribe";
    socket.removeAllListeners(chnUnsub);
    socket.once(chnUnsub, (_data: any, cb: BasicCallback) => {
      const res = "ok";// this.onSocketDisconnected({ socket, subChannel: channel_name });
      this.subs = this.subs.filter(s => {
        const isMatch = s.socket && s.socket.id === socket.id && s.channel_name === channel_name;
        return !isMatch;
      });
      socket.removeAllListeners(channel_name);
      socket.removeAllListeners(chnUnsub);
      cb(null, { res });
    });
  }

  this.subs.push(newSub);

  /** A view does not have triggers. Only related triggers */
  if (table_info.is_view) {
    if (!viewOptions?.relatedTables.length) {
      throw "PubSubManager: view parent_tables missing";
    }
    return channel_name;
  }

  /* Just a table, add table + condition trigger */
  // console.log(table_info, 202);

  await this.addTrigger({
    table_name: table_info.name,
    condition: parseCondition(condition),
  });

  return channel_name;
}

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
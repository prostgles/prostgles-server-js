import { parseLocalFuncs } from "../DboBuilder/ViewHandler/subscribe";
import { log, PubSubManager, Subscription } from "./PubSubManager";

export async function pushSubData(this: PubSubManager, sub: Subscription, err?: any) {
  if (!sub) throw "pushSubData: invalid sub";

  const { socket_id, channel_name } = sub;
  if(!this.subs.some(s => s.channel_name === channel_name)){
    // Might be throttling a sub that was removed
    return;
  }
  const localFuncs = parseLocalFuncs(sub.localFuncs);

  if (err) {
    if (socket_id) {
      this.sockets[socket_id].emit(channel_name, { err });
    }
    return true;
  }

  return new Promise(async (resolve, reject) => {
    /* TODO: Retire subOne -> it's redundant */
    
    const { data, err } = await this.getSubData(sub);

    if(data){

      if (socket_id && this.sockets[socket_id]) {
        log("Pushed " + data.length + " records to sub")
        this.sockets[socket_id].emit(channel_name, { data }, () => {
          resolve(data);
        });
        /* TO DO: confirm receiving data or server will unsubscribe
          { data }, (cb)=> { console.log(cb) });
        */
      } else if (localFuncs) {
        localFuncs.onData(data);
        resolve(data);
      }
      // sub.last_throttled = Date.now();

    } else {
      const errObj = { _err_msg: err.toString(), err };
      if (socket_id && this.sockets[socket_id]) {
        this.sockets[socket_id].emit(channel_name, { err: errObj });
      } else if (localFuncs) {
        if(!localFuncs.onError){
          console.error("Uncaught subscription error", err);
        }
        localFuncs.onError?.(errObj);
      }
      reject(errObj);
    }
  });
}
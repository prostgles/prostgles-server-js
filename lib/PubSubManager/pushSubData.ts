import { parseLocalFuncs } from "../DboBuilder/ViewHandler/subscribe";
import { EventTypes } from "../Logging";
import { log, PubSubManager, Subscription } from "./PubSubManager";

export async function pushSubData(this: PubSubManager, sub: Subscription, err?: any) {
  const { socket_id, channel_name } = sub;

  const onLog = (
    state: Extract<EventTypes.SyncOrSub, { type: "syncOrSub"; command: "pushSubData" }>["state"]
  ) => {
    void this._log({
      type: "syncOrSub",
      command: "pushSubData",
      channel_name: sub.channel_name,
      error: err,
      state,
      duration: 0,
      connectedSocketIds: this.connectedSocketIds,
      triggers: this._triggers,
    });
  };

  if (!this.subs.some((s) => s.channel_name === channel_name)) {
    // Might be throttling a sub that was removed
    onLog("sub_not_found");
    return;
  }
  const localFuncs = parseLocalFuncs(sub.localFuncs);

  if (err) {
    onLog("error");
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
        log("Pushed " + data.length + " records to sub");
        onLog("Emiting to socket");
        this.sockets[socket_id].emit(channel_name, { data }, () => {
          resolve(data);
        });
        /* TO DO: confirm receiving data or server will unsubscribe
          { data }, (cb)=> { console.log(cb) });
        */
      } else if (localFuncs) {
        onLog("pushed to local client");
        localFuncs.onData(data);
        resolve(data);
      } else {
        onLog("no client to push data to");
      }
      // sub.last_throttled = Date.now();
    } else {
      onLog("fetch data error");
      const errObj = { _err_msg: err.toString(), err };
      if (socket_id && this.sockets[socket_id]) {
        this.sockets[socket_id].emit(channel_name, { err: errObj });
      } else if (localFuncs) {
        if (!localFuncs.onError) {
          console.error("Uncaught subscription error", err);
        }
        localFuncs.onError?.(errObj);
      }
      reject(errObj);
    }
  });
}

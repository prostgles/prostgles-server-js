import type { EventTypes } from "../Logging";
import type { Subscription } from "./PubSubManager";
import { type PubSubManager } from "./PubSubManager";
import { log } from "./PubSubManagerUtils";

export async function pushSubData(this: PubSubManager, sub: Subscription, err?: any) {
  const { socket_id, channel_name, onData } = sub;

  const onLog = (
    state: Extract<EventTypes.SyncOrSub, { type: "syncOrSub"; command: "pushSubData" }>["state"],
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

  if (err) {
    onLog("error");
    if (socket_id) {
      this.sockets[socket_id]?.emit(channel_name, { err });
    }
    return true;
  }

  sub.lastPushed = Date.now();

  const { data, err: subDataError } = await this.getSubData(sub);

  if (subDataError !== undefined) {
    onLog("fetch data error");
  }
  if (socket_id && this.sockets[socket_id]) {
    log(`Pushing ${data?.length ?? 0} rows to socket`);
    onLog("Emiting to socket");
    this.sockets[socket_id].emit(
      channel_name,
      subDataError !== undefined ? { err: subDataError } : { data },
      () => {
        /* TO DO: confirm receiving data or server will unsubscribe
          { data }, (cb)=> { console.log(cb) });
        */
      },
    );
  } else if (onData) {
    onLog("pushed to local client");
    onData(data ?? [], subDataError);
  } else {
    onLog("no client to push data to");
  }
}

import type { EventTypes } from "../Logging";
import type { Subscription } from "./PubSubManager";
import { type PubSubManager } from "./PubSubManager";
import { log } from "./PubSubManagerUtils";

export async function pushSubData(this: PubSubManager, sub: Subscription, err?: any) {
  if (sub.isPushing) {
    sub.reRun = true;
    return;
  }
  sub.pushRequestedVersion = incrementWithReset(sub.pushRequestedVersion);
  const { socket_id, channel_name, onData, pushRequestedVersion } = sub;
  const isActiveSub = () => this.subs.some((s) => s.channel_name === channel_name);

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

  if (!isActiveSub()) {
    onLog("sub_not_found");
    return;
  }

  if (err) {
    onLog("error");
    if (socket_id) {
      this.sockets[socket_id]?.emit(channel_name, { err });
    } else if (onData) {
      onData([], err);
    }
    return true;
  }

  try {
    sub.isPushing = true;
    const { data, err: subDataError } = await this.getSubData(sub);

    if (!isActiveSub() || sub.pushRequestedVersion !== pushRequestedVersion) {
      return;
    }
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
      sub.lastPushed = Date.now();
    } else if (onData) {
      onLog("pushed to local client");
      onData(data ?? [], subDataError);
      sub.lastPushed = Date.now();
    } else {
      onLog("no client to push data to");
    }
  } finally {
    sub.isPushing = false;
    if (sub.reRun) {
      sub.reRun = false;
      void this.pushSubData(sub);
    }
  }
}

export const incrementWithReset = (value: number, max = Number.MAX_SAFE_INTEGER): number => {
  return value >= max ? 0 : value + 1;
};

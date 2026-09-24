import type { EventTypes } from "../../Logging";
import type { PubSubManager, SyncParams } from "../PubSubManager";

export const logSyncError = (
  pubSubManager: PubSubManager,
  sync: SyncParams,
  source: Extract<EventTypes.Sync, { command: "replicationError" }>["source"],
  error: unknown,
) =>
  pubSubManager._log({
    type: "sync",
    command: "replicationError",
    source,
    error,
    tableName: sync.table_name,
    channelName: sync.channel_name,
    socketId: sync.socket_id,
    sid: sync.sid,
    connectedSocketIds: pubSubManager.connectedSocketIds,
    syncParams: sync,
    duration: -1,
  });

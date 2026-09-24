import type { AnyObject } from "prostgles-types";
import { pickKeys } from "prostgles-types";
import { WAL } from "prostgles-types/dist/WAL";
import type { PubSubManager, SyncParams } from "../PubSubManager";
import { getSyncUtilFunctions } from "./getSyncUtilFunctions";
import type { EventTypes } from "../../Logging";
import { logSyncError } from "./logSyncError";

export type ClientSyncInfo = Partial<{
  c_fr: AnyObject;
  c_lr: AnyObject;
  /**
   * PG count is usually string due to bigint
   */
  c_count: number | string;
}>;

export type ServerSyncInfo = Partial<{
  s_fr: AnyObject;
  s_lr: AnyObject;
  /**
   * PG count is usually string due to bigint
   */
  s_count: number | string;
}>;

export type SyncBatchInfo = Partial<{
  from_synced: number;
  to_synced: number;
  end_offset: number;
}>;

export type onSyncRequestResponse =
  | {
      onSyncRequest?: ClientSyncInfo;
    }
  | {
      err: AnyObject | string;
    };

export type ClientExpressData = ClientSyncInfo & {
  data?: AnyObject[];
  deleted?: AnyObject[];
};

/**
 * Server or client requested data sync
 */
export function syncData(
  this: PubSubManager,
  sync: SyncParams,
  clientData: ClientExpressData | undefined,
  source: "trigger" | "client",
) {
  const run = () =>
    runSyncData.call(this, sync, clientData, source).catch(async (error) => {
      if (this.sockets.get(sync.socket_id)?.connected) {
        await logSyncError(this, sync, source, error);
      }
      throw error;
    });
  const queued = (sync.syncQueue ?? Promise.resolve()).then(run);
  // Report failures to the caller while allowing the next request to run.
  sync.syncQueue = queued.catch(() => undefined);
  return queued;
}

async function runSyncData(
  this: PubSubManager,
  sync: SyncParams,
  clientData: ClientExpressData | undefined,
  source: "trigger" | "client",
) {
  const logSyncData = (state: Extract<EventTypes.Sync, { command: "syncData" }>["state"]) => {
    return this._log({
      type: "sync",
      command: "syncData",
      channelName: sync.channel_name,
      tableName: sync.table_name,
      sid: sync.sid,
      source,
      ...pickKeys(sync, ["socket_id", "condition", "lr", "is_syncing"]),
      lr: JSON.stringify(sync.lr),
      connectedSocketIds: this.dboBuilder.prostgles.connectedSockets.map((s) => s.id),
      localParams: undefined,
      duration: -1,
      socketId: sync.socket_id,
      syncParams: sync,
      state,
    });
  };
  await logSyncData("start");

  const { socket_id, table_name, synced_field, id_fields = [], batch_size, throttle = 0 } = sync;

  const socket = this.sockets.get(socket_id);
  if (!socket?.connected) {
    await logSyncData("socket?.connected");
    return;
  }
  const tableHandler = this.dbo[table_name];
  if (!tableHandler?.find) {
    throw `dbo.${table_name}.find missing or not allowed`;
  }
  const {
    upsertData,
    updateSyncLR,
    getServerRowInfo,
    deleteData,
    getLastSynced,
    pushData,
    syncBatch,
    rowsFullyMatch,
  } = getSyncUtilFunctions({
    tableHandler,
    socket,
    sync,
    pubSubManager: this,
    logSyncData,
    localParams: sync.localParams,
  });

  /* Used to throttle and merge incoming updates */
  sync.wal ??= new WAL({
    id_fields,
    synced_field,
    throttle,
    batch_size,
    DEBUG_MODE: this.dboBuilder.prostgles.opts.DEBUG_MODE,
    onSendStart: () => {
      sync.is_syncing = true;
    },
    onSend: async (data) => {
      try {
        return await upsertData(data, "WAL");
      } catch (error) {
        await logSyncError(this, sync, "WAL", error);
        throw error;
      }
    },
    onSendEnd: (batch, _, error) => {
      if (error === undefined) {
        updateSyncLR(batch);
      }
      sync.is_syncing = false;

      /**
       * After all data was inserted request SyncInfo from client and sync again if necessary
       */
      void this.syncData(sync, undefined, source).catch((error) => {
        const socket = this.sockets.get(sync.socket_id);
        if (!socket?.connected) {
          return;
        }
        console.error("Follow-up replication failed", {
          tableName: sync.table_name,
          channelName: sync.channel_name,
          socketId: sync.socket_id,
          error,
        });
      });
    },
  });

  /**
   * Express data sent from a client that has already been synced
   * Add to WAL manager which will sync at the end
   */
  if (clientData) {
    if (clientData.data && Array.isArray(clientData.data) && clientData.data.length) {
      await logSyncData("sync.wal.addData");
      return sync.wal.addData(clientData.data.map((d) => ({ current: d })));
      /* Not expecting this anymore. use normal db.table.delete channel */
    } else if (
      clientData.deleted &&
      Array.isArray(clientData.deleted) &&
      clientData.deleted.length
    ) {
      await deleteData(clientData.deleted);
    }
  } else {
    // do nothing
  }

  if (sync.wal.isSending()) {
    await logSyncData("sync.wal.isSending()");
    return;
  }

  sync.is_syncing = true;
  try {
    let from_synced = null;

    /** Client runs must reconcile the client's snapshot after reattachment. */
    if (sync.lr && !clientData) {
      const { s_lr } = await getServerRowInfo();

      /* Make sure trigger is not firing on freshly synced data */
      if (!rowsFullyMatch(sync.lr, s_lr)) {
        from_synced = Number(sync.lr[synced_field]);
        await logSyncData("sync.lr");
      } else {
        await logSyncData("rowsFullyMatch");
      }
    } else {
      await logSyncData("getLastSynced(clientData).start");
      from_synced = await getLastSynced(clientData);
      await logSyncData("getLastSynced(clientData).end");
    }

    if (from_synced !== null) {
      await logSyncData("syncBatch.start");
      await syncBatch(from_synced);
      await logSyncData("syncBatch.end");
    } else {
      await logSyncData("nothingToSync");
    }

    await pushData({ state: "synced" });
  } finally {
    sync.is_syncing = false;
  }
}

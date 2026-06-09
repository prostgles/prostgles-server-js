import type { AnyObject } from "prostgles-types";
import { pickKeys } from "prostgles-types";
import { WAL } from "prostgles-types/dist/WAL";
import type { PubSubManager, SyncParams } from "../PubSubManager";
import { getSyncUtilFunctions } from "./getSyncUtilFunctions";
import type { EventTypes } from "../../Logging";

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
  from_synced: number | null;
  to_synced: number | null;
  end_offset: number | null;
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
export async function syncData(
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
      ...pickKeys(sync, ["socket_id", "condition", "last_synced", "is_syncing"]),
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

  const socket = this.sockets[socket_id];
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
      const res = await upsertData(data);
      return res;
    },
    onSendEnd: (batch) => {
      updateSyncLR(batch);
      sync.is_syncing = false;

      /**
       * After all data was inserted request SyncInfo from client and sync again if necessary
       */
      void this.syncData(sync, undefined, source);
    },
  });

  /* Debounce sync requests */
  if (!sync.wal.isSending() && sync.is_syncing) {
    if (!this.syncTimeout) {
      this.syncTimeout = setTimeout(() => {
        this.syncTimeout = undefined;
        void this.syncData(sync, undefined, source);
      }, throttle);
    }
    return;
  }

  /**
   * Express data sent from a client that has already been synced
   * Add to WAL manager which will sync at the end
   */
  if (clientData) {
    if (clientData.data && Array.isArray(clientData.data) && clientData.data.length) {
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

  // from synced does not make sense. It should be sync.lr only!!!
  let from_synced = null;

  /** Sync was already synced */
  if (sync.lr) {
    const { s_lr } = await getServerRowInfo();

    /* Make sure trigger is not firing on freshly synced data */
    if (!rowsFullyMatch(sync.lr, s_lr)) {
      from_synced = sync.last_synced;
      await logSyncData("sync.last_synced");
    } else {
      await logSyncData("rowsFullyMatch");
    }
  } else {
    await logSyncData("getLastSynced(clientData)");
    from_synced = await getLastSynced(clientData);
  }

  if (from_synced !== null) {
    await logSyncData("syncBatch.start");
    await syncBatch(from_synced);
    await logSyncData("syncBatch.end");
  } else {
    await logSyncData("nothingToSync");
  }

  await pushData([], true);

  sync.is_syncing = false;
}

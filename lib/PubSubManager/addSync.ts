import { find, getSerialisableError, getSyncChannelName, tryCatchV2 } from "prostgles-types";
import type { AddSyncParams, BasicCallback, PubSubManager, SyncParams } from "./PubSubManager";
import { parseCondition } from "./PubSubManagerUtils";
import type { onSyncRequestResponse } from "./SyncReplication/syncData";

/**
 * Returns a sync channel
 * A sync channel is unique per socket for each filter
 */
export async function addSync(
  this: PubSubManager,
  syncParams: AddSyncParams,
): Promise<{ channelName: string }> {
  const sid = this.dboBuilder.prostgles.authHandler.getSIDNoError({ socket: syncParams.socket });
  const res = await tryCatchV2(async () => {
    const { socket, table_info, table_rules, filter, params, condition } = syncParams;
    const conditionParsed = parseCondition(condition);

    const { name: table_name } = table_info;
    const channelName = getSyncChannelName({
      tableName: table_name,
      filter,
      select: params.select,
    });

    this.upsertSocket(socket);

    const syncConfig = this.dboBuilder.prostgles.tableConfigurator?.getTableSyncConfig(table_name);
    if (!syncConfig) {
      throw `Sync not configured for table ${table_name}`;
    }
    const upsertSync = () => {
      const newSync = {
        channel_name: channelName,
        table_name,
        filter,
        condition: conditionParsed,
        sid,
        table_rules,
        ...syncConfig,
        socket_id: socket.id,
        is_sync: true,
        last_synced: 0,
        lr: undefined,
        table_info,
        is_syncing: false,
        wal: undefined,
        socket,
        params,
      };

      /* Only a sync per socket per table/condition/select allowed */
      const existing = find(this.syncs, { socket_id: socket.id, channel_name: channelName });
      if (!existing) {
        const unsyncChn = channelName + "unsync";
        socket.removeAllListeners(unsyncChn);
        socket.once(unsyncChn, (_data: any, cb: BasicCallback) => {
          void this._log({
            type: "sync",
            command: "unsync",
            socketId: socket.id,
            tableName: table_name,
            condition,
            channelName,
            sid,
            connectedSocketIds: this.connectedSocketIds,
            duration: -1,
            syncParams: newSync,
          });
          socket.removeAllListeners(channelName);
          socket.removeAllListeners(unsyncChn);
          this.syncs = this.syncs.filter((s) => {
            const isMatch =
              s.socket_id && s.socket_id === socket.id && s.channel_name === channelName;
            return !isMatch;
          });
          cb(null, { res: "ok" });
        });

        socket.removeAllListeners(channelName);
        socket.on(channelName, (data: onSyncRequestResponse | undefined, cb: BasicCallback) => {
          if (!data) {
            cb({ err: "Unexpected request. Need data or onSyncRequest" });
            return;
          }

          /* Server will:
              1. Ask for last_synced  emit(onSyncRequest)
              2. Ask for data >= server_synced    emit(onPullRequest)
                  -> Upsert that data
              2. Push data >= last_synced     emit(data.data)

            Client will:
              1. Send last_synced     on(onSyncRequest)
              2. Send data >= server_synced   on(onPullRequest)
              3. Send data on CRUD    emit(data.data | data.deleted)
              4. Upsert data.data | deleted     on(data.data | data.deleted)
          */

          if ("onSyncRequest" in data && data.onSyncRequest) {
            this.syncData(newSync, data.onSyncRequest, "client").catch((err) => {
              console.error("Error syncing data with client: ", err);
              cb({ err: getSerialisableError(err) });
            });
          } else {
            console.error("Unexpected sync request data from client: ", data);
          }
        });
      } else {
        console.warn("addSync: Client tried to create a duplicate sync", existing.channel_name);
      }

      return newSync;
    };

    const newSync = upsertSync();

    await this.addTrigger(
      { table_name, condition: conditionParsed, tracked_columns: undefined },
      undefined,
      socket,
    );

    this.syncs.push(newSync);
    return { channelName, newSync };
  });

  await this._log({
    type: "sync",
    command: "addSync",
    tableName: syncParams.table_info.name,
    condition: syncParams.condition,
    socketId: syncParams.socket.id,
    connectedSocketIds: this.connectedSocketIds,
    duration: res.duration,
    error: res.error,
    sid,
    channelName: res.data?.channelName || "",
    syncParams: res.data?.newSync ?? ({} as SyncParams),
  });

  if (res.hasError) throw res.error;

  return res.data;
}

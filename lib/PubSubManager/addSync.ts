import { find, tryCatchV2 } from "prostgles-types";
import type { AddSyncParams, BasicCallback, PubSubManager } from "./PubSubManager";
import { DEFAULT_SYNC_BATCH_SIZE, parseCondition } from "./PubSubManagerUtils";

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
    const {
      socket = null,
      table_info = null,
      table_rules,
      synced_field = null,
      id_fields = [],
      filter = {},
      params,
      condition = "",
      throttle = 0,
    } = syncParams;
    const conditionParsed = parseCondition(condition);
    if (!socket || !table_info) throw "socket or table_info missing";

    const { name: table_name } = table_info;
    const channelName = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.sync`;

    if (!synced_field) throw "synced_field missing from table_rules";

    this.upsertSocket(socket);

    const upsertSync = () => {
      const newSync = {
        channel_name: channelName,
        table_name,
        filter,
        condition: conditionParsed,
        synced_field,
        sid,
        id_fields,
        table_rules,
        throttle: Math.max(throttle || 0, table_rules.sync?.throttle || 0),
        batch_size: table_rules.sync?.batch_size || DEFAULT_SYNC_BATCH_SIZE,
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

      /* Only a sync per socket per table per condition allowed */
      const existing = find(this.syncs, { socket_id: socket.id, channel_name: channelName });
      if (!existing) {
        this.syncs.push(newSync);

        const unsyncChn = channelName + "unsync";
        socket.removeAllListeners(unsyncChn);
        socket.once(unsyncChn, (_data: any, cb: BasicCallback) => {
          void this._log({
            type: "sync",
            command: "unsync",
            socketId: socket.id,
            tableName: table_name,
            condition,
            sid,
            connectedSocketIds: this.connectedSocketIds,
            duration: -1,
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
        socket.on(channelName, (data: any, cb: BasicCallback) => {
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

          if (data.onSyncRequest) {
            void this.syncData(newSync, data.onSyncRequest, "client");
          } else {
            console.error("Unexpected sync request data from client: ", data);
          }
        });
      } else {
        console.warn("addSync: Client tried to create a duplicate sync", existing.channel_name);
      }

      return newSync;
    };

    upsertSync();

    await this.addTrigger(
      { table_name, condition: conditionParsed, tracked_columns: undefined },
      undefined,
      socket,
    );

    return { channelName };
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
  });

  if (res.hasError) throw res.error;

  return res.data;
}

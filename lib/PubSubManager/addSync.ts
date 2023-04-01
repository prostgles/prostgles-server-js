import { find } from "prostgles-types/dist/util";
import { BasicCallback, parseCondition, PubSubManager } from "./PubSubManager";
import { AddSyncParams, DEFAULT_SYNC_BATCH_SIZE } from "./PubSubManager";

/**
 * Returns a sync channel
 * A sync channel is unique per socket for each filter
 */
export async function addSync(this: PubSubManager, syncParams: AddSyncParams) {
  const {
    socket = null, table_info = null, table_rules, synced_field = null,
    allow_delete = false, id_fields = [], filter = {},
    params, condition = "", throttle = 0
  } = syncParams || {};

  const conditionParsed = parseCondition(condition);
  if (!socket || !table_info) throw "socket or table_info missing";


  const { name: table_name } = table_info;
  const channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.sync`;

  if (!synced_field) throw "synced_field missing from table_rules";

  this.upsertSocket(socket);

  const upsertSync = () => {
    const newSync = {
      channel_name,
      table_name,
      filter,
      condition: conditionParsed,
      synced_field,
      id_fields,
      allow_delete,
      table_rules,
      throttle: Math.max(throttle || 0, table_rules?.sync?.throttle || 0),
      batch_size: table_rules?.sync?.batch_size || DEFAULT_SYNC_BATCH_SIZE,
      last_throttled: 0,
      socket_id: socket.id,
      is_sync: true,
      last_synced: 0,
      lr: undefined,
      table_info,
      is_syncing: false,
      wal: undefined,
      socket,
      params
    };

    /* Only a sync per socket per table per condition allowed */
    this.syncs = this.syncs || [];
    const existing = find(this.syncs, { socket_id: socket.id, channel_name });
    if (!existing) {
      this.syncs.push(newSync);
      // console.log("Added SYNC");

      const unsyncChn = channel_name + "unsync";
      socket.removeAllListeners(unsyncChn);
      socket.once(unsyncChn, (_data: any, cb: BasicCallback) => {
        // this.onSocketDisconnected({ socket, syncChannel: channel_name });
        socket.removeAllListeners(channel_name);
        socket.removeAllListeners(unsyncChn);
        this.syncs = this.syncs.filter(s => {
          const isMatch = s.socket_id && s.socket_id === socket.id && s.channel_name === channel_name;
          return !isMatch;
        });
        cb(null, { res: "ok" })
      });

      socket.removeAllListeners(channel_name);
      socket.on(channel_name, (data: any, cb: BasicCallback) => {

        if (!data) {
          cb({ err: "Unexpected request. Need data or onSyncRequest" });
          return;
        }

        /*
        */

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

        // if(data.data){
        //     console.error("THIS SHOUKD NEVER FIRE !! NEW DATA FROM SYNC");
        //     this.upsertClientData(newSync, data.data);
        // } else 
        if (data.onSyncRequest) {
          // console.log("syncData from socket")
          this.syncData(newSync, data.onSyncRequest, "client");

          // console.log("onSyncRequest ", socket._user)
        } else {
          console.error("Unexpected sync request data from client: ", data)
        }
      });

      // socket.emit(channel_name, { onSyncRequest: true }, (response) => {
      //     console.log(response)
      // });
    } else {
      console.warn("UNCLOSED DUPLICATE SYNC FOUND", existing.channel_name);
    }

    return newSync;
  };


  // const { min_id, max_id, count, max_synced } = params;

  const _sync = upsertSync();

  await this.addTrigger({ table_name, condition: conditionParsed });

  return channel_name;
} 
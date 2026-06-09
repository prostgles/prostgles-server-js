import {
  isDefined,
  omitKeys,
  pickKeys,
  type AnyObject,
  type SyncBatchParams,
} from "prostgles-types";
import type { PRGLIOSocket } from "../../DboBuilder/DboBuilder";
import type { TableHandler } from "../../DboBuilder/TableHandler/TableHandler";
import { getSyncOrderByAndFields } from "./getSyncOrderByAndFields";
import type { PubSubManager, SyncParams } from "../PubSubManager";
import { fetchSyncServerData } from "./fetchSyncServerData";
import type {
  ClientSyncInfo,
  onSyncRequestResponse,
  ServerSyncInfo,
  SyncBatchInfo,
} from "./syncData";
import { log } from "../PubSubManagerUtils";

type Args = {
  socket: PRGLIOSocket;
  tableHandler: TableHandler;
  sync: SyncParams;
  pubSubManager: PubSubManager;
};

export const getSyncUtilFunctions = ({ socket, tableHandler, sync, pubSubManager }: Args) => {
  const {
    synced_field,
    socket_id,
    id_fields,
    filter,
    table_rules,
    batch_size,
    channel_name,
    table_name,
    params,
  } = sync;

  const { orderByAsc, sync_fields } = getSyncOrderByAndFields({ synced_field, id_fields }),
    rowsIdsMatch = (a?: AnyObject, b?: AnyObject) => {
      return a && b && !id_fields.find((key) => a[key].toString() !== b[key].toString());
    },
    rowsFullyMatch = (a?: AnyObject, b?: AnyObject) => {
      return rowsIdsMatch(a, b) && a?.[synced_field].toString() === b?.[synced_field].toString();
    },
    getServerRowInfo = async (args: SyncBatchParams = {}): Promise<ServerSyncInfo> => {
      const { from_synced, to_synced, offset = 0, limit } = args;
      const batchFilter = { ...filter };

      if (isDefined(from_synced) || isDefined(to_synced)) {
        batchFilter[synced_field] = {
          ...(isDefined(from_synced) ? { $gte: from_synced } : {}),
          ...(isDefined(to_synced) ? { $lte: to_synced } : {}),
        };
      }

      const first_rows = (await tableHandler.find(
        batchFilter,
        { orderBy: orderByAsc, select: sync_fields, limit, offset },
        undefined,
        table_rules,
        { clientReq: { socket } },
      )) as AnyObject[];

      const last_rows = first_rows.slice(-1); // Why not logic below?
      // const last_rows = await _this?.dbo[table_name]?.find?.(_filter, { orderBy: (orderByDesc as OrderBy), select: sync_fields, limit: 1, offset: -offset || 0 }, null, table_rules);
      const count = await tableHandler.count(batchFilter, undefined, undefined, table_rules);

      return {
        s_fr: first_rows[0],
        s_lr: last_rows[0],
        s_count: count,
      };
    },
    getClientRowInfo = (args: SyncBatchInfo = {}) => {
      const { from_synced = null, to_synced = null, end_offset = null } = args;
      const res = new Promise<ClientSyncInfo>((resolve, reject) => {
        const onSyncRequest = { from_synced, to_synced, end_offset }; //, forReal: true };
        socket.emit(channel_name, { onSyncRequest }, (resp?: onSyncRequestResponse) => {
          if (resp && "onSyncRequest" in resp && resp.onSyncRequest) {
            const c_fr = resp.onSyncRequest.c_fr,
              c_lr = resp.onSyncRequest.c_lr,
              c_count = resp.onSyncRequest.c_count;

            // console.log(onSyncRequest, { c_fr, c_lr, c_count }, socket._user);
            return resolve({ c_fr, c_lr, c_count });
          } else if (resp && "err" in resp && resp.err) {
            reject(resp.err);
          }
        });
      });

      return res;
    },
    getClientData = (from_synced = 0, offset = 0): Promise<AnyObject[]> => {
      return new Promise((resolve, reject) => {
        const onPullRequest = {
          from_synced: from_synced || 0,
          offset: offset || 0,
          limit: batch_size,
        };
        socket.emit(channel_name, { onPullRequest }, (resp?: { data?: AnyObject[] }) => {
          if (resp && resp.data && Array.isArray(resp.data)) {
            // console.log({ onPullRequest, resp }, socket._user)
            resolve(sortClientData(resp.data));
          } else {
            reject("unexpected onPullRequest response: " + JSON.stringify(resp));
          }
        });
      });

      function sortClientData(data: AnyObject[]) {
        return data.sort((a, b) => {
          /* Order by increasing synced and ids (sorted alphabetically) */
          return (
            +a[synced_field] - +b[synced_field] ||
            id_fields
              .sort()
              .map((idKey) =>
                a[idKey] < b[idKey] ? -1
                : a[idKey] > b[idKey] ? 1
                : 0,
              )
              .find((v) => v) ||
            0
          );
        });
      }
    },
    getServerData = async (from_synced = 0, offset = 0): Promise<AnyObject[]> => {
      return fetchSyncServerData(
        { tableHandler, socket, from_synced, offset },
        { filter, id_fields, params, synced_field, batch_size, table_rules },
      );
    },
    deleteData = async (deleted: AnyObject[]) => {
      // console.log("deleteData deleteData  deleteData " + deleted.length);
      // if (allow_delete) {
      //   return Promise.all(
      //     deleted.map(async (d) => {
      //       const id_filter = pickKeys(d, id_fields);
      //       try {
      //         await (pubSubManager.dbo[table_name] as TableHandler).delete(
      //           id_filter,
      //           undefined,
      //           undefined,
      //           table_rules
      //         );
      //         return 1;
      //       } catch (e) {
      //         console.error(e);
      //       }
      //       return 0;
      //     })
      //   );
      // } else {
      //   console.warn("client tried to delete data without permission (allow_delete is false)");
      // }
      // return false;
    },
    /**
     * Upserts the given client data where synced_field is higher than on server
     */
    upsertData = async (data: AnyObject[]) => {
      const start = Date.now();
      const result = await pubSubManager.dboBuilder
        .getTX(async (dbTX) => {
          const tableHandlerTx = dbTX[table_name] as TableHandler;
          const existingData = await tableHandlerTx.find(
            { $or: data.map((d) => pickKeys(d, id_fields)) },
            {
              select: [synced_field, ...id_fields],
              orderBy: orderByAsc,
            },
            undefined,
            table_rules,
            { clientReq: { socket } },
          );
          let rowsToInsert = data.filter((d) => !existingData.find((ed) => rowsIdsMatch(ed, d)));
          let rowsToUpdate = data.filter((d) =>
            existingData.find(
              (ed) => rowsIdsMatch(ed, d) && Number(ed[synced_field]) < Number(d[synced_field]),
            ),
          );

          if (table_rules.update && rowsToUpdate.length) {
            const batchUpdates: [AnyObject, AnyObject][] = rowsToUpdate.map((rowToUpdate) => {
              const id_filter = pickKeys(rowToUpdate, id_fields);
              const syncSafeFilter = {
                $and: [id_filter, { [synced_field]: { "<": rowToUpdate[synced_field] } }],
              };

              return [syncSafeFilter, omitKeys(rowToUpdate, id_fields)];
            });
            await tableHandlerTx.updateBatch(
              batchUpdates,
              { removeDisallowedFields: true },
              undefined,
              table_rules,
              { clientReq: { socket } },
            );
          } else {
            rowsToUpdate = [];
          }

          if (table_rules.insert && rowsToInsert.length) {
            await tableHandlerTx.insert(
              rowsToInsert,
              { removeDisallowedFields: true },
              undefined,
              table_rules,
              { clientReq: { socket } },
            );
          } else {
            rowsToInsert = [];
          }

          return { inserts: rowsToInsert, updates: rowsToUpdate };
        })
        .then(({ inserts, updates }) => {
          log(
            `upsertData: inserted( ${inserts.length} )    updated( ${updates.length} )     total( ${data.length} ) \n last insert ${JSON.stringify(inserts.at(-1))} \n last update ${JSON.stringify(updates.at(-1))}`,
          );
          return {
            inserted: inserts.length,
            updated: updates.length,
            total: data.length,
          };
        })
        .catch((err: any) => {
          console.trace(
            "Something went wrong with syncing to server: " + err.message,
            data.length,
            id_fields,
          );
          return Promise.reject(new Error("Something went wrong with syncing to server: "));
        });

      await pubSubManager._log({
        type: "sync",
        command: "upsertData",
        channelName: channel_name,
        tableName: sync.table_name,
        rows: data.length,
        socketId: socket_id,
        sid: sync.sid,
        duration: Date.now() - start,
        connectedSocketIds: pubSubManager.dboBuilder.prostgles.connectedSockets.map((s) => s.id),
        syncParams: sync,
      });

      return result;
    },
    /**
     * Pushes the given data to client
     * @param isSynced = true if
     */
    pushData = async (data: AnyObject[], isSynced = false) => {
      const start = Date.now();
      const result = await new Promise<{
        pushed: number;
        resp: {
          ok: boolean;
        };
      }>((resolve, reject) => {
        socket.emit(channel_name, { data, isSynced }, (resp?: { ok: boolean }) => {
          if (resp && resp.ok) {
            // console.log("PUSHED to client: fr/lr", data[0], data[data.length - 1]);
            resolve({ pushed: data.length, resp });
          } else {
            reject(resp);
            console.error("Unexpected response");
          }
        });
      });

      await pubSubManager._log({
        type: "sync",
        command: "pushData",
        tableName: sync.table_name,
        rows: data.length,
        socketId: socket_id,
        duration: Date.now() - start,
        sid: sync.sid,
        connectedSocketIds: pubSubManager.dboBuilder.prostgles.connectedSockets.map((s) => s.id),
        channelName: channel_name,
        syncParams: sync,
      });

      return result;
    },
    /**
     * Returns the lowest synced_field between server and client by checking client and server sync data.
     * If last rows don't match it will find an earlier matching last row and use that last matching from_synced
     * If no rows or fully synced (c_lr and s_lr match) then returns null
     */
    getLastSynced = async (clientSyncInfo?: ClientSyncInfo): Promise<number | null> => {
      // Get latest row info
      const { c_fr, c_lr, c_count } = clientSyncInfo || (await getClientRowInfo());
      const { s_fr, s_lr, s_count } = await getServerRowInfo();

      // console.log("getLastSynced", clientData, socket._user )

      let result = null;

      /* Nothing to sync */
      if ((!c_fr && !s_fr) || rowsFullyMatch(c_lr, s_lr)) {
        //  c_count === s_count &&
        // sync.last_synced = null;
        result = null;

        /* Sync Everything */
      } else if (!rowsFullyMatch(c_fr, s_fr)) {
        if (c_fr && s_fr) {
          result = Math.min(c_fr[synced_field], s_fr[synced_field]);
        } else if (c_fr || s_fr) {
          result = (c_fr || s_fr)![synced_field];
        }

        /* Sync from last matching synced value */
      } else if (rowsFullyMatch(c_fr, s_fr)) {
        if (s_lr && c_lr) {
          result = Math.min(...getNumbers([c_lr[synced_field], s_lr[synced_field]]));
        } else {
          result = Math.min(...getNumbers([c_fr![synced_field], s_fr?.[synced_field]]));
        }

        const min_count = Math.min(...getNumbers([c_count, s_count]));
        let end_offset = 1; // Math.min(s_count, c_count) - 1;
        let step = 0;

        while (min_count > 5 && end_offset < min_count) {
          const { c_lr = null } = await getClientRowInfo({
            from_synced: 0,
            to_synced: result,
            end_offset,
          });
          // console.log("getLastSynced... end_offset > " + end_offset);
          let server_row;

          if (c_lr) {
            const _filter: AnyObject = {};
            sync_fields.map((key) => {
              _filter[key] = c_lr[key];
            });
            server_row = await tableHandler.find(
              _filter,
              { select: sync_fields, limit: 1 },
              undefined,
              table_rules,
              { clientReq: { socket } },
            );
          }

          // if(rowsFullyMatch(c_lr, s_lr)){ //c_count === s_count &&
          if (server_row && server_row.length) {
            server_row = server_row[0];

            result = +server_row[synced_field];
            end_offset = min_count;
            // console.log(`getLastSynced found for ${table_name} -> ${result}`);
          } else {
            end_offset += 1 + step * (step > 4 ? 2 : 1);
            // console.log(`getLastSynced NOT found for ${table_name} -> ${result}`);
          }

          step++;
        }
      }

      return result;
    },
    updateSyncLR = (data: AnyObject[]) => {
      const lastRow = data.at(-1);
      if (!lastRow) {
        return;
      }
      if (sync.lr?.[synced_field] && +sync.lr[synced_field] > +lastRow[synced_field]) {
        console.error(
          {
            syncIssue: "sync.lr[synced_field] is greater than lastRow[synced_field]",
          },
          sync.table_name,
        );
      }
      sync.lr = lastRow;
      sync.last_synced = +sync.lr[synced_field];
    },
    /**
     * Will push pull sync between client and server from a given from_synced value
     */
    syncBatch = async (from_synced: SyncBatchInfo["from_synced"]) => {
      let offset = 0,
        canContinue = true;
      const limit = batch_size,
        min_synced = from_synced || 0;

      let inserted = 0,
        updated = 0,
        pushed = 0,
        total = 0;
      const deleted = 0;

      // console.log("syncBatch", from_synced)

      while (canContinue) {
        const clientData = await getClientData(min_synced, offset);

        if (clientData.length) {
          const res = await upsertData(clientData);
          inserted += res.inserted;
          updated += res.updated;
        }
        let serverData: AnyObject[] | undefined;

        try {
          serverData = await getServerData(min_synced, offset);
        } catch (e) {
          console.trace("sync getServerData err", e);
          // await pushData(undefined, undefined, "Internal error. Check server logs");
          throw " d";
        }

        // TODO: Implement delete ensuring:
        // 1. Delete is preformed only when clientData is fully synced (is kept in localStorage/IndexedDB OR is fully synced)
        // if (allow_delete && table_rules?.delete) {
        //   const to_delete = serverData.filter((d) => {
        //     return !clientData.find((c) => rowsIdsMatch(c, d));
        //   });
        //   await Promise.all(
        //     to_delete.map((d) => {
        //       deleted++;
        //       return (pubSubManager.dbo[table_name] as TableHandler).delete(
        //         pickKeys(d, id_fields),
        //         {},
        //         undefined,
        //         table_rules
        //       );
        //     })
        //   );
        //   serverData = await getServerData(min_synced, offset);
        // }

        const forClient = serverData.filter((s) => {
          return !clientData.find(
            (c) => rowsIdsMatch(c, s) && +c[synced_field] >= +s[synced_field],
          );
        });
        if (forClient.length) {
          const res = await pushData(
            forClient.filter((d) => !sync.wal || !sync.wal.isInHistory(d)),
          );
          pushed += res.pushed;
        }

        if (serverData.length) {
          updateSyncLR(serverData);
          total += serverData.length;
        }
        offset += serverData.length;

        canContinue = serverData.length >= limit;
      }
      log(
        `server.syncBatch ${table_name}: inserted( ${inserted} )    updated( ${updated} )   deleted( ${deleted} )    pushed to client( ${pushed} )     total( ${total} )`,
        socket._user,
      );

      return true;
    };

  return {
    rowsIdsMatch,
    rowsFullyMatch,
    getServerRowInfo,
    getClientRowInfo,
    getClientData,
    getServerData,
    deleteData,
    upsertData,
    pushData,
    getLastSynced,
    updateSyncLR,
    syncBatch,
  };
};

function getNumbers(numberArr: (null | undefined | string | number)[]): number[] {
  return numberArr.filter((v) => v !== null && v !== undefined && Number.isFinite(+v)) as number[];
}

import {
  isDefined,
  omitKeys,
  pickKeys,
  withTimeout,
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
import type { EventTypes } from "../../Logging";

type Args = {
  socket: PRGLIOSocket;
  tableHandler: TableHandler;
  sync: SyncParams;
  pubSubManager: PubSubManager;
  logSyncData: (state: Extract<EventTypes.Sync, { command: "syncData" }>["state"]) => void;
};

export const getSyncUtilFunctions = ({
  socket,
  tableHandler,
  sync,
  pubSubManager,
  logSyncData,
}: Args) => {
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
    handlers,
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
      const { from_synced = undefined, to_synced = undefined, end_offset = null } = args;
      const onSyncRequest = { from_synced, to_synced, end_offset };
      const result = withTimeout(
        new Promise<ClientSyncInfo>(async (resolve, reject) => {
          const res = await handlers.ServerSyncRequest(onSyncRequest);
          if (res.state === "error") {
            reject(res.err);
          } else {
            resolve(res);
          }
        }),
        5000,
      );

      return result;
    },
    getClientData = (from_synced: number | undefined, offset = 0): Promise<AnyObject[]> => {
      return new Promise(async (resolve, reject) => {
        const onPullRequest = {
          from_synced,
          offset,
          limit: batch_size,
          to_synced: undefined,
        };
        const res = await handlers.PullRequest(onPullRequest);
        if (!res.success) {
          reject(res.err);
        } else {
          resolve(sortClientData(res.data));
        }
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
    getServerData = async (from_synced: number | undefined, offset = 0): Promise<AnyObject[]> => {
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
    upsertData = async (data: AnyObject[], source: "WAL" | "client") => {
      const start = Date.now();
      const result = await pubSubManager.dboBuilder
        .getTX(async (dbTX) => {
          const tableHandlerTx = dbTX[table_name] as TableHandler;
          const existingData = (await tableHandlerTx.find(
            { $or: data.map((row) => pickKeys(row, id_fields)) },
            {
              select: [synced_field, ...id_fields],
              orderBy: orderByAsc,
            },
            undefined,
            table_rules,
            { clientReq: { socket } },
          )) as AnyObject[];
          let rowsToInsert = data.filter(
            (incomingRow) =>
              !existingData.find((existingRow) => rowsIdsMatch(existingRow, incomingRow)),
          );
          let rowsToUpdate = data.filter((incomingRow) =>
            existingData.find(
              (existingRow) =>
                rowsIdsMatch(existingRow, incomingRow) &&
                Number(existingRow[synced_field]) < Number(incomingRow[synced_field]),
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
            `upsertData (from ${source}): inserted( ${inserts.length} )    updated( ${updates.length} )     total( ${data.length} ) \n last insert ${JSON.stringify(inserts.at(-1))} \n last update ${JSON.stringify(updates.at(-1))}`,
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
    pushData = async (
      request: { state: "syncing-data"; data: AnyObject[] } | { state: "synced" },
    ) => {
      const items = request.state === "syncing-data" ? request.data : undefined;
      const start = Date.now();
      const result = await new Promise<{
        pushed: number;
      }>(async (resolve, reject) => {
        const resp = await handlers.UpdateRequest(
          request.state === "synced" ?
            { state: "synced", isSynced: true }
          : { state: "syncing", data: request.data },
        );
        if (resp.success) {
          // console.log("PUSHED to client: fr/lr", data[0], data[data.length - 1]);
          resolve({ pushed: items?.length ?? 0 });
        } else {
          reject(resp);
          console.error("Unexpected response");
        }
      });

      await pubSubManager._log({
        type: "sync",
        command: "pushData",
        tableName: sync.table_name,
        rows: items?.length ?? 0,
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

      let result: number | null = null;

      /* Nothing to sync */
      if (!c_fr && !s_fr) {
        logSyncData("getLastSynced.nothingToSync");
        return null;
      }

      if (rowsFullyMatch(c_lr, s_lr)) {
        logSyncData("getLastSynced.rowsFullyMatch(lr)");
        return null;
      }

      if (!rowsFullyMatch(c_fr, s_fr)) {
        if (c_fr && s_fr) {
          result = Math.min(c_fr[synced_field], s_fr[synced_field]);
        } else {
          result = (c_fr ?? s_fr)![synced_field];
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

          let server_rows: AnyObject[] | undefined;

          if (c_lr) {
            const _filter: AnyObject = {};
            sync_fields.map((key) => {
              _filter[key] = c_lr[key];
            });
            server_rows = await tableHandler.find(
              _filter,
              { select: sync_fields, limit: 1 },
              undefined,
              table_rules,
              { clientReq: { socket } },
            );
          }

          const first_server_row = server_rows?.[0];
          if (first_server_row) {
            result = +first_server_row[synced_field];
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
    },
    /**
     * Will push pull sync between client and server from a given from_synced value
     */
    syncBatch = async (from_synced: SyncBatchInfo["from_synced"]) => {
      let offset = 0,
        canContinue = true;
      const limit = batch_size,
        min_synced = from_synced ?? undefined;

      let inserted = 0,
        updated = 0,
        pushed = 0,
        total = 0;
      const deleted = 0;

      // console.log("syncBatch", from_synced)

      while (canContinue) {
        const clientData = await getClientData(min_synced, offset);

        if (clientData.length) {
          const res = await upsertData(clientData, "client");
          inserted += res.inserted;
          updated += res.updated;
        }
        let serverData: AnyObject[] | undefined;

        try {
          serverData = await getServerData(min_synced, offset);
        } catch (e) {
          console.trace("sync getServerData err", e);
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
          const res = await pushData({
            state: "syncing-data",
            data: forClient.filter((d) => !sync.wal || !sync.wal.isInHistory(d)),
          });
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

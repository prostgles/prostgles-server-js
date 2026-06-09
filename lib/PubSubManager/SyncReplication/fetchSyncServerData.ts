import type { AnyObject } from "prostgles-types";
import type { PRGLIOSocket } from "../../DboBuilder/DboBuilder";
import type { TableHandler } from "../../DboBuilder/TableHandler/TableHandler";
import type { SyncParams } from "../PubSubManager";
import { getSyncOrderByAndFields } from "./getSyncOrderByAndFields";
import { getSyncBatchOptions } from "./getSyncBatchOptions";

export const fetchSyncServerData = async (
  {
    tableHandler,
    socket,
    from_synced,
    offset,
  }: {
    tableHandler: TableHandler;
    socket: PRGLIOSocket;
    from_synced: number | undefined;
    offset: number | undefined;
  },
  {
    filter,
    id_fields,
    params,
    synced_field,
    batch_size,
    table_rules,
  }: Pick<
    SyncParams,
    "filter" | "params" | "id_fields" | "synced_field" | "batch_size" | "table_rules"
  >,
) => {
  const { syncBatchFilter } = getSyncBatchOptions({
    filter,
    id_fields,
    params,
    synced_field,
    batch_size,
    from_synced,
    offset,
  });
  const batchRows = await tableHandler.find(
    syncBatchFilter,
    {
      select: params.select,
      orderBy: getSyncOrderByAndFields({ synced_field, id_fields }).orderByAsc,
      offset,
      limit: batch_size,
    },
    undefined,
    table_rules,
    { clientReq: { socket } },
  );

  return batchRows as AnyObject[];
};

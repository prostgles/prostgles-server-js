import type { SyncParams } from "../PubSubManager";
import { getSyncOrderByAndFields } from "./getSyncOrderByAndFields";

export const getSyncBatchOptions = ({
  from_synced,
  offset = 0,
  filter,
  id_fields,
  params,
  synced_field,
  batch_size,
}: Pick<SyncParams, "filter" | "params" | "id_fields" | "synced_field" | "batch_size"> & {
  from_synced: number | undefined;
  offset: number | undefined;
}) => {
  const syncBatchFilter =
    from_synced === undefined ? filter : (
      {
        ...filter,
        [synced_field]: { $gte: from_synced },
      }
    );

  return {
    select: params.select,
    orderBy: getSyncOrderByAndFields({ synced_field, id_fields }).orderByAsc,
    offset,
    limit: batch_size,
    syncBatchFilter,
  };
};

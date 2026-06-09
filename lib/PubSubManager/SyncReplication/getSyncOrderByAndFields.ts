import type { OrderBy } from "prostgles-types";
import type { SyncParams } from "../PubSubManager";

export const getSyncOrderByAndFields = ({
  synced_field,
  id_fields,
}: Pick<SyncParams, "id_fields" | "synced_field">) => {
  const sync_fields = [synced_field, ...id_fields.sort()],
    orderByAsc: OrderBy = sync_fields.reduce((a, v) => ({ ...a, [v]: true }), {});
  return { orderByAsc, sync_fields };
};

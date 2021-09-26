import { prostgles as pgls, InitOptions } from "./prostgles";
import { SyncedTable } from "./SyncedTable";
export function prostgles (params: InitOptions) {
    return pgls(params, SyncedTable);
}
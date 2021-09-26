import { prostgles as pgls, InitOptions, DBHandlerClient } from "./prostgles";
import { SyncedTable } from "./SyncedTable";
function prostgles (params: InitOptions) {
    return pgls(params, SyncedTable);
}
prostgles.SyncedTable = SyncedTable;

// export { InitOptions, DBHandlerClient };
// export default prostgles;
export = prostgles;


// export { SyncedTable };
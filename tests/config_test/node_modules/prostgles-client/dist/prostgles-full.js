"use strict";
const prostgles_1 = require("./prostgles");
const SyncedTable_1 = require("./SyncedTable");
function prostgles(params) {
    return prostgles_1.prostgles(params, SyncedTable_1.SyncedTable);
}
prostgles.SyncedTable = SyncedTable_1.SyncedTable;
module.exports = prostgles;
// export { SyncedTable };

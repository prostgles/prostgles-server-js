"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prostgles = void 0;
const prostgles_1 = require("./prostgles");
const SyncedTable_1 = require("./SyncedTable");
function prostgles(params) {
    return prostgles_1.prostgles(params, SyncedTable_1.SyncedTable);
}
exports.prostgles = prostgles;

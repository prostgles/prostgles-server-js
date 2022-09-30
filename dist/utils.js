"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clone = exports.get = void 0;
var prostgles_types_1 = require("prostgles-types");
Object.defineProperty(exports, "get", { enumerable: true, get: function () { return prostgles_types_1.get; } });
const clone = (obj) => {
    if (structuredClone !== undefined) {
        return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
};
exports.clone = clone;
//# sourceMappingURL=utils.js.map
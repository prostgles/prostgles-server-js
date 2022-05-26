"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDefined = exports.isObject = void 0;
var prostgles_types_1 = require("prostgles-types");
Object.defineProperty(exports, "get", { enumerable: true, get: function () { return prostgles_types_1.get; } });
function isObject(obj) {
    return Boolean(obj && typeof obj === "object" && !Array.isArray(obj));
}
exports.isObject = isObject;
exports.isDefined = (v) => v !== undefined && v !== null;
//# sourceMappingURL=utils.js.map
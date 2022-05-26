"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDefined = exports.isObject = exports.get = void 0;
var prostgles_types_1 = require("prostgles-types");
Object.defineProperty(exports, "get", { enumerable: true, get: function () { return prostgles_types_1.get; } });
function isObject(obj) {
    return Boolean(obj && typeof obj === "object" && !Array.isArray(obj));
}
exports.isObject = isObject;
const isDefined = (v) => v !== undefined && v !== null;
exports.isDefined = isDefined;
//# sourceMappingURL=utils.js.map
"use strict";
const Prostgles_1 = require("./Prostgles");
function prostgles(params) {
    const prgl = new Prostgles_1.Prostgles(params);
    return prgl.init(params.onReady, "initialise");
}
module.exports = prostgles;
//# sourceMappingURL=index.js.map
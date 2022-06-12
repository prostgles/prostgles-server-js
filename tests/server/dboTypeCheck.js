"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDboTypes = void 0;
const testDboTypes = () => {
    (() => {
        const dbo = 1;
        dbo.someTable?.find;
        const dbo1 = 1;
        dbo1.w?.find;
        const db = 1;
        db.items2.find;
    });
};
exports.testDboTypes = testDboTypes;

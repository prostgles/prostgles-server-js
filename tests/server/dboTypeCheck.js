"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDboTypes = void 0;
const testDboTypes = () => {
    (async () => {
        const dbo = 1;
        dbo.someTable?.find;
        const dbo1 = 1;
        dbo1.w?.find;
        const db = 1;
        db.items2.find;
        const values = await db.items2.find({}, { select: { items_id: 1 }, returnType: "values" });
        const numArr = values;
        const publish = {
            items: {
                insert: {
                    fields: { name: 1 },
                    validate: async (row) => ({
                        ...row,
                        h: [""]
                    })
                }
            }
        };
    });
};
exports.testDboTypes = testDboTypes;

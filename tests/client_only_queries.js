"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
async function client_only(db) {
    return new Promise(async (resolve, reject) => {
        /* RAWSQL */
        const sqlStatement = await db.sql("SELECT $1", [1], { returnType: "statement" });
        assert_1.strict.equal(sqlStatement, "SELECT 1", "db.sql statement query failed");
        const select1 = await db.sql("SELECT $1 as col1", [1], { returnType: "rows" });
        assert_1.strict.deepStrictEqual(select1[0], { col1: 1 }, "db.sql justRows query failed");
        const fullResult = await db.sql("SELECT $1 as col1", [1]);
        assert_1.strict.deepStrictEqual(fullResult.rows[0], { col1: 1 }, "db.sql query failed");
        assert_1.strict.deepStrictEqual(fullResult.fields, [{ name: 'col1', dataType: 'int4' }], "db.sql query failed");
        /* REPLICATION */
        let start = Date.now();
        const msLimit = 30000;
        setTimeout(() => {
            reject("Replication test failed due to taking longer than " + msLimit + "ms");
        }, msLimit);
        await db.planes.delete();
        let inserts = new Array(100).fill(null).map((d, i) => ({ id: i, flight_number: `FN${i}`, x: Math.random(), y: i }));
        await db.planes.insert(inserts);
        let updt = 0;
        db.planes.sync({}, { handlesOnData: true, patchText: true }, (planes, deltas) => {
            const x20 = planes.filter(p => p.x == 20).length;
            console.log("sync.x10", planes.filter(p => p.x == 10).length, "x20", x20);
            let update = false;
            planes.map(p => {
                // if(p.y === 1) window.up = p;
                if (typeof p.x !== "number")
                    console.log(typeof p.x);
                if (+p.x < 10) {
                    updt++;
                    update = true;
                    p.$update({ x: 10 });
                }
            });
            // if(update) console.log("$update({ x: 10 })", updt)
            if (x20 === 100) {
                // console.log(22)
                // console.timeEnd("test")
                console.log("Finished replication test. Inserting 100 rows then updating two times took: " + (Date.now() - start) + "ms");
                resolve(true);
            }
        });
        // await db.planes.update({}, { x: 20, last_updated: Date.now() });
        /* After all sync records are updated to x10 here we'll update them to x20 */
        const sP = await db.planes.subscribe({ x: 10 }, {}, async (planes) => {
            const p10 = planes.filter(p => p.x == 10).length;
            // console.log("sub.x10", p10, "x20", planes.filter(p => p.x == 20).length);
            if (p10 === 100) {
                // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(console.log);
                sP.unsubscribe();
                console.log("Update to x20 start");
                await db.planes.update({}, { x: 20, last_updated: Date.now() });
                console.log("Updated to x20", await db.planes.count({ x: 20 }));
                // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(console.log)
            }
        });
        // assert.deepStrictEqual(fo,    { h: null, id: 1, name: 'a' }, "findOne query failed" );
        // assert.deepStrictEqual(f[0],  { h: null, id: 1, name: 'a' }, "findOne query failed" );
    });
}
exports.default = client_only;

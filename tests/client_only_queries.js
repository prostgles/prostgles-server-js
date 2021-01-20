"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
const isomorphic_queries_1 = require("./isomorphic_queries");
async function client_only(db, auth, log) {
    const testRealtime = () => {
        log("Started testRealtime");
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
            const msLimit = 15000;
            setTimeout(() => {
                const msg = "Replication test failed due to taking longer than " + msLimit + "ms";
                log(msg);
                reject(msg);
            }, msLimit);
            await db.planes.delete();
            let inserts = new Array(100).fill(null).map((d, i) => ({ id: i, flight_number: `FN${i}`, x: Math.random(), y: i }));
            await db.planes.insert(inserts);
            /* After all sync records are updated to x10 here we'll update them to x20 */
            const sP = await db.planes.subscribe({ x: 10 }, {}, async (planes) => {
                const p10 = planes.filter(p => p.x == 10).length;
                log("sub.x10", p10, "x20", planes.filter(p => p.x == 20).length);
                if (p10 === 100) {
                    // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(log);
                    sP.unsubscribe();
                    log("Update to x20 start");
                    await db.planes.update({}, { x: 20, last_updated: Date.now() });
                    log("Updated to x20", await db.planes.count({ x: 20 }));
                    // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(log)
                }
            });
            let updt = 0;
            const sync = await db.planes.sync({}, { handlesOnData: true, patchText: true }, (planes, deltas) => {
                const x20 = planes.filter(p => p.x == 20).length;
                log("sync.x10", planes.filter(p => p.x == 10).length, "x20", x20);
                let update = false;
                planes.map(p => {
                    // if(p.y === 1) window.up = p;
                    if (typeof p.x !== "number")
                        log(typeof p.x);
                    if (+p.x < 10) {
                        updt++;
                        update = true;
                        p.$update({ x: 10 });
                    }
                });
                // if(update) log("$update({ x: 10 })", updt)
                if (x20 === 100) {
                    // log(22)
                    // console.timeEnd("test")
                    log("Finished replication test. Inserting 100 rows then updating two times took: " + (Date.now() - start) + "ms");
                    resolve(true);
                }
            });
            // sync.upsert(inserts)
            // await db.planes.update({}, { x: 20, last_updated: Date.now() });
        });
    };
    /* TODO: SECURITY */
    log("auth.user:", auth.user);
    if (!auth.user) {
        log("Checking public data");
        // Public data
        await isomorphic_queries_1.tryRun("Security rules example", async () => {
            const vQ = await db.items4.find({}, { select: { added: 0 } });
            assert_1.strict.deepStrictEqual(vQ, [
                { id: 1, public: 'public data' },
                { id: 2, public: 'public data' }
            ]);
        });
        await testRealtime();
        // auth.login({ username: "john", password: "secret" });
        // await tout();
    }
    else {
        log("Checking User data");
        // User data
        await isomorphic_queries_1.tryRun("Security rules example", async () => {
            const vQ = await db.items4.find();
            assert_1.strict.deepStrictEqual(vQ, [
                { id: 1, public: 'public data' },
                { id: 2, public: 'public data' }
            ]);
        });
    }
}
exports.default = client_only;
const tout = (t = 3000) => {
    return new Promise(async (resolve, reject) => {
        setTimeout(() => {
            resolve(true);
        }, t);
    });
};

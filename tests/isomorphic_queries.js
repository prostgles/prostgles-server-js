"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
async function isomorphic(db) {
    await db.items.delete({});
    await db.items2.delete({});
    await db.items3.delete({});
    // setTimeout(async () => {
    // 	await db.any("DROP TABLE IF EXISTS tt; CREATE TABLE tt(id serial);");
    // }, 500)
    /* Exists filter example */
    await db.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
    await db.items2.insert([{ name: "a", items_id: 1 }]);
    await db.items3.insert([{ name: "a" }]);
    const fo = await db.items.findOne(), f = await db.items.find();
    assert_1.strict.deepStrictEqual(fo, { h: null, id: 1, name: 'a' }, "findOne query failed");
    assert_1.strict.deepStrictEqual(f[0], { h: null, id: 1, name: 'a' }, "findOne query failed");
    // return;
    const expect0 = await db.items.count({
        $and: [
            { $exists: { items2: { name: "a" } } },
            { $exists: { items3: { name: "b" } } },
        ]
    });
    assert_1.strict.equal(expect0, 0, "$exists query failed");
    /* joinsTo filter example */
    const expect2 = await db.items.find({
        $and: [
            { $existsJoined: { "**.items3": { name: "a" } } },
            { $existsJoined: { items2: { name: "a" } } }
        ]
    });
    assert_1.strict.equal(expect2.length, 2, "$existsJoined query failed");
    /* exists with exact path filter example */
    const _expect2 = await db.items.find({
        $and: [
            // { "items2": { name: "a" } },
            // { "items2.items3": { name: "a" } },
            { $existsJoined: { items2: { name: "a" } } }
        ]
    });
    assert_1.strict.equal(_expect2.length, 2, "$existsJoined query failed");
    /* Upsert */
    await db.items.upsert({ name: "tx" }, { name: "tx" });
    await db.items.upsert({ name: "tx" }, { name: "tx" });
    assert_1.strict.equal(await db.items.count({ name: "tx" }), 1, "upsert command failed");
    /* Aggregate functions example */
    const aggs = await db.items.findOne({}, {
        select: {
            id: "$count",
            max_id: { $max: "id" },
            total: { $count: ["id"] },
            distinct_names: { $countDistinct: ["name"] },
        },
        orderBy: {
            max_id: -1
        }
    });
    assert_1.strict.deepStrictEqual(aggs, { id: '4', max_id: 4, total: '4', distinct_names: '3' }, "Aggregation query failed");
    /* Joins example */
    const items = await db.items.find({}, {
        select: {
            "*": 1,
            items3: "*",
            items22: db.leftJoin.items2({}, "*")
        }
    });
    if (!items.length || !items.every(it => Array.isArray(it.items3) && Array.isArray(it.items22))) {
        console.log(items[0].items3);
        throw "Joined select query failed";
    }
    const rowhash = await db.items.findOne({}, { select: { $rowhash: 1 } });
    if (typeof rowhash.$rowhash !== "string")
        throw "$rowhash query failed";
}
exports.default = isomorphic;

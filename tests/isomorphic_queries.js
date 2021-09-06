"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryRunP = exports.tryRun = void 0;
const assert_1 = require("assert");
async function tryRun(desc, func) {
    try {
        await func();
    }
    catch (err) {
        console.error(desc + " FAILED:");
        throw err;
    }
}
exports.tryRun = tryRun;
function tryRunP(desc, func) {
    return new Promise((rv, rj) => {
        func(rv, rj);
    });
}
exports.tryRunP = tryRunP;
async function isomorphic(db) {
    console.log("Starting isomorphic queries");
    await db.items.delete({});
    await db.items2.delete({});
    await db.items3.delete({});
    await db.items4_pub.delete({});
    /* Access controlled */
    await db.items4.delete({});
    // setTimeout(async () => {
    // 	await db.any("DROP TABLE IF EXISTS tt; CREATE TABLE tt(id serial);");
    // }, 500)
    await tryRun("Prepare data", async () => {
        await db.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
        await db.items2.insert([{ name: "a", items_id: 1 }]);
        await db.items3.insert([{ name: "a" }, { name: "za123" }]);
        await db.items4.insert([
            { name: "abc1", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
            { name: "abc2", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
            { name: "abcd", public: "public data d", added: new Date('04 Dec 1996 00:12:00 GMT') }
        ]);
        /* Ensure */
        await db["*"].insert([{ "*": "a" }, { "*": "a" }, { "*": "b" }]);
        await db[`"*"`].insert([{ [`"*"`]: "a" }, { [`"*"`]: "a" }, { [`"*"`]: "b" }]);
        await db.various.insert([
            { name: "abc9", added: new Date('04 Dec 1995 00:12:00 GMT'), jsn: { "a": { "b": 2 } } },
            { name: "abc1", added: new Date('04 Dec 1996 00:12:00 GMT'), jsn: { "a": { "b": 3 } } },
            { name: "abc81 here", added: new Date('04 Dec 1997 00:12:00 GMT'), jsn: { "a": { "b": 2 } } }
        ]);
        // console.log(await db["*"].find())
    });
    await tryRun("getColumns definition", async () => {
        const res = await db.tr2.getColumns();
        assert_1.strict.deepStrictEqual(res, [
            {
                comment: null,
                data_type: 'integer',
                delete: true,
                element_type: null,
                filter: true,
                insert: true,
                is_nullable: false,
                is_pkey: true,
                name: 'id',
                ordinal_position: 1,
                references: null,
                select: true,
                tsDataType: 'number',
                udt_name: 'int4',
                update: true
            },
            {
                comment: null,
                data_type: 'integer',
                delete: true,
                element_type: null,
                filter: true,
                insert: true,
                is_nullable: true,
                is_pkey: false,
                name: 'tr1_id',
                ordinal_position: 2,
                references: {
                    cols: [
                        'tr1_id'
                    ],
                    fcols: [
                        'id'
                    ],
                    ftable: 'tr1'
                },
                select: true,
                tsDataType: 'number',
                udt_name: 'int4',
                update: true
            },
            {
                comment: null,
                data_type: 'text',
                delete: true,
                element_type: null,
                filter: true,
                insert: true,
                is_nullable: true,
                is_pkey: false,
                name: 't1',
                ordinal_position: 3,
                references: null,
                select: true,
                tsDataType: 'string',
                udt_name: 'text',
                update: true
            },
            {
                comment: null,
                data_type: 'text',
                delete: true,
                element_type: null,
                filter: true,
                insert: true,
                is_nullable: true,
                is_pkey: false,
                name: 't2',
                ordinal_position: 4,
                references: null,
                select: true,
                tsDataType: 'string',
                udt_name: 'text',
                update: true
            }
        ]);
    });
    // add getInfo and getCols tests
    // console.log(await db.items.getInfo(), await db.items.getColumns())
    /**
     * TODO -> ADD ALL FILTER TYPES
     */
    await tryRun("FTS filtering", async () => {
        const res = await db.various.count({ "tsv.@@.to_tsquery": ["a"] });
        assert_1.strict.equal(res, 0);
        const d = await db.various.findOne({ "name.@@.to_tsquery": ["abc81"] }, { select: {
                h: { "$ts_headline_simple": ["name", { plainto_tsquery: "abc81" }] },
                hh: { "$ts_headline": ["name", "abc81"] },
                added: "$date_trunc_2hour",
                addedY: { "$date_trunc_5minute": ["added"] }
            } });
        // console.log(d);
        /* Dates become strings after reaching client.
        * Serialize col dataTypes and then recast ??
        */
        assert_1.strict.deepStrictEqual(JSON.parse(JSON.stringify(d)), {
            h: '<b>abc81</b> here',
            hh: '<b>abc81</b> here',
            added: '1997-12-04T00:00:00.000Z',
            addedY: '1997-12-04T00:10:00.000Z',
        });
    });
    await tryRun("$term_highlight", async () => {
        const term = "abc81";
        const res = await db.various.find({ "hIdx.>": -2 }, { select: {
                h: { $term_highlight: [["name"], term, {}] },
                hFull: { $term_highlight: ["*", "81", {}] },
                hOrdered: { $term_highlight: [["name", "id"], "81", {}] },
                hIdx: { $term_highlight: [["name"], term, { returnIndex: true }] },
            },
            orderBy: { hIdx: -1 }
        });
        // console.log(res[0])
        // console.log(res.map(r => JSON.stringify(r)).join("\n"));//, null, 2))  
        assert_1.strict.deepStrictEqual(res[0], {
            "h": ["name: ", ["abc81"], " here"],
            /* Search all allowed fields using "*"  */
            hFull: [
                'id: 3, h: , name: abc',
                ['81'],
                ' here, tsv: , jsn: {"a":{"b":2}}, added: 1997-12-04 00:12:00'
            ],
            /* Search specific fields in specific order */
            "hOrdered": ["name: abc", ["81"], " here, id: 3"], "hIdx": 6
        });
    });
    await tryRunP("subscribe", async (resolve, reject) => {
        await db.various.insert({ id: 99 });
        const sub = await db.various.subscribe({ id: 99 }, {}, async (items) => {
            const item = items[0];
            if (item && item.name === "zz3zz3") {
                await db.various.delete({ name: "zz3zz3" });
                sub.unsubscribe();
                resolve(true);
            }
        });
        await db.various.update({ id: 99 }, { name: "zz3zz1" });
        await db.various.update({ id: 99 }, { name: "zz3zz2" });
        await db.various.update({ id: 99 }, { name: "zz3zz3" });
    });
    await tryRunP("subscribeOne with throttle", async (resolve, reject) => {
        await db.various.insert({ id: 99 });
        const start = Date.now(); // name: "zz3zz" 
        const sub = await db.various.subscribeOne({ id: 99 }, { throttle: 1700 }, async (item) => {
            // const item = items[0]
            // console.log(item)
            const now = Date.now();
            if (item && item.name === "zz3zz2" && now - start > 1600 && now - start < 1800) {
                await db.various.delete({ name: "zz3zz2" });
                sub.unsubscribe();
                resolve(true);
            }
        });
        await db.various.update({ id: 99 }, { name: "zz3zz1" });
        await db.various.update({ id: 99 }, { name: "zz3zz2" });
    });
    await tryRun("JSON filtering", async () => {
        const res = await db.various.count({ "jsn->a->>b": '3' });
        assert_1.strict.equal(res, 1);
    });
    await tryRun("Between filtering", async () => {
        const res = await db.various.count({
            added: { $between: [
                    new Date('06 Dec 1995 00:12:00 GMT'),
                    new Date('03 Dec 1997 00:12:00 GMT')
                ] }
        });
        assert_1.strict.equal(res, 1);
    });
    await tryRun("In filtering", async () => {
        const res = await db.various.count({
            added: { $in: [
                    new Date('04 Dec 1996 00:12:00 GMT')
                ] }
        });
        assert_1.strict.equal(res, 1);
    });
    await tryRun("Order by", async () => {
        const res = await db.items.find({}, { select: { name: 1 }, orderBy: { name: -1 } });
        assert_1.strict.deepStrictEqual(res, [{ name: 'b' }, { name: 'a' }, { name: 'a' }]);
    });
    await tryRun("Order by aliased func", async () => {
        const res = await db.items.find({}, { select: { uname: { $upper: ["name"] }, count: { $countAll: [] } }, orderBy: { uname: -1 } });
        assert_1.strict.deepStrictEqual(res, [{ uname: 'B', count: '1' }, { uname: 'A', count: '2' }]);
    });
    await tryRun("Order by aggregation", async () => {
        const res = await db.items.find({}, { select: { name: 1, count: { $countAll: [] } }, orderBy: { count: -1 } });
        assert_1.strict.deepStrictEqual(res, [{ name: 'a', count: '2' }, { name: 'b', count: '1' }]);
    });
    await tryRun("Order by colliding alias name", async () => {
        const res = await db.items.find({}, { select: { name: { $countAll: [] }, n: { $left: ["name", 1] } }, orderBy: { name: -1 } });
        assert_1.strict.deepStrictEqual(res, [{ name: '2', n: 'a' }, { name: '1', n: 'b' }]);
    });
    await tryRun("Update batch example", async () => {
        await db.items4.updateBatch([
            [{ name: "abc1" }, { name: "abc" }],
            [{ name: "abc2" }, { name: "abc" }]
        ]);
        assert_1.strict.equal(await db.items4.count({ name: "abc" }), 2);
    });
    await tryRun("Function example", async () => {
        const f = await db.items4.findOne({}, { select: { public: 1, p_5: { $left: ["public", 3] } } });
        assert_1.strict.equal(f.p_5.length, 3);
        assert_1.strict.equal(f.p_5, f.public.substr(0, 3));
        // Nested function
        const fg = await db.items2.findOne({}, { select: { id: 1, name: 1, items3: { name: "$upper" } } }); // { $upper: ["public"] } } });
        assert_1.strict.deepStrictEqual(fg, { id: 1, name: 'a', items3: [{ name: 'A' }] });
        // Date utils
        const Mon = await db.items4.findOne({ name: "abc" }, { select: { added: "$Mon" } });
        assert_1.strict.deepStrictEqual(Mon, { added: "Dec" });
        // Date + agg
        const MonAgg = await db.items4.find({ name: "abc" }, { select: { added: "$Mon", public: "$count" } });
        assert_1.strict.deepStrictEqual(MonAgg, [{ added: "Dec", public: '2' }]);
        // Returning
        const returningParam = { returning: { id: 1, name: 1, public: 1, $rowhash: 1, added_day: { "$day": ["added"] } } }; //   ctid: 1,
        let i = await db.items4_pub.insert({ name: "abc123", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') }, returningParam);
        assert_1.strict.deepStrictEqual(i, { id: 1, name: 'abc123', public: 'public data', $rowhash: '347c26babad535aa697a794af89195fe', added_day: 'monday' }); //  , ctid: '(0,1)'
        let u = await db.items4_pub.update({ name: "abc123" }, { public: "public data2" }, returningParam);
        assert_1.strict.deepStrictEqual(u, [{ id: 1, name: 'abc123', public: 'public data2', $rowhash: '9d18ddfbff9e13411d13f82d414644de', added_day: 'monday' }]);
        let d = await db.items4_pub.delete({ name: "abc123" }, returningParam);
        assert_1.strict.deepStrictEqual(d, [{ id: 1, name: 'abc123', public: 'public data2', $rowhash: '9d18ddfbff9e13411d13f82d414644de', added_day: 'monday' }]);
        console.log("TODO: socket.io stringifies dates");
    });
    await tryRun("Exists filter example", async () => {
        const fo = await db.items.findOne(), f = await db.items.find();
        assert_1.strict.deepStrictEqual(fo, { h: null, id: 1, name: 'a' }, "findOne query failed");
        assert_1.strict.deepStrictEqual(f[0], { h: null, id: 1, name: 'a' }, "findOne query failed");
    });
    await tryRun("Basic exists", async () => {
        const expect0 = await db.items.count({
            $and: [
                { $exists: { items2: { name: "a" } } },
                { $exists: { items3: { name: "b" } } },
            ]
        });
        assert_1.strict.equal(expect0, 0, "$exists query failed");
    });
    await tryRun("Basic fts with shorthand notation", async () => {
        const res = await db.items.count({
            $and: [
                { $exists: { items2: { "name.@@.to_tsquery": ["a"] } } },
                { $exists: { items3: { "name.@@.to_tsquery": ["b"] } } },
            ]
        });
        // assert.deepStrictEqual(res, { name: 'a'})
        assert_1.strict.equal(res, 0, "FTS query failed");
    });
    await tryRun("Exists with shortest path wildcard filter example", async () => {
        const expect2 = await db.items.find({
            $and: [
                { $existsJoined: { "**.items3": { name: "a" } } },
                { $existsJoined: { items2: { name: "a" } } }
            ]
        });
        assert_1.strict.equal(expect2.length, 2, "$existsJoined query failed");
    });
    await tryRun("Exists with exact path filter example", async () => {
        const _expect2 = await db.items.find({
            $and: [
                // { "items2": { name: "a" } },
                // { "items2.items3": { name: "a" } },
                { $existsJoined: { items2: { name: "a" } } }
            ]
        });
        assert_1.strict.equal(_expect2.length, 2, "$existsJoined query failed");
    });
    /* Upsert */
    await tryRun("Upsert example", async () => {
        await db.items.upsert({ name: "tx" }, { name: "tx" });
        await db.items.upsert({ name: "tx" }, { name: "tx" });
        assert_1.strict.equal(await db.items.count({ name: "tx" }), 1, "upsert command failed");
    });
    /* Joins example */
    await tryRun("Joins example", async () => {
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
    });
    /* Joins duplicate table example */
    await tryRun("Joins repeating table example", async () => {
        const items2 = await db.items.find({}, {
            select: {
                "*": 1,
                items2: "*"
            }
        });
        const items2j = await db.items.find({}, {
            select: {
                "*": 1,
                items2: "*",
                items2j: db.leftJoin.items2({}, "*")
            }
        });
        items2.forEach((d, i) => {
            assert_1.strict.deepStrictEqual(d.items2, items2j[i].items2, "Joins duplicate aliased table query failed");
            assert_1.strict.deepStrictEqual(d.items2, items2j[i].items2j, "Joins duplicate aliased table query failed");
        });
    });
    await tryRun("Join aggregate functions example", async () => {
        const singleShortHandAgg = await db.items.findOne({}, { select: { id: "$max" } });
        const singleAgg = await db.items.findOne({}, { select: { id: { "$max": ["id"] } } });
        assert_1.strict.deepStrictEqual(singleShortHandAgg, { id: 4 });
        assert_1.strict.deepStrictEqual(singleAgg, { id: 4 });
        const shortHandAggJoined = await db.items.findOne({ id: 4 }, { select: { id: 1, items2: { name: "$max" } } });
        assert_1.strict.deepStrictEqual(shortHandAggJoined, { id: 4, items2: [] });
        // console.log(JSON.stringify(shortHandAggJoined, null, 2));
        // throw 1;
        /* TODO joins & aggs */
        // const aggsJoined = await db.items.find(
        //   {}, 
        //   { 
        //     select: {
        //       id: "$count", 
        //       name: 1,
        //       items2: {
        //         id: 1
        //       }
        //     },
        //     orderBy: {
        //       id: -1
        //     }
        //   }
        // );
        // console.log(JSON.stringify(aggsJoined, null, 2))
        // assert.deepStrictEqual(aggsJoined, [
        //   {
        //     "name": "a",
        //     "items2": [
        //       {
        //         "id": 1
        //       },
        //       {
        //         "id": 1
        //       }
        //     ],
        //     "id": "2"
        //   },
        //   {
        //     "name": "b",
        //     "items2": [],
        //     "id": "1"
        //   },
        //   {
        //     "name": "tx",
        //     "items2": [],
        //     "id": "1"
        //   }
        // ], "Joined aggregation query failed");
    });
    /* $rowhash -> Custom column that returms md5(ctid + allowed select columns). Used in joins & CRUD to bypass PKey details */
    await tryRun("$rowhash example", async () => {
        const rowhash = await db.items.findOne({}, { select: { $rowhash: 1, "*": 1 } });
        const f = { $rowhash: rowhash.$rowhash };
        const rowhashView = await db.v_items.findOne({}, { select: { $rowhash: 1 } });
        const rh1 = await db.items.findOne({ $rowhash: rowhash.$rowhash }, { select: { $rowhash: 1 } });
        const rhView = await db.v_items.findOne({ $rowhash: rowhashView.$rowhash }, { select: { $rowhash: 1 } });
        // console.log({ rowhash, f });
        await db.items.update(f, { name: 'a' });
        // console.log(rowhash, rh1)
        // console.log(rowhashView, rhView)
        if (typeof rowhash.$rowhash !== "string" ||
            typeof rowhashView.$rowhash !== "string" ||
            rowhash.$rowhash !== rh1.$rowhash ||
            rowhashView.$rowhash !== rhView.$rowhash) {
            throw "$rowhash query failed";
        }
    });
}
exports.default = isomorphic;

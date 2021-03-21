import { strict as assert } from 'assert';

import { DbHandler } from "../dist/Prostgles";
import { DBHandlerClient } from "./client/index";

export async function tryRun(desc: string, func: () => any){
  try {
    await func();
  } catch(err) {
    console.error(desc + " FAILED:");
    throw err;
  }
}

export default async function isomorphic(db: Partial<DbHandler> | Partial<DBHandlerClient>){
  await db.items.delete({ });
  await db.items2.delete({ });
  await db.items3.delete({ });
  await db.items4_pub.delete({ });

  /* Access controlled */
  await db.items4.delete({ });

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

    // console.log(await db["*"].find())
  });

  await tryRun("Order by", async () => {
    const res = await db.items.find({ }, { select: { name: 1 }, orderBy: { name: -1 }});
    assert.deepStrictEqual(res, [{ name: 'b'}, { name: 'a'}, { name: 'a'}])
  });

  await tryRun("Order by aliased func", async () => {
    const res = await db.items.find({ }, { select: { uname: { $upper: ["name"] }, count: { $countAll: [] } }, orderBy: { uname: -1 }});
    assert.deepStrictEqual(res, [{ uname: 'B', count: '1'}, { uname: 'A', count: '2'} ])
  });

  await tryRun("Order by aggregation", async () => {
    const res = await db.items.find({ }, { select: { name: 1, count: { $countAll: [] } }, orderBy: { count: -1 }});
    assert.deepStrictEqual(res, [  { name: 'a', count: '2'} , { name: 'b', count: '1'} ])
  });

  await tryRun("Update batch example", async () => {
    
    await db.items4.updateBatch([
      [{ name: "abc1" }, { name: "abc" }],
      [{ name: "abc2" }, { name: "abc" }]
    ]);
    assert.equal(await db.items4.count({ name: "abc" }), 2);
  })

  await tryRun("Function example", async () => {
  
    const f = await db.items4.findOne({}, { select: { public: 1, p_5: { $left: ["public", 3] } } });
    assert.equal(f.p_5.length, 3);
    assert.equal(f.p_5, f.public.substr(0, 3));

    // Nested function
    const fg = await db.items2.findOne({}, { select: { id: 1, name: 1, items3: { name: "$upper" } } });// { $upper: ["public"] } } });
    assert.deepStrictEqual(fg, { id: 1, name: 'a', items3: [ { name: 'A' } ] });

    // Date utils
    const Mon = await db.items4.findOne({ name: "abc" }, { select: { added: "$Mon" } });
    assert.deepStrictEqual(Mon, { added: "Dec" });

    // Date + agg
    const MonAgg = await db.items4.find({ name: "abc" }, { select: { added: "$Mon", public: "$count" } });
    assert.deepStrictEqual(MonAgg, [{ added: "Dec", public: '2' }]);

    // Returning
    const returningParam = { returning: { id: 1, name: 1, public: 1 , $rowhash: 1, added_day: { "$day": ["added"] } }} ;
    let i = await db.items4_pub.insert( { name: "abc123", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') }, returningParam);
    assert.deepStrictEqual(i, { id: 1,  name: 'abc123', public: 'public data', $rowhash: 'e593cd919283f0fe7c205f09894ee53f', added_day: 'monday'  });
  
    let u = await db.items4_pub.update( { name: "abc123" }, { public: "public data2" }, returningParam);
    assert.deepStrictEqual(u, [{ id: 1,  name: 'abc123', public: 'public data2', $rowhash: '31574189d0257a4e5442f8db39658cf0', added_day: 'monday'  }]);
  
    let d = await db.items4_pub.delete( { name: "abc123" }, returningParam);
    assert.deepStrictEqual(d, [{ id: 1,  name: 'abc123', public: 'public data2', $rowhash: '31574189d0257a4e5442f8db39658cf0', added_day: 'monday'  }]);
	
    console.log("TODO: socket.io stringifies dates")
  });
  
  await tryRun("Exists filter example", async () => {
  
    const fo = await db.items.findOne(),
      f = await db.items.find();
      
    assert.deepStrictEqual(fo,    { h: null, id: 1, name: 'a' }, "findOne query failed" );
    assert.deepStrictEqual(f[0],  { h: null, id: 1, name: 'a' }, "findOne query failed" );
  });

  await tryRun("Basic exists", async () => {
    const expect0 = await db.items.count({ 
      $and: [
        { $exists: { items2: { name: "a" } } },
        { $exists: { items3: { name: "b" } } },
      ]
    });
    assert.equal(expect0, 0, "$exists query failed")
  });
  
  await tryRun("Exists with shortest path wildcard filter example", async () => {
    const expect2 = await db.items.find({ 
      $and: [
        { $existsJoined: { "**.items3": { name: "a" } } },
        { $existsJoined: { items2: { name: "a" } } }
      ]
    });
    assert.equal(expect2.length, 2, "$existsJoined query failed");
  });
     

  await tryRun("Exists with exact path filter example", async () => {
    const _expect2 = await db.items.find({ 
      $and: [
        // { "items2": { name: "a" } },
        // { "items2.items3": { name: "a" } },
        { $existsJoined: { items2: { name: "a" } } }
      ] 
    });
    assert.equal(_expect2.length, 2, "$existsJoined query failed");
  });

  /* Upsert */
  await tryRun("Upsert example", async () => {
    await db.items.upsert({ name: "tx" }, { name: "tx" });
    await db.items.upsert({ name: "tx" }, { name: "tx" });
    assert.equal(await db.items.count({ name: "tx" }), 1, "upsert command failed");
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
    
    if(!items.length || !items.every(it => Array.isArray(it.items3) && Array.isArray(it.items22))){
      console.log(items[0].items3)
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
    
    items2.forEach((d, i)=> {
      assert.deepStrictEqual(d.items2, items2j[i].items2, "Joins duplicate aliased table query failed");
      assert.deepStrictEqual(d.items2, items2j[i].items2j, "Joins duplicate aliased table query failed");
    });
  });
  
  
  
  await tryRun("Join aggregate functions example", async () => {
    const singleShortHandAgg = await db.items.findOne(
      {},
      { select: { id: "$max" }}
    );
    const singleAgg = await db.items.findOne(
      {},
      { select: { id: { "$max": ["id"] } }}
    );
    assert.deepStrictEqual(singleShortHandAgg, { id: 4 });
    assert.deepStrictEqual(singleAgg, { id: 4 });

    const shortHandAggJoined = await db.items.findOne(
      { id: 4 },
      { select: { id: 1, items2: { name: "$max" } }}
    );
    assert.deepStrictEqual(shortHandAggJoined, { id: 4, items2: [] });
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
    const rowhash = await db.items.findOne({}, { select: { $rowhash: 1 }});
    const rowhashView = await db.v_items.findOne({}, { select: { $rowhash: 1 }});
    const rh1 = await db.items.findOne({ $rowhash: rowhash.$rowhash }, { select: { $rowhash: 1 }});
    const rhView = await db.v_items.findOne({ $rowhash: rowhashView.$rowhash }, { select: { $rowhash: 1 }});
    // console.log(rowhash, rh1)
    // console.log(rowhashView, rhView)
    if(
      typeof rowhash.$rowhash !== "string" || 
      typeof rowhashView.$rowhash !== "string" ||
      rowhash.$rowhash !== rh1.$rowhash ||
      rowhashView.$rowhash !== rhView.$rowhash
    ){ 
      throw "$rowhash query failed";
    }
  });
}
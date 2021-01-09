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
      { name: "abc", public: "public data" },
      { name: "abcd", public: "public data d" }
    ]);
  });

  await tryRun("Function example", async () => {
  
    const f = await db.items4.findOne({}, { select: { public: 1, p_5: { $left: ["public", 3] } } });
    assert.equal(f.p_5.length, 3);
    assert.equal(f.p_5, f.public.substr(0, 3));

    /* TODO joined functions */
    // const fJoined = await db.items2.findOne(
    //   { $existsJoined: { items3: { name: { ">": "a"} } } }, 
    //   { select: { 
    //     id: 1, 
    //     p_5: { $left: ["name", 3] },
    //     items3: "*" 
    //   } });
    // console.log(fJoined)
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
  
  /* Exists with shortest path wildcard filter example */
  await tryRun("Exists with shortest path wildcard filter example", async () => {
    const expect2 = await db.items.find({ 
      $and: [
        { $existsJoined: { "**.items3": { name: "a" } } },
        { $existsJoined: { items2: { name: "a" } } }
      ]
    });
    assert.equal(expect2.length, 2, "$existsJoined query failed");
  });
     

  /* Exists with exact path filter example */
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
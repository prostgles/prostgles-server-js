import { strict as assert } from 'assert';

import { DbHandler } from "../dist/Prostgles";
import { DBHandlerClient } from "./client/index";

export default async function isomorphic(db: Partial<DbHandler> | Partial<DBHandlerClient>){
  await db.items.delete({ });
  await db.items2.delete({ });
  await db.items3.delete({ });

  // setTimeout(async () => {
  // 	await db.any("DROP TABLE IF EXISTS tt; CREATE TABLE tt(id serial);");

  // }, 500)
  
  /* Exists filter example */
  await db.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
  await db.items2.insert([{ name: "a", items_id: 1 }]);
  await db.items3.insert([{ name: "a" }]);

  const fo = await db.items.findOne(),
    f = await db.items.find();
    
  assert.deepStrictEqual(fo,    { h: null, id: 1, name: 'a' }, "findOne query failed" );
  assert.deepStrictEqual(f[0],  { h: null, id: 1, name: 'a' }, "findOne query failed" );

  /* Basic exists */
  const expect0 = await db.items.count({ 
    $and: [
      { $exists: { items2: { name: "a" } } },
      { $exists: { items3: { name: "b" } } },
    ]
  });
  assert.equal(expect0, 0, "$exists query failed")
  
  
  /* Exists with shortest path wildcard filter example */
  const expect2 = await db.items.find({ 
    $and: [
      { $existsJoined: { "**.items3": { name: "a" } } },
      { $existsJoined: { items2: { name: "a" } } }
    ]
  });
  assert.equal(expect2.length, 2, "$existsJoined query failed");
     

  /* Exists with exact path filter example */
  const _expect2 = await db.items.find({ 
    $and: [
      // { "items2": { name: "a" } },
      // { "items2.items3": { name: "a" } },
      { $existsJoined: { items2: { name: "a" } } }
    ] 
  });
  assert.equal(_expect2.length, 2, "$existsJoined query failed")

  /* Upsert */
  await db.items.upsert({ name: "tx" }, { name: "tx" });
  await db.items.upsert({ name: "tx" }, { name: "tx" });
  assert.equal(await db.items.count({ name: "tx" }), 1, "upsert command failed")

  /* Joins example */
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

  /* Joins duplicate table example */
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
  
  
  
  /* Join aggregate functions example */
  const aggsJoined = await db.items.find(
    {}, 
    { 
      select: {
        id: "$count", 
        name: 1,
        items2: {
          id: 1
        }
      },
      orderBy: {
        id: -1
      }
    }
  );
  // console.log(JSON.stringify(aggsJoined, null, 2))
  assert.deepStrictEqual(aggsJoined, [
    {
      "name": "a",
      "items2": [
        {
          "id": 1
        },
        {
          "id": 1
        }
      ],
      "id": "2"
    },
    {
      "name": "b",
      "items2": [],
      "id": "1"
    },
    {
      "name": "tx",
      "items2": [],
      "id": "1"
    }
  ], "Joined aggregation query failed");




  /* $rowhash -> Custom column that returms md5(ctid + allowed select columns). Used in joins & CRUD to bypass PKey details */
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
}
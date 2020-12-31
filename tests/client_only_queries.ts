import { strict as assert, rejects } from 'assert';

import { DBHandlerClient } from "./client/index";

export default async function client_only(db: DBHandlerClient){
  
  return new Promise(async (resolve, reject) => {

    let start = Date.now();

    setTimeout(() => {
      reject("Replication test failed due to taking longer than 3 seconds")
    }, 3000)

    await db.planes.delete();
    let inserts = new Array(100).fill(null).map((d, i) => ({ id: i, flight_number: `FN${i}`, x: Math.random(), y: i }));
    await db.planes.insert(inserts);
  
    db.planes.sync({}, { handlesOnData: true, patchText: true }, planes => {
      // console.log(0, planes.length)
      

      planes.map(p => {
        // if(p.y === 1) window.up = p;
        if(p.x < 10) p.$update({ x: 10 });
      });

      if(planes.filter(p => p.x == 20).length === 100){
        // console.log(22)
        // console.timeEnd("test")
        console.log("Finished replication test. Inserting 100 rows then updating two times took: " + (Date.now() - start) + "ms")
        resolve(true)
      }
    });
    
    const sP = await db.planes.subscribe({ x: 10 }, { }, async planes => {
      // console.log(1, planes[0])

      if(planes.filter(p => p.x == 10).length === 100){
        // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(console.log);

        await db.planes.update({}, { x: 20, last_updated: Date.now() });

        // db.planes.findOne({}, { select: { last_updated: "$max"}}).then(console.log)
        sP.unsubscribe();
      }
    });
  
    // assert.deepStrictEqual(fo,    { h: null, id: 1, name: 'a' }, "findOne query failed" );
    // assert.deepStrictEqual(f[0],  { h: null, id: 1, name: 'a' }, "findOne query failed" );
  
  });

}
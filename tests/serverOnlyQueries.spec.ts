import { DBHandlerServer } from "../dist/DboBuilder";
import { test, describe } from "node:test";

export const serverOnlyQueries = async (db: DBHandlerServer) => {

  await describe('Server Only Queries', async () => {
    await test('Self reference recursion bug', async () => {
      await db.rec.findOne!({ id: 1 }, { select: { "*": 1, rec_ref: "*" } });
    });
    await test('Transactions', async () => {
      await db.tx!(async t => {
        await t.items.insert!({ name: "tx_" });
        const expect1 = await t.items.count!({ name: "tx_" });
        const expect0 = await db.items.count!({ name: "tx_" });
        if(expect0 !== 0 || expect1 !== 1) throw "db.tx failed";
    
        //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
      });
      const expect1 = await db.items.count!({ name: "tx_" });
      if(expect1 !== 1) throw "db.tx failed";
    });
    
    await test('TableConfig onMount works', async () => {
      await db.api_table.findOne!({ id: 1 });
      const newRow = await db.api_table.insert!({ }, { returning: "*" });
      if(newRow.col1 !== null) {
        throw "api_table onMount failed: col1 missing. Got: " + JSON.stringify(newRow);
      }
    });
  });

  // // /** Self reference recursion bug */
  // await db.rec.findOne!({ id: 1 }, { select: { "*": 1, rec_ref: "*" } })

  // /* Transaction example */
  // await db.tx!(async t => {
  //   await t.items.insert!({ name: "tx_" });
  //   const expect1 = await t.items.count!({ name: "tx_" });
  //   const expect0 = await db.items.count!({ name: "tx_" });
  //   if(expect0 !== 0 || expect1 !== 1) throw "db.tx failed";

  //   //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
  // });
  // const expect1 = await db.items.count!({ name: "tx_" });
  // if(expect1 !== 1) throw "db.tx failed";

  // /** TableConfig onMount works */
  // await db.api_table.findOne!({ id: 1 });
  // const newRow = await db.api_table.insert!({ }, { returning: "*" });
  // if(newRow.col1 !== null) {
  //   throw "api_table onMount failed: col1 missing. Got: " + JSON.stringify(newRow);
  // }
}
import { DBHandlerServer } from "../dist/DboBuilder";
import { strict as assert } from 'assert';

export default async function f(db: DBHandlerServer){

  /** Self reference recursion bug */
  await db.rec.findOne!({ id: 1 }, { select: { "*": 1, rec_ref: "*" } })

  const whereStatement = await db.rec.find!({ id: 1  }, undefined, undefined, undefined, { returnQuery: "where-condition" });

  assert.equal(whereStatement, `"id" = 1`);

  /* Transaction example */
  await db.tx!(async t => {
    await t.items.insert!({ name: "tx_" });
    const expect1 = await t.items.count!({ name: "tx_" });
    const expect0 = await db.items.count!({ name: "tx_" });
    if(expect0 !== 0 || expect1 !== 1) throw "db.tx failed";

    //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
  });
  const expect1 = await db.items.count!({ name: "tx_" });
  if(expect1 !== 1) throw "db.tx failed";

}
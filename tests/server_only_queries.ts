import { DBHandlerServer } from "../dist/DboBuilder";

export default async function f(db: DBHandlerServer){

  /** Self reference recursion bug */
  await db.rec.findOne!({ id: 1 }, { select: { "*": 1, rec_ref: "*" } })

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

  /** TableConfig onMount works */
  await db.api_table.findOne!({ id: 1 });
  const newRow = await db.api_table.insert!({ }, { returning: "*" });
  if(newRow.col1 !== null) {
    throw "api_table onMount failed: col1 missing. Got: " + JSON.stringify(newRow);
  }
}
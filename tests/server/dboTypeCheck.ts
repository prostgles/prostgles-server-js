import type { DBOFullyTyped } from "../../dist/DBSchemaBuilder";
import type { DBHandlerServer } from "../../dist/DboBuilder";
import { DBSchemaGenerated } from "./DBoGenerated";
import { Publish } from "../../dist/PublishParser";

export const testDboTypes =  () => {
  (async () => {
    const dbo: DBOFullyTyped = 1 as any;
    dbo.someTable?.find;

    const dbo1: DBHandlerServer = 1 as any;
    dbo1.w?.find;


    const db: DBOFullyTyped<DBSchemaGenerated> = 1 as any;
    db.items2.find;

    const values = await db.items2.find({}, { select: { items_id: 1 }, returnType: "values" });
    const numArr: number[] = values;


    const publish: Publish<DBSchemaGenerated> = {
      items: {
        insert: {
          fields: { name: 1 },
          validate: async (row) => ({
            ...row,
            h: [""]
          })
        }
      }
    }
  })
}
import { ViewHandler } from "prostgles-types";
import type { DBOFullyTyped } from "../DBSchemaBuilder";
import type { DBHandlerServer } from "../DboBuilder/DboBuilder";
import { Publish } from "../PublishParser/PublishParser";
import { DBGeneratedSchema } from "./DBoGenerated";

type DBSchema2 = {
  tr2: {
    is_view: false;
    select: true;
    insert: true;
    update: true;
    delete: true;
    columns: {
      id?: number;
      t1?: null | string;
      t2?: null | string;
      tr1_id?: null | number;
    };
  };
};
export const testDboTypes = () => {
  async () => {
    const dbo = {} as DBOFullyTyped;
    dbo.someTable?.find;

    const dbo1 = {} as DBHandlerServer;
    dbo1.w?.find;

    const db = {} as DBOFullyTyped<DBGeneratedSchema>;

    /** db.tx return type works as expected */
    const txRes = await db.tx((dbTx) => {
      return "test" as const;
    });
    txRes satisfies "test";

    db.items2.find;

    const r = await db.items2.find(
      {},
      {
        select: { id: 1 },
        orderBy: {
          id: 1,
        },
      }
    );

    r[0]?.id;

    //@ts-expect-error
    r[0]?.bad_col;

    const tr2 = {} as ViewHandler<DBSchema2["tr2"]["columns"], DBSchema2>;
    void tr2.find(
      {},
      {
        select: { id: 1 },
        orderBy: { tr1_id: 1 },
      }
    );

    void tr2.find(
      {},
      {
        //@ts-expect-error
        select: { bad_col: 1 },
      }
    );

    void tr2.find(
      {},
      {
        //@ts-expect-error
        orderBy: { bad_col: 1 },
      }
    );

    (await db.items2.find({}, { select: { items_id: 1 }, returnType: "values" })) satisfies (
      | number
      | null
    )[];

    const publish: Publish<DBGeneratedSchema> = {
      items: {
        insert: {
          fields: {
            name: 1,
            //@ts-expect-error
            bad_col: 1,
          },
          validate: (row) => ({
            ...row,
            h: [""],
          }),
        },
      },
    };
    publish;
  };
};

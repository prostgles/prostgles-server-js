import { Publish, PublishTableRule } from "prostgles-server/dist/PublishParser/PublishParser";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
import type { PublishFullyTyped } from "prostgles-server/dist/DBSchemaBuilder";

export const testPublish: Publish<DBGeneratedSchema> = async ({ user, sid }) => {
  if (sid === "noAuth") {
    return {
      planes: {
        select: { fields: { last_updated: 0 } },
      },
    };
  }
  if (sid === "rest_api") {
    return {
      planes: "*",
    };
  }
  const users_public_info = {
    select: {
      fields: "*",
      forcedFilter: { sid },
    },
    insert: {
      fields: "*",
      forcedData: { sid },
    },
    delete: {
      filterFields: "*",
      forcedFilter: { sid },
    },
    update: {
      fields: "*",
      forcedFilter: { sid },
    },
  } satisfies PublishTableRule<
    DBGeneratedSchema["users_public_info"]["columns"],
    DBGeneratedSchema
  >;

  if (sid === "files") {
    return {
      users_public_info,
    };
  }
  const res: PublishFullyTyped<DBGeneratedSchema> = {
    shapes: "*",
    items: "*",
    items2: "*",
    items3: "*",
    items4a: "*",
    tjson: "*",
    items_multi: "*",
    v_items: "*",
    various: "*",
    tr1: "*",
    tr2: "*",
    tr3: "*",
    planes: {
      select: sid === "client_only" ? { fields: { last_updated: false } } : "*",
      update: "*",
      insert: "*",
      delete: "*",
      sync: {
        id_fields: ["id"],
        synced_field: "last_updated",
      },
    },

    items4: {
      select:
        user ? "*" : (
          {
            fields: { name: 0 },
            filterFields: "*",
            orderByFields: { added: 1 },
            forcedFilter: { name: "abc" },
          }
        ),
      insert: "*",
      update: "*",
      delete: "*",
    },

    items4_pub: "*",
    [`"*"`]: {
      select: { fields: { "*": 0 } },
      insert: "*",
      update: "*",
    },
    [`"""*"""`]: {
      select: { fields: { [`"*"`]: 0 } },
      insert: "*",
      update: "*",
    },
    obj_table: "*",
    files: "*",
    users_public_info,
    self_join: "*",
    insert_rules: {
      select: "*",
      insert: {
        fields: { added: 0 },
        returningFields: { name: 1 },
        validate: async ({ row }) => {
          if (row.name === "a") row.name = "b";
          row.added = new Date().toUTCString();
          return row;
        },
        checkFilter: {
          $and: [{ "name.<>": "fail-check" }],
        },
        postValidate: async ({ row, dbx: dboTx }) => {
          /** Records must exist in this transaction */
          const exists = await dboTx.sql("SELECT * FROM insert_rules WHERE id = ${id}", row, {
            returnType: "row",
          });
          const existsd = await dboTx.insert_rules.findOne({ id: row.id });
          if (row.id !== exists.id || row.id !== existsd.id) {
            console.error("postValidate failed");
            // process.exit(1)
          }
          if (row.name === "fail") throw "Failed";
          return undefined;
        },
      },
    },
    uuid_text: {
      insert: {
        fields: "*",
        forcedData: {
          id: "c81089e1-c4c1-45d7-a73d-e2d613cb7c3e",
        },
      },
      update: {
        fields: [],
        dynamicFields: [
          {
            fields: { id: 1 },
            filter: {
              id: "c81089e1-c4c1-45d7-a73d-e2d613cb7c3e",
            },
          },
        ],
      },
    },
    "prostgles_test.basic": "*",
    "prostgles_test.basic1": "*",
    "prostgles_test.mv_basic1": "*",
    [`"""quoted0"""`]: "*",
    [`"""quoted1"""`]: "*",
    [`"""quoted2"""`]: "*",
    symbols: "*",
    trades: "*",
  };

  return res;
};

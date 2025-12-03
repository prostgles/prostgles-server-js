import test, { describe } from "node:test";
import { DBOFullyTyped } from "../dist/DBSchemaBuilder/DBSchemaBuilder";
import type { DBHandlerClient } from "./client";
import type { DBGeneratedSchema } from "./DBGeneratedSchema";

export const isomorphicQueriesTyped = async (
  db: DBOFullyTyped<DBGeneratedSchema> | DBHandlerClient<DBGeneratedSchema>
) => {
  await describe("isomorphic typed queries", async () => {
    await test("isLookupTable DB Types from colConf", async () => {
      const row = await db.uuid_text.findOne?.({});
      if (row) {
        const { col1, col2 } = row;
        //@ts-expect-error
        if (col1 !== "z") {
          // col1 is typed to ftable values
        }
        //@ts-expect-error
        if (col1 === 2) {
          // col1 is typed to ftable values
        }
        if (col1 === "a") {
          // col1 is typed to ftable values
        }
      }
    });

    await test("isLookupTable DB Types from reference column actual definition", async () => {
      const row = await db.uuid_text.findOne?.({});
      if (row) {
        const { col3 } = row;
        //@ts-expect-error
        if (col3 !== "z") {
          // col3 is typed to ftable values
        }
        //@ts-expect-error
        if (col3 === 2) {
          // col3 is typed to ftable values
        }
        if (col3 === "a") {
          // col3 is typed to ftable values
        }
      }
    });

    await test("isLookupTable pkey column itself is typed", async () => {
      const row = await db.lookup_col1?.findOne?.({});
      if (row) {
        const { id } = row;
        //@ts-expect-error
        if (id !== "z") {
          // col3 is typed to ftable values
        }
        //@ts-expect-error
        if (id === 2) {
          // col3 is typed to ftable values
        }
        if (id === "a") {
          // col3 is typed to ftable values
        }
      }
    });
  });
};

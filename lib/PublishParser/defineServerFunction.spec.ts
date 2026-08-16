import { describe, test } from "node:test";
import { defineFunction } from "./defineServerFunction";

void describe("defineFunction type test", async () => {
  await test("Type test", () => {
    defineFunction({
      input: { a: "number", b: "string" },
      run: (args, context) => {
        args.a + 5;
        context.user.id;

        //@ts-expect-error raw database access is denied by default
        context.db.any("select 1");

        //@ts-expect-error
        if (args.zz) {
        }
      },
    });

    defineFunction({
      unrestrictedDbAccess: true,
      run: (_args, context) => context.db.any("select 1"),
    });

    //@ts-expect-error run is required
    defineFunction({ description: "invalid" });
  });
});

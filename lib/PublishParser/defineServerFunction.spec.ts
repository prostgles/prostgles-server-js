import { describe, test } from "node:test";
import { defineServerFunction } from "./defineServerFunction";

void describe("defineServerFunction type test", async () => {
  await test("Type test", () => {
    defineServerFunction({
      input: { a: "number", b: "string" },
      run: (args) => {
        args.a + 5;

        //@ts-expect-error
        if (args.zz) {
        }
      },
      isAllowed: () => true,
    });
  });
});

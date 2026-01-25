import { describe, test } from "node:test";
import { getErrorAsObject } from "./dboBuilderUtils";

void describe("dboBuilderUtils", async () => {
  await test("getErrorAsObject circular", () => {
    const circularError = new Error("Circular error data");
    //@ts-ignore
    circularError.someProp = circularError;
    getErrorAsObject(circularError);
  });
});

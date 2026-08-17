import { defineFunction, createFunctionsDefiner } from "..";
import type { FixtureSchema } from "./getServerFunctionReturnTypes.fixture";

const defineFixtureFunctions = createFunctionsDefiner<FixtureSchema>();

export const externalFunctions = defineFixtureFunctions({
  externalScalar: defineFunction({
    input: { value: "string" },
    run: ({ value }, { dbo }) => {
      void dbo.orders.find();
      // @ts-expect-error The schema must reach functions defined in another file.
      void dbo.missingTable;
      return value;
    },
  }),
});

import prostgles, { defineFunction, createFunctionGroupDefiner } from "..";
import { externalFunctions } from "./getServerFunctionReturnTypes.external.fixture";

type RecursiveResult = {
  value: string;
  next?: RecursiveResult;
};

type SampleSchema = {
  name: string;
  path: string;
} & (
  | { type: "sql"; file: string }
  | {
      type: "dir";
      workspaceConfig?: {
        workspaces: {
          options?: {
            hideCounts?: boolean;
            tableListEndInfo?: "count" | "size" | "none";
          };
        }[];
      };
    }
);

export type FixtureSchema = {
  orders: {
    columns: { id: string };
  };
};

const defineFixtureFunctionGroup = createFunctionGroupDefiner<FixtureSchema>();

export const stateServerFunctions = {
  public: defineFixtureFunctionGroup({
    userFilter: { type: "public" },
    functions: {
      recursiveResult: defineFunction({
        run: (): RecursiveResult => ({ value: "ok" }),
      }),
      sampleSchemas: defineFunction({
        run: (): SampleSchema[] => [],
      }),
      scalarResult: defineFunction({
        input: { value: "number" },
        run: ({ value }, { dbo }) => {
          value satisfies number;
          void dbo.orders.find();
          // @ts-expect-error The schema must reach a function defined in another object.
          void dbo.missingTable;
          return value;
        },
      }),
    },
  }),
  external: defineFixtureFunctionGroup({
    userFilter: { type: "public" },
    functions: externalFunctions,
  }),
};

void prostgles<FixtureSchema>({
  dbConnection: "",
  onReady: () => {},
  functions: stateServerFunctions,
});

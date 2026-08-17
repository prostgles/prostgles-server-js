import prostgles, { defineFunction, type ServerFunctionDefinitions } from "..";

type RecursiveResult = {
  value: string;
  next?: RecursiveResult;
};

type FixtureSchema = {
  orders: {
    columns: { id: string };
  };
};

export const stateServerFunctions = {
  public: {
    userFilter: { type: "public" },
    functions: {
      recursiveResult: defineFunction({
        run: (): RecursiveResult => ({ value: "ok" }),
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
  },
} as const satisfies ServerFunctionDefinitions<FixtureSchema>;

void prostgles<FixtureSchema>({
  dbConnection: "",
  onReady: () => {},
  functions: stateServerFunctions,
});

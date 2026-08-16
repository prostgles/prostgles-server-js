import prostgles, { defineFunction } from "..";

type RecursiveResult = {
  value: string;
  next?: RecursiveResult;
};

type FixtureSchema = {
  orders: {
    columns: { id: string };
  };
};

void prostgles<FixtureSchema>({
  dbConnection: "",
  onReady: () => {},
  functions: {
    public: {
      userFilter: { type: "public" },
      functions: {
        recursiveResult: defineFunction({
          run: (): RecursiveResult => ({ value: "ok" }),
        }),
        scalarResult: defineFunction({
          run: (_args, { dbo }) => {
            void dbo.orders.find();
            // @ts-expect-error The surrounding prostgles schema must reach defineFunction.
            void dbo.missingTable;
            return 42;
          },
        }),
      },
    },
  },
});

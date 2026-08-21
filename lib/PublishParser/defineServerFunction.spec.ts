import { describe, test } from "node:test";
import {
  defineFunction,
  createFunctionGroupDefiner,
  createFunctionGroupDefinerWithContext,
  createFunctionsDefiner,
} from "./defineServerFunction";
import type { TableHooks } from "../TableHooks/TableHooks";
import { createProstgles } from "../index";

type TestSchema = {
  items: {
    columns: { id: number };
  };
};

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

    const defineTestFunctions = createFunctionsDefiner<TestSchema>();
    const functions = defineTestFunctions({
      getItem: defineFunction({
        run: (_args, { dbo }) => {
          void dbo.items.find();
          // @ts-expect-error The schema is retained without a satisfies assertion.
          void dbo.missingTable;
          return { id: 1 as const };
        },
      }),
    });

    const defineTestFunctionGroup = createFunctionGroupDefiner<TestSchema>();
    const group = defineTestFunctionGroup({
      userFilter: { type: "public" },
      functions,
    });

    group.functions.getItem satisfies (typeof functions)["getItem"];

    // @ts-expect-error A group must have a user filter.
    defineTestFunctionGroup({ functions });

    type AppContext = {
      serviceManager: { getService: (name: string) => string };
    };
    const defineContextFunctions =
      createFunctionGroupDefinerWithContext<TestSchema, AppContext>();
    defineContextFunctions({
      userFilter: { type: "public" },
      functions: {
        getContextItem: defineFunction({
          run: (_args, { context, dbo }) => {
            void dbo.items.find();
            return context.serviceManager.getService("documents");
          },
        }),
      },
    });

    const contextualHooks: TableHooks<TestSchema, AppContext> = {
      items: {
        afterEach: [
          {
            commands: { insert: 1 },
            validate: ({ context }) => {
              context.serviceManager.getService("documents");
              return Promise.resolve();
            },
          },
        ],
      },
    };
    contextualHooks satisfies TableHooks<TestSchema, AppContext>;

    const startTestProstgles = createProstgles<TestSchema>();
    const inferredContextTypeTest = () =>
      startTestProstgles({
        dbConnection: "postgres://unused",
        createContext: () => ({
          serviceManager: { getService: (name: string) => name },
        }),
        onReady: ({ context }) => {
          context.serviceManager.getService("documents");
        },
      });
    void inferredContextTypeTest;
  });
});

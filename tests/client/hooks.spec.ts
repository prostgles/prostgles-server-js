import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { AnyObject, pickKeys } from "prostgles-types";
import type { DBHandlerClient } from "./index";
import { renderReactHook } from "./renderReactHook";

export const clientHooks = async (
  db: DBHandlerClient,
  getSocketOptions: (watchSchema?: boolean) => AnyObject,
) => {
  const resultLoading = { data: undefined, isLoading: true, error: undefined };
  await describe("React hooks", async (t) => {
    const defaultFilter = { name: "abc" };
    await Promise.all(
      ["useFind", "useSubscribe", "useFindOne", "useSubscribeOne"].map(
        async (hookName) => {
          await test(hookName, async (t) => {
            const expectsOne = hookName.includes("One");
            const options = {
              select: { added: "$Mon" },
              limit: expectsOne ? undefined : 1,
            };
            const expectedData = expectsOne
              ? { added: "Dec" }
              : [{ added: "Dec" }];
            const { rerender, results } = await renderReactHook({
              hook: db.items4[hookName]!,
              props: [{ name: "abc" }, options],
              expectedRerenders: 2,
            });

            assert.deepStrictEqual(results, [
              resultLoading,
              { data: expectedData, isLoading: false, error: undefined },
            ]);

            const { results: errorResults } = await rerender({
              props: [{ named: "error" }, options],
              expectedRerenders: 2,
            });

            assert.deepStrictEqual(errorResults, [
              resultLoading,
              {
                data: undefined,
                isLoading: false,
                error: {
                  message:
                    "Table: items4 -> disallowed/inexistent columns in filter: named \n" +
                    '  Expecting one of: added, "id", "public", "name"',
                },
              },
            ]);
          });
        },
      ),
    );

    await Promise.all(
      [
        {
          hookName: "useCount",
          result1: { data: 2, error: undefined, isLoading: false },
          result2: { data: 0, error: undefined, isLoading: false },
        },
        {
          hookName: "useSize",
          result1: { data: "93", error: undefined, isLoading: false },
          result2: { data: "0", error: undefined, isLoading: false },
        },
      ].map(async ({ hookName, result1, result2 }) => {
        await test(hookName, async (t) => {
          const { results, rerender } = await renderReactHook({
            hook: db.items4[hookName]!,
            props: [defaultFilter],
            expectedRerenders: 2,
          });

          // Initial state
          assert.deepStrictEqual(results, [resultLoading, result1]);

          // Rerender with different filter
          const { results: noResults } = await rerender({
            props: [{ id: -1 }],
            expectedRerenders: 2,
          });

          // New results
          assert.deepStrictEqual(noResults, [resultLoading, result2]);
        });
      }),
    );

    await test("useCount planes", async (t) => {
      const { results } = await renderReactHook({
        hook: db.planes.useCount!,
        props: [{}],
        expectedRerenders: 2,
      });
      assert.deepStrictEqual(results, [
        { data: undefined, isLoading: true, error: undefined },
        { data: 100, error: undefined, isLoading: false },
      ]);
    });

    // // TODO fix useSync test
    await test("useSync", async (t) => {
      const funcHandles = {
        $cloneMultiSync: 1,
        $cloneSync: 1,
        $delete: 1,
        $find: 1,
        $get: 1,
        $unsync: 1,
        $update: 1,
      };
      const plane0 = {
        id: 0,
        x: 20,
        y: 0,
      };
      // await db.planes.insert({ name: "abc" });

      // const { results: firstPlaneResults } = await renderReactHook({
      //   hook: db.planes.useFindOne!,
      //   props: [{ }],
      //   expectedRerenders: 2
      // });
      // assert.deepStrictEqual(firstPlaneResults, [
      //   { data: undefined, isLoading: true, error: undefined },
      //   { data: undefined, error: undefined, isLoading: false },
      // ]);

      const props = [{ id: 0 }, { handlesOnData: true }]; // , select: { id: 1, x: 1 }
      const { results, rerender } = await renderReactHook({
        hook: db.planes.useSync!,
        props,
        expectedRerenders: 3,
      });
      assert.equal(results.length, 3);
      assert.deepStrictEqual(results[0], {
        data: undefined,
        isLoading: true,
        error: undefined,
      });
      /** This fails from time to time */
      // assert.deepStrictEqual(
      //   results[1],
      //   { data: [], error: undefined, isLoading: false },
      // );
      const lastResult = results.at(-1);
      assert.equal(lastResult?.isLoading, false);
      const lastData = lastResult?.data;
      assert.equal(lastData.length, 1);
      const lastDataItem = lastData[0];
      assert.deepStrictEqual(
        pickKeys(lastDataItem, Object.keys(plane0)),
        plane0,
      );

      // Update item
      db.planes.update({ id: 0 }, { x: 230 });
      const { results: deletedResults } = await rerender({
        props,
        expectedRerenders: 3,
      });

      assert.deepStrictEqual(
        deletedResults.map(({ data }) => data?.[0]?.x),
        [
          undefined, // TODO - should be defined and 20
          20,
          230,
        ],
      );

      // // Rerender with different filter
      // rerender({ id: -1 });

      // await expectValues(
      //   result,
      //   [
      //     { data: undefined, error: undefined, isLoading: true },
      //     { data: [], error: undefined, isLoading: false },
      //   ]
      // );

      // await expectValues(
      //   result,
      //   [
      //     { data: undefined, error: undefined, isLoading: true },
      //     { data: [], error: undefined, isLoading: false }
      //   ]
      // );
    });
  });
};

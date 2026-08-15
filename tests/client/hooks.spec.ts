import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { pickKeys } from "prostgles-types";
import React from "react";
import type { DBHandlerClient } from "./index";
import { renderReactHook, renderReactHookManual } from "./renderReactHook";

export const clientHooks = async (
  db: DBHandlerClient,
  reconnectSocket: () => Promise<void>,
) => {
  let reconnectTestError: unknown;
  const resultLoading = { data: undefined, isLoading: true, error: undefined };
  await describe("React hooks", async (t) => {
    const defaultFilter = { name: "abc" };
    await Promise.all(
      ["useFind", "useSubscribe", "useFindOne", "useSubscribeOne"].map(async (hookName) => {
        await test(hookName, async (t) => {
          const expectsOne = hookName.includes("One");
          const options = {
            select: { added: "$Mon" },
            limit: expectsOne ? undefined : 1,
          };
          const expectedData = expectsOne ? { added: "Dec" } : [{ added: "Dec" }];
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
                  'items4.named is invalid/disallowed for filtering. Allowed columns: added, "id", "public", "name"',
              },
            },
          ]);
        });
      })
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
      })
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
      assert.deepStrictEqual(pickKeys(lastDataItem, Object.keys(plane0)), plane0);

      // Update item
      await db.planes.update!({ id: 0 }, { x: 230 });
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
        ]
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

    await test("useSync updates invalidate useMemo without mutating old data", async () => {
      await db.planes.update!({ id: 0 }, { x: 20 });

      let memoRun = 0;
      const useSyncWithMemo = () => {
        const result = db.planes.useSync!<
          { id: number; x: number },
          { handlesOnData: true }
        >({ id: 0 }, { handlesOnData: true });
        const { data } = result;
        const memoized = React.useMemo(
          () => ({ run: ++memoRun, x: data?.[0]?.x }),
          [data],
        );
        return { ...result, data, memoized };
      };

      const rendered = await renderReactHookManual({
        hook: useSyncWithMemo,
        initialProps: [],
      });

      try {
        const getLatest = () => rendered.getResults().at(-1)!;
        await waitFor(() => getLatest().data?.[0]?.x === 20);

        const initialResult = getLatest();
        const initialMemoRun = initialResult.memoized.run;
        assert.equal(initialResult.memoized.x, 20);

        await db.planes.update!({ id: 0 }, { x: 231 });
        await waitFor(() => getLatest().data?.[0]?.x === 231);

        const serverUpdateResult = getLatest();
        assert.equal(serverUpdateResult.memoized.x, 231);
        assert.ok(serverUpdateResult.memoized.run > initialMemoRun);
        assert.notStrictEqual(serverUpdateResult.data, initialResult.data);
        assert.notStrictEqual(
          serverUpdateResult.data[0],
          initialResult.data[0],
        );
        assert.equal(initialResult.data[0].x, 20);

        const serverUpdateMemoRun = serverUpdateResult.memoized.run;
        await serverUpdateResult.data[0].$update({ x: 232 });
        await waitFor(() => getLatest().data?.[0]?.x === 232);

        const handleUpdateResult = getLatest();
        assert.equal(handleUpdateResult.memoized.x, 232);
        assert.ok(handleUpdateResult.memoized.run > serverUpdateMemoRun);
        assert.notStrictEqual(handleUpdateResult.data, serverUpdateResult.data);
        assert.notStrictEqual(
          handleUpdateResult.data[0],
          serverUpdateResult.data[0],
        );
        assert.equal(serverUpdateResult.data[0].x, 231);
      } finally {
        rendered.unmount();
      }
    });

    await test("concurrent useSync hooks with matching options all update", async () => {
      await db.planes.update!({ id: 0 }, { x: 30 });

      const filter = { id: 0 };
      const syncOptions = { handlesOnData: true } as const;
      const memoRuns = [0, 0, 0];
      const usePlaneSync = () =>
        db.planes.useSync!<
          { id: number; x: number },
          { handlesOnData: true }
        >(filter, syncOptions);
      const useConcurrentSyncs = () => {
        const syncs = [usePlaneSync(), usePlaneSync(), usePlaneSync()];
        const memoized = [
          React.useMemo(
            () => ({ run: ++memoRuns[0], x: syncs[0].data?.[0]?.x }),
            [syncs[0].data],
          ),
          React.useMemo(
            () => ({ run: ++memoRuns[1], x: syncs[1].data?.[0]?.x }),
            [syncs[1].data],
          ),
          React.useMemo(
            () => ({ run: ++memoRuns[2], x: syncs[2].data?.[0]?.x }),
            [syncs[2].data],
          ),
        ];
        return { syncs, memoized };
      };

      const rendered = await renderReactHookManual({
        hook: useConcurrentSyncs,
        initialProps: [],
      });

      try {
        const getLatest = () => rendered.getResults().at(-1)!;
        const allSyncsHaveX = (x: number) =>
          getLatest().syncs.every((sync) => sync.data?.[0]?.x === x);
        await waitFor(() => allSyncsHaveX(30));

        const initialResult = getLatest();
        const initialMemoRuns = initialResult.memoized.map(({ run }) => run);

        await db.planes.update!({ id: 0 }, { x: 31 });
        await waitFor(() => allSyncsHaveX(31));

        const serverUpdateResult = getLatest();
        serverUpdateResult.syncs.forEach((sync, index) => {
          assert.equal(serverUpdateResult.memoized[index].x, 31);
          assert.ok(serverUpdateResult.memoized[index].run > initialMemoRuns[index]);
          assert.notStrictEqual(sync.data, initialResult.syncs[index].data);
          assert.equal(initialResult.syncs[index].data![0].x, 30);
        });

        const serverUpdateMemoRuns = serverUpdateResult.memoized.map(({ run }) => run);
        await serverUpdateResult.syncs[0].data![0].$update({ x: 32 });
        await waitFor(() => allSyncsHaveX(32));

        const handleUpdateResult = getLatest();
        handleUpdateResult.syncs.forEach((sync, index) => {
          assert.equal(handleUpdateResult.memoized[index].x, 32);
          assert.ok(handleUpdateResult.memoized[index].run > serverUpdateMemoRuns[index]);
          assert.notStrictEqual(sync.data, serverUpdateResult.syncs[index].data);
          assert.equal(serverUpdateResult.syncs[index].data![0].x, 31);
        });
      } finally {
        rendered.unmount();
      }
    });

    await test("useSync receives inserts after a socket reconnect", async () => {
      const y = 999_999;
      const filter = { y };
      const options = { handlesOnData: false } as const;
      const usePlane = () =>
        db.planes.useSync!<
          { id: number; x: number; y: number },
          { handlesOnData: false }
        >(filter, options);

      await db.planes.delete!(filter);
      await db.planes.insert!({ id: 999_998, x: 101, y });

      const beforeReconnect = await renderReactHookManual({
        hook: usePlane,
        initialProps: [],
      });

      try {
        await waitFor(() =>
          beforeReconnect.getResults().at(-1)?.data?.some(({ x }) => x === 101),
        );
        beforeReconnect.unmount();

        await reconnectSocket();
        await db.planes.insert!({ id: 999_999, x: 102, y });

        const afterReconnect = await renderReactHookManual({
          hook: usePlane,
          initialProps: [],
        });
        try {
          await waitFor(
            () => afterReconnect.getResults().at(-1)?.data?.some(({ x }) => x === 102),
          );
        } finally {
          afterReconnect.unmount();
        }
      } catch (error) {
        reconnectTestError = error;
        throw error;
      } finally {
        beforeReconnect.unmount();
        await db.planes.delete!(filter);
      }
    });
  });

  // node:test records nested failures instead of rejecting describe().
  if (reconnectTestError) throw reconnectTestError;
};

const waitFor = async (condition: () => boolean, timeout = 5000) => {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for useSync update");
    }
    await tout(20);
  }
};

const tout = (ms: number) => new Promise((res) => setTimeout(res, ms));

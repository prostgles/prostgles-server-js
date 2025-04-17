import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { useAsyncEffectQueue } from "prostgles-client/dist/react-hooks";
import { renderReactHook, renderReactHookManual } from "./renderReactHook";

describe("React hooks", async (t) => {
  await test("useAsyncEffectQueue executes the first and debounces the rest", async (t) => {
    const calls: number[] = [];
    const getHookArgs = (step: number) =>
      [
        async () => {
          calls.push(step);
          (await tout(500)) as any;
          return () => {
            calls.push(step * 10 + step);
          };
        },
        [step],
      ] satisfies [() => Promise<any>, any[]];
    const { setProps, unmount } = await renderReactHookManual({
      hook: useAsyncEffectQueue,
      initialProps: getHookArgs(1),
      renderDuration: 10,
    });
    setProps(getHookArgs(2));
    setProps(getHookArgs(3));
    await tout(1500);
    assert.deepStrictEqual(calls, [1, 11, 3]);
    unmount();
    await tout(500);
    assert.deepStrictEqual(calls, [1, 11, 3, 33]);
  });

  await test("useAsyncEffectQueue executes the first and debounces the rest if still mounted", async (t) => {
    const calls: number[] = [];
    const getHookArgs = (step: number) =>
      [
        async () => {
          calls.push(step);
          (await tout(500)) as any;
          return () => {
            calls.push(step * 10 + step);
          };
        },
        [step],
      ] satisfies [() => Promise<any>, any[]];
    const { setProps, unmount } = await renderReactHookManual({
      hook: useAsyncEffectQueue,
      initialProps: getHookArgs(1),
      renderDuration: 10,
    });
    setProps(getHookArgs(2));
    setProps(getHookArgs(3));
    unmount();
    await tout(1500);
    assert.deepStrictEqual(calls, [1, 11]);
  });
});

const tout = (ms) => new Promise((res) => setTimeout(res, ms));

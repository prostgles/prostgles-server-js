import { strict as assert } from "assert";
import { describe, test } from "node:test";
import { useAsyncEffectQueue } from "prostgles-client";
import { renderReactHookManual } from "./renderReactHook";

void describe("React hooks", async (t) => {
  await test("useAsyncEffectQueue executes the first and debounces the rest", async (t) => {
    const calls: (string | number)[] = [];
    const addCall = (num: number) => {
      calls.push(num);
    };
    const getHookArgs = (step: number) =>
      [
        async () => {
          addCall(step);
          await tout(500);
          return () => {
            addCall(step * 10 + step);
          };
        },
        [step],
      ] satisfies [() => Promise<any>, any[]];
    const { setProps, unmount } = await renderReactHookManual({
      hook: useAsyncEffectQueue,
      initialProps: getHookArgs(1),
      renderDuration: 10,
    });
    void setProps(getHookArgs(2));
    void setProps(getHookArgs(3));
    await tout(700);
    assert.deepStrictEqual(calls, [1, 11, 3]);
    unmount();
    await tout(900);
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
    void setProps(getHookArgs(2));
    void setProps(getHookArgs(3));
    unmount();
    await tout(1500);
    assert.deepStrictEqual(calls, [1, 11]);
  });
});

const tout = (ms: number) => new Promise((res) => setTimeout(res, ms));

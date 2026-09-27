const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { window } = new JSDOM(`
<!DOCTYPE html>
<html>
	<head>
	</head>
	<body>
    <div id="root"></div>
		<script>
		</script>
	</body>
</html>
`);

const setGlobal = (key: "window" | "navigator" | "document", value: any) => {
  try {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  } catch {
    // Node 24 may expose getter-only globals; keep existing value in that case.
  }
};

setGlobal("window", window);
setGlobal("navigator", window.navigator);
setGlobal("document", window.document);

import React, { type Dispatch, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";

type Hook = (...args: any[]) => any;

// TODO: add  hook result types
type RenderHookArgs = {
  hook: Hook;
  props: any[];
  onResult?: (result: any) => void;
  expectedRerenders: number;
  timeout?: number;
  /**
   * Time to wait after the last render to resolve the promise
   * Used to catch any extra unwanted renders
   */
  lastRenderWait?: number;
};

let testedHook: ((...args: any[]) => any) | null = null;
const root = createRoot(window.document.getElementById("root"));
const reactRender = ({
  hook,
  props,
  onResult,
  onUnmount,
}: Pick<Required<RenderHookArgs>, "hook" | "props" | "onResult"> & {
  onUnmount: () => void;
}) => {
  const BasicComponent = ({ props }: { props: any[] }) => {
    const result = hook(...props);
    React.useEffect(() => {
      return onUnmount;
    }, []);
    onResult(result);
    return React.createElement("h1", null, `Hello`);
  };
  root.render(React.createElement(BasicComponent, { props }, null));
};

type RenderResult = {
  results: any[];
  rerender: (args: Omit<RenderHookArgs, "hook">) => Promise<RenderResult>;
};

const resetBasicComponent = () => {
  const OtherBasicComponent = ({ props }: { props: any }) => {
    return React.createElement("div", null, `Goodbye`);
  };
  root.render(React.createElement(OtherBasicComponent, { props: {} }, null));
};

type OnEnd<H extends Hook> = (results: ReturnType<H>[]) => Promise<void> | void;

export const renderReactHookManual = async <H extends Hook>(rootArgs: {
  hook: H;
  initialProps: Parameters<H>;
  onUnmount?: () => void;
  /**
   * Time to wait after the last render to resolve the promise
   * default: 250
   */
  renderDuration?: number;
  onEnd?: OnEnd<H>;
  onRender?: OnEnd<H>;
}): Promise<{
  setProps: (props: Parameters<H>, opts?: { waitFor?: number; onEnd?: OnEnd<H> }) => Promise<void>;
  getResults: () => ReturnType<H>[];
  unmount: () => void;
}> => {
  const { hook, onUnmount, renderDuration = 250, onEnd, onRender } = rootArgs;
  let lastRenderWaitTimeout: number | undefined | NodeJS.Timeout;
  let didResolve = false;
  let setProps: Dispatch<SetStateAction<Parameters<H>>> | undefined;
  resetBasicComponent();
  return new Promise((resolve, reject) => {
    const results: ReturnType<H>[] = [];
    const onCompRender = (result: ReturnType<H>) => {
      results.push(result);
      if (didResolve) return;
      void onRender?.(results);
      clearTimeout(lastRenderWaitTimeout);
      lastRenderWaitTimeout = setTimeout(async () => {
        if (!setProps) {
          reject("setProps not set");
          return;
        }
        await onEnd?.(results);
        didResolve = true;
        return resolve({
          setProps: async (props, { waitFor = 250, onEnd } = {}) => {
            setProps!(props);
            await tout(waitFor);
            await onEnd?.(results);
          },
          getResults: () => results,
          unmount: () => {
            resetBasicComponent();
          },
        });
      }, renderDuration);
    };
    const BasicComponent = ({ props: initialProps }: { props: Parameters<H> }) => {
      const [props, _setProps] = React.useState(initialProps);
      setProps = _setProps;
      const result = hook(...props);
      React.useEffect(() => {
        return () => {
          onUnmount?.();
        };
      }, []);
      onCompRender(result);
      return React.createElement("h1", null, `Hello`);
    };
    root.render(React.createElement(BasicComponent, { props: rootArgs.initialProps }, null));
  });
};

export const renderReactHook = (rootArgs: RenderHookArgs): Promise<RenderResult> => {
  const {
    hook,
    props,
    onResult,
    expectedRerenders,
    timeout = 5000,
    lastRenderWait = 250,
  } = rootArgs;
  const isRerender = testedHook && testedHook === hook;
  if (testedHook && testedHook !== hook) {
    resetBasicComponent();
  }
  testedHook = hook;
  let lastRenderWaitTimeout: NodeJS.Timeout | number | undefined;
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    let resolved = false;
    const onRender = (result: RenderResult) => {
      results.push(result);
      onResult?.(result);
      clearTimeout(lastRenderWaitTimeout);
      resolved = expectedRerenders === results.length;
      if (resolved) {
        lastRenderWaitTimeout = setTimeout(() => {
          resolve({
            results,
            rerender: (args: Omit<RenderHookArgs, "hook">) =>
              renderReactHook({
                hook,
                ...args,
              }),
          });
        }, lastRenderWait);
      }
    };
    reactRender({
      hook,
      props,
      onResult: onRender,
      onUnmount: () => {
        if (isRerender) {
          reject(new Error("Unmounted before expected rerenders"));
        }
      },
    });
    setTimeout(() => {
      if (!resolved) {
        reject(
          new Error(
            `Expected ${expectedRerenders} rerenders, got ${results.length}:\n${JSON.stringify(results)}`,
          ),
        );
      }
    }, timeout);
  });
};

const tout = (ms: number) => new Promise((res) => setTimeout(res, ms));

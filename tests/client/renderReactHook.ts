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
global.window = window;
global.navigator = window.navigator;
global.document = window.document;

import React from "react";
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

let testedHook: Function;
const root = createRoot(window.document.getElementById("root"));
const reactRender = ({
  hook,
  props,
  onResult,
  onUnmount,
}: Pick<Required<RenderHookArgs>, "hook" | "props" | "onResult"> & {
  onUnmount: () => void;
}) => {
  const BasicComponent = ({ props }) => {
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
  const OtherBasicComponent = ({ props }) => {
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
  setProps: (
    props: Parameters<H>,
    opts: { waitFor?: number; onEnd?: OnEnd<H> },
  ) => void;
  getResults: () => ReturnType<H>[];
}> => {
  const { hook, onUnmount, renderDuration = 250, onEnd, onRender } = rootArgs;
  let lastRenderWaitTimeout: NodeJS.Timeout | null = null;
  let didResolve = false;
  let setProps: (props: any[]) => void;
  resetBasicComponent();
  return new Promise((resolve, reject) => {
    const results = [];
    const onCompRender = (result) => {
      results.push(result);
      if (didResolve) return;
      onRender?.(results);
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
            setProps(props);
            await tout(waitFor);
            await onEnd?.(results);
          },
          getResults: () => results,
        });
      }, renderDuration);
    };
    const BasicComponent = ({ props: initialProps }) => {
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
    root.render(
      React.createElement(
        BasicComponent,
        { props: rootArgs.initialProps },
        null,
      ),
    );
  });
};

export const renderReactHook = (
  rootArgs: RenderHookArgs,
): Promise<RenderResult> => {
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
  let lastRenderWaitTimeout: NodeJS.Timeout | null = null;
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    let resolved = false;
    const onRender = (result) => {
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

export const tout = (ms: number) => new Promise((res) => setTimeout(res, ms));

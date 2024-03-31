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


type RenderHookArgs = {
	hook: (...args: any[]) => any;
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
const root = createRoot(window.document.getElementById('root'));
const reactRender = ({ hook, props, onResult, onUnmount }: Pick<Required<RenderHookArgs>, "hook" | "props" | "onResult"> & { onUnmount: ()=>void; }) => {
	const BasicComponent = ({ props }) => {
		const result = hook(...props);
		React.useEffect(() => {
			return onUnmount;
		}, []);
		onResult(result);
		return React.createElement('h1', null, `Hello`);
	}
	root.render(
		React.createElement(BasicComponent, { props }, null)
	);
};

type RenderResult = {
	results: any[];
	rerender: (args: Omit<RenderHookArgs, "hook">) => Promise<RenderResult>;
}

const resetBasicComponent = () => {
	const OtherBasicComponent = ({ props }) => {
		return React.createElement('div', null, `Goodbye`);
	}
	root.render(
		React.createElement(OtherBasicComponent, { props: {} }, null)
	);
}

export const renderReactHook = (rootArgs: RenderHookArgs): Promise<RenderResult> => {
	const { hook, props, onResult, expectedRerenders, timeout = 5000, lastRenderWait = 250 } = rootArgs;
	const isRerender = testedHook && testedHook === hook;
	if(testedHook && testedHook !== hook) {
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
			if(resolved){
				lastRenderWaitTimeout = setTimeout(() => {
					resolve({ 
						results,
						rerender: (args: Omit<RenderHookArgs, "hook">) => renderReactHook({ 
							hook, 
							...args,
						}) 
					});
				}, lastRenderWait);
			}
		}
		reactRender({ 
			hook, 
			props, 
			onResult: onRender, 
			onUnmount: () => {
				if(isRerender){
					reject(new Error("Unmounted before expected rerenders"));
				}
			} 
		});
		setTimeout(() => {
			if(!resolved){
				reject(new Error(`Expected ${expectedRerenders} rerenders, got ${results.length}`));
			}
		}, timeout);
	});
}
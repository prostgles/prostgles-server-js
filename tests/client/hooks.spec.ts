import { renderHook, waitFor } from "@testing-library/react";
import { strict as assert } from "assert";
import { describe, test } from "node:test";
import type { DBHandlerClient } from "./index";
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { window } = new JSDOM(`<!DOCTYPE html>`);
global.document = window.document;
global.window = window;

const expectValues = (result: { current: any; }, expectedValues: any[]) => {
  let step = 0;
  return waitFor(() => {
    assert.deepStrictEqual(expectedValues[step], result.current);
    const finished = step === expectedValues.length - 1;
    step++;
    if(!finished) throw new Error("Not finished"); 
  });
}

export const clientHooks = async (db: DBHandlerClient) => {

  await describe("Client hooks", async (t) => {
    const defaultFilter = { name: "abc" };
      
    await Promise.all([
      "useFind",
      "useSubscribe",
      "useFindOne",
      "useSubscribeOne",
    ].map(async hookName => {
      await test(hookName, async (t) => {
        const expectsOne = hookName.includes("One");
        const options = {
          select: { added: "$Mon" },
          limit: expectsOne? undefined : 1
        };
        const { result, rerender } = renderHook((filter = defaultFilter) => db.items4[hookName]!(filter, options));
        const expectedData = expectsOne? { added: "Dec" } : [{ added: "Dec" }];
        // Initial state
        assert.deepStrictEqual(result.current, { data: undefined, isLoading: true, error: undefined });
        
        // First fetch
        await waitFor(() => {
          assert.deepStrictEqual(
            result.current, 
            { 
              data: expectedData, error: undefined, isLoading: false
            }
          );
        });

        // Rerender with different filter
        rerender({ named: "error" });

        // TODO fix first re-render result (useFetch setResult in async block might be affecting this)
        // assert.deepStrictEqual(result.current, { data: undefined, isLoading: true, error: undefined });

        await waitFor(() => {
          assert.deepStrictEqual(
            result.current, 
            { 
              data: undefined, 
              error: {
                message: 'Table: items4 -> disallowed/inexistent columns in filter: named \n' +
                  '  Expecting one of: added, "id", "public", "name"',
              },
              isLoading: false
            }
          );
        });
      });
    }));

    await Promise.all([
      { 
        hookName: "useCount", 
        result1: { data: 2, error: undefined, isLoading: false },
        result2: [
          { data: 2, error: undefined, isLoading: false },
          { data: 0, error: undefined, isLoading: false },
        ]
      },
      { 
        hookName: "useSize", 
        result1: { data: "93", error: undefined, isLoading: false },
        result2: [
          { data: "93", error: undefined, isLoading: false },
          { data: "0", error: undefined, isLoading: false },
        ]
      },
    ].map(async ({ hookName, result1, result2 }) => {
      await test(hookName, async (t) => {
        const { result, rerender } = renderHook((filter = defaultFilter) => db.items4[hookName](filter));
        // Initial state
        assert.deepStrictEqual(result.current, { data: undefined, isLoading: true, error: undefined });
        
        // First fetch
        await waitFor(() => {
          assert.deepStrictEqual(
            result.current, 
            result1
          );
        });
  
        // Rerender with different filter
        rerender({ id: -1 });
  
        // New count
        await expectValues(
          result,
          result2
        );
      });

    }));

  });
}
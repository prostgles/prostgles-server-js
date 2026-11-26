import type { Prostgles } from "../Prostgles";
import { isArray } from "../utils/utils";

export const validateServerFunctions = (groups: Prostgles["opts"]["functions"]) => {
  const names = new Set<string>();
  for (const group of Object.values(groups ?? {})) {
    for (const [name, definition] of Object.entries(group.functions)) {
      if (typeof definition.run !== "function") {
        throw new Error(`Function ${JSON.stringify(name)} must define run`);
      }
      if (isArray(definition.input) && !definition.input.length) {
        throw new Error(`Function ${JSON.stringify(name)} must define at least one input variant`);
      }
      if (names.has(name)) {
        throw new Error(
          `Function ${JSON.stringify(name)} is already defined. Function names must be unique across all groups`,
        );
      }
      names.add(name);
    }
  }
};

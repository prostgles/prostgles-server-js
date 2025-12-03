import { COMPUTED_FIELDS } from "./COMPUTED_FIELDS";
import type { FunctionSpec } from "./Functions";

export const parseFunction = (funcData: {
  func: string | FunctionSpec;
  args: any[];
  functions: FunctionSpec[];
  allowedFields: string[];
}): FunctionSpec => {
  const { func, args, functions, allowedFields } = funcData;

  /* Function is computed column. No checks needed */
  if (typeof func !== "string") {
    const computedCol = COMPUTED_FIELDS.find((c) => c.name === func.name);
    if (!computedCol)
      throw `Unexpected function: computed column spec not found for ${JSON.stringify(func.name)}`;
    return func;
  }

  const funcName = func;
  const makeErr = (msg: string): string => {
    return `Issue with function ${JSON.stringify({ [funcName]: args })}: \n${msg}`;
  };

  /* Find function */
  const funcDef = functions.find((f) => f.name === funcName);

  if (!funcDef) {
    const sf = functions
      .filter((f) => f.name.toLowerCase().slice(1).startsWith(funcName.toLowerCase()))
      .sort((a, b) => a.name.length - b.name.length);
    const hint =
      sf.length ?
        `. \n Maybe you meant: \n | ${sf.map((s) => s.name + " " + (s.description || "")).join("    \n | ")}  ?`
      : "";
    throw "\n Function " + funcName + " does not exist or is not allowed " + hint;
  }

  /* Validate fields */
  const fields = funcDef.getFields(args);
  if (fields !== "*") {
    fields.forEach((fieldKey) => {
      if (typeof fieldKey !== "string" || !allowedFields.includes(fieldKey)) {
        throw makeErr(
          `getFields() => field name ${JSON.stringify(fieldKey)} is invalid or disallowed`
        );
      }
    });
    if ((funcDef.minCols ?? 0) > fields.length) {
      throw makeErr(`Less columns provided than necessary (minCols=${funcDef.minCols})`);
    }
  }

  if (
    funcDef.numArgs &&
    funcDef.minCols !== 0 &&
    fields !== "*" &&
    Array.isArray(fields) &&
    !fields.length
  ) {
    throw `\n Function "${funcDef.name}" expects at least a field name but has not been provided with one`;
  }

  return funcDef;
};

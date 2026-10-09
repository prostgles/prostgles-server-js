import { getJSONBObjectSchemaValidationError, getKeys, type SelectParams } from "prostgles-types";
import type { ServerSelectParams } from "./find";

export const validateSelectParams = (
  selectParams: any,
): selectParams is ServerSelectParams | undefined => {
  if (selectParams === undefined) {
    return true;
  }
  const allowedReturnTypes = getKeys({
    row: 1,
    statement: 1,
    value: 1,
    values: 1,
    "statement-no-rls": 1,
    "statement-where": 1,
  } satisfies Record<Required<SelectParams>["returnType"], 1>);

  const selectParamsValidation = getJSONBObjectSchemaValidationError(
    {
      select: {
        oneOf: [{ enum: ["*", ""] as const }, { record: { values: "any" } }, "string[]"],
        optional: true,
      },
      orderBy: {
        oneOf: [
          { record: { values: "any" } },
          { arrayOf: { record: { values: "any" } } },
          "string[]",
          "string",
        ],
        optional: true,
      },
      offset: { type: "integer", optional: true },
      limit: { type: "integer", nullable: true, optional: true },
      returnType: {
        enum: allowedReturnTypes,
        optional: true,
      },
      groupBy: { type: "boolean", optional: true },
      having: { record: { values: "any" }, optional: true },
      abortSignal: { type: "any", optional: true },
      forUpdate: { type: "boolean", optional: true },
    },
    selectParams,
    "selectParams",
  );
  if (selectParamsValidation.error !== undefined) {
    throw `selectParams validation error: ${JSON.stringify(selectParamsValidation.error)}`;
  }
  selectParamsValidation.data satisfies ServerSelectParams;
  return true;
};

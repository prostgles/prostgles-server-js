import { omitKeys, type FunctionInput, type JSONB } from "prostgles-types";
import { getJobParamSchema } from "./getJobParams";
import type { JobControlOperation, JobParamSchema, ParamsSchema } from "./JobTypes";
import type { JobControlOperations } from "./jobControlFunctionUtils";

export const getManualJobControlInput = <
  Schema extends ParamsSchema,
  Selection extends JobControlOperations,
>(
  params: Schema | undefined,
  selection: Selection,
) => {
  const overrides = { type: getParamFields(params), optional: true } as const;
  const cases = {
    startOrRetry: {
      operation: { enum: ["startOrRetry"] },
      jobId: { type: "string", optional: true },
      params: overrides,
    },
    rerun: { operation: { enum: ["rerun"] }, jobId: "string", params: overrides },
    cancel: { operation: { enum: ["cancel"] }, jobId: "string" },
  } as const satisfies {
    [Op in JobControlOperation]: JSONB.ObjectType["type"] & { operation: { enum: readonly [Op] } };
  };

  type Cases = typeof cases;
  type Input =
    Selection extends readonly JobControlOperation[] ?
      readonly [Cases[Selection[number]], ...Cases[Selection[number]][]]
    : Omit<Cases[Extract<Selection, JobControlOperation>], "operation">;
  const operations: JobControlOperations = selection;
  const input = (() => {
    if (typeof operations === "string") {
      return omitKeys(cases[operations], ["operation"]);
    }
    const [first, ...rest] = operations;
    return [cases[first], ...rest.map((operation) => cases[operation])] as const;
  })() satisfies FunctionInput;
  return input as Input;
};

const getParamFields = <Schema extends ParamsSchema>(params: Schema | undefined) => {
  const fields = Object.fromEntries(
    Object.entries<ParamsSchema[string]>(params ?? {}).map(
      ([key, field]) =>
        [
          key,
          { ...getJobParamSchema(field), optional: true } satisfies JSONB.JSONBSchema & {
            optional: true;
          },
        ] as const,
    ),
  );
  return fields as {
    [Key in keyof Schema]: Extract<
      Omit<JobParamSchema<Schema[Key]>, "optional"> & { optional: true },
      JSONB.FieldType
    >;
  };
};

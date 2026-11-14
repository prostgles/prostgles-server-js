import type { JSONB, MaybePromise } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBTableHandlersFromSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  ServerFunctionContextMarker,
  UnrestrictedFunctionContext,
} from "../PublishParser/defineServerFunction";
import type {
  JobControlOperation,
  JobRecord,
  JobValue,
  ManualJobControlOptions,
  ParamsOutput,
  ParamsSchema,
} from "./JobTypes";
import {
  getJobControlOperation,
  getJobControlOperationInput,
  type JobControlOperations,
  type SelectedJobControlOperation,
} from "./jobControlFunctionUtils";

export const createManualJobControlFunction = <
  S,
  SUser extends SessionUser,
  Context,
  Schema extends ParamsSchema,
  Selection extends JobControlOperations,
>({
  jobName,
  selection,
  description,
  params,
  run,
}: {
  jobName: string;
  selection: Selection;
  description: string | undefined;
  params: Schema | undefined;
  run:
    | ((
        context: ManualJobControlFunctionContext<S, SUser, Context, ParamsOutput<Schema>> & {
          operation: SelectedJobControlOperation<Selection>;
        },
      ) => MaybePromise<void>)
    | undefined;
}) => {
  const input: Record<string, JSONB.FieldType> = {
    ...getJobControlOperationInput<Selection>(selection),
    jobId: {
      type: "string",
      optional:
        typeof selection === "string" ?
          selection === "startOrRetry"
        : selection.includes("startOrRetry"),
    },
    ...((typeof selection === "string" ?
      selection !== "cancel"
    : selection.some((operation) => operation !== "cancel")) && {
      params: {
        type: Object.fromEntries(
          Object.entries(params ?? {}).map(([key, field]) => [
            key,
            {
              ...(field.jsonbSchema ?? { type: field.jsonbSchemaType }),
              optional: true,
            } as JSONB.FieldType,
          ]),
        ),
        optional: true,
      },
    }),
  };
  const functionDefinition = {
    input: input as SelectedManualControlInput<Schema, Selection>,
    description,
    unrestrictedDbAccess: true as const,
    run: (
      input: {
        jobId?: string;
        params?: Record<string, JobValue>;
        operation?: JobControlOperation;
      },
      context: UnrestrictedFunctionContext<S, SUser, Context>,
    ) => {
      const operation = getJobControlOperation(selection, input);
      if (operation === "cancel" && "params" in input) {
        throw new Error("Cancelling a job does not accept params");
      }
      const prepare: ManualJobControlOptions<S>["run"] =
        run &&
        (({ job, params, dbx }) =>
          run({
            ...context,
            row: undefined,
            operation: operation as SelectedJobControlOperation<Selection>,
            job,
            params: params as unknown as ParamsOutput<Schema>,
            dbx,
            jobs: context.jobs.withTransaction(dbx),
          }));
      return context.jobs.control<S>(jobName, {
        ...input,
        operation,
        run: prepare,
      });
    },
  };
  return functionDefinition as typeof functionDefinition &
    ServerFunctionContextMarker<S, SUser, Context>;
};

export type ManualJobControlFunctionContext<S, SUser extends SessionUser, Context, Params> = Omit<
  UnrestrictedFunctionContext<S, SUser, Context>,
  "dbo" | "db" | "sql"
> & {
  row: undefined;
  job: JobRecord | undefined;
  params: Params;
  dbx: DBTableHandlersFromSchema<S>;
};

type ManualControlInput<Schema extends ParamsSchema, Operation extends JobControlOperation> = {
  jobId: { type: "string"; optional: Operation extends "startOrRetry" ? true : false };
} & (Operation extends "cancel" ? {}
: {
    params: {
      optional: true;
      type: {
        [Key in keyof Schema]: Omit<
          Schema[Key] extends { jsonbSchema: infer Field } ? Field
          : { type: Schema[Key]["jsonbSchemaType"] },
          "optional"
        > & { optional: true };
      };
    };
  });

type SelectedManualControlInput<
  Schema extends ParamsSchema,
  Selection extends JobControlOperations,
> =
  Selection extends readonly JobControlOperation[] ?
    {
      [Operation in Selection[number]]: ManualControlInput<Schema, Operation> & {
        operation: { enum: readonly [Operation] };
      };
    }[Selection[number]]
  : ManualControlInput<Schema, Extract<Selection, JobControlOperation>>;

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

export const createManualJobControlFunction = <
  S,
  SUser extends SessionUser,
  Context,
  Schema extends ParamsSchema,
  Operation extends JobControlOperation,
>({
  jobName,
  operation,
  description,
  params,
  run,
}: {
  jobName: string;
  operation: Operation;
  description: string | undefined;
  params: Schema | undefined;
  run:
    | ((
        context: ManualJobControlFunctionContext<S, SUser, Context, ParamsOutput<Schema>>,
      ) => MaybePromise<void>)
    | undefined;
}) => {
  const input = {
    jobId: { type: "string", optional: operation === "startOrRetry" },
    ...(operation !== "cancel" && {
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
  } as ManualControlInput<Schema, Operation>;
  const functionDefinition = {
    input,
    description,
    unrestrictedDbAccess: true as const,
    run: (
      input: { jobId?: string; params?: Record<string, JobValue> },
      context: UnrestrictedFunctionContext<S, SUser, Context>,
    ) => {
      const prepare: ManualJobControlOptions<S>["run"] =
        run &&
        (({ job, params, dbx }) =>
          run({
            ...context,
            row: undefined,
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

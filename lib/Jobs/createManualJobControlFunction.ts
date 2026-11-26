import type { MaybePromise } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBTableHandlersFromSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  ServerFunctionContextMarker,
  ServerFunctionDefinition,
  UnrestrictedFunctionContext,
} from "../PublishParser/defineServerFunction";
import { getManualJobControlInput } from "./getManualJobControlInput";
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
  const input = getManualJobControlInput<Schema, Selection>(params, selection);
  const functionDefinition = {
    input,
    description,
    unrestrictedDbAccess: true as const,
    jobControl: { jobName, manualJobIdArgName: "jobId" as const, operation: selection },
    run: (
      input: {
        jobId?: string;
        params?: Record<string, JobValue>;
        operation?: JobControlOperation;
      },
      context: UnrestrictedFunctionContext<S, SUser, Context>,
    ) => {
      const operation = getJobControlOperation(selection, input);
      const prepare: ManualJobControlOptions<S>["run"] =
        run &&
        (({ job, params, dbx }) =>
          run({
            ...context,
            row: undefined,
            operation,
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
  } as const;
  return functionDefinition satisfies ServerFunctionDefinition as typeof functionDefinition &
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

import type { AnyObject, MaybePromise } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBTableHandlersFromSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  ServerFunctionContextMarker,
  UnrestrictedFunctionContext,
} from "../PublishParser/defineServerFunction";
import type { JobControlOperation, JobsConfig, ParamsSchema } from "./JobTypes";
import {
  createManualJobControlFunction,
  type ManualJobControlFunctionContext,
} from "./createManualJobControlFunction";

/**
 * Row controls accept { row }; manual controls accept { jobId, params }.
 * Omit jobId only for a new manual startOrRetry. Existing rows/runs must be readable by the caller.
 */
export const createJobControlFunctionDefiner =
  <S = void, Context = undefined, SUser extends SessionUser = SessionUser>() =>
  <Definitions extends JobsConfig<S, Context>>(jobs: Definitions) =>
  <
    Name extends ControllableJobName<Definitions>,
    Operation extends JobControlOperation,
  >(definition: {
    jobName: Name;
    operation: Operation;
    description?: string;
    /** Validate and prepare in the control transaction. Throw to roll back everything. */
    run?: (
      context: Definitions[Name] extends { trigger: { type: "manual" } } ?
        ManualJobControlFunctionContext<S, SUser, Context, JobParams<Definitions, Name>>
      : JobControlFunctionContext<S, SUser, Context, JobRow<Definitions, Name>>,
    ) => MaybePromise<void>;
  }) => {
    const { jobName, operation, description, run } = definition;
    const job = jobs[jobName];
    if (!job) throw new Error(`Unknown job: ${jobName}`);
    const { trigger } = job;
    type ManualFunction = typeof createManualJobControlFunction<
      S,
      SUser,
      Context,
      JobParamsSchema<Definitions, Name>,
      Operation
    >;
    type RowFunction = typeof createRowJobControlFunction<
      S,
      SUser,
      Context,
      JobRow<Definitions, Name>
    >;
    type FunctionDefinition =
      Definitions[Name] extends { trigger: { type: "manual" } } ? ReturnType<ManualFunction>
      : ReturnType<RowFunction>;
    if (trigger.type === "manual") {
      return createManualJobControlFunction<
        S,
        SUser,
        Context,
        JobParamsSchema<Definitions, Name>,
        Operation
      >({
        jobName,
        operation,
        description,
        params: job.params as JobParamsSchema<Definitions, Name> | undefined,
        run: run as Parameters<ManualFunction>[0]["run"],
      }) as FunctionDefinition;
    }
    if (trigger.type !== "row" || !trigger.jobIdColumn)
      throw new Error(
        `Job control requires a manual job or a row job with jobIdColumn: ${jobName}`,
      );
    return createRowJobControlFunction<S, SUser, Context, JobRow<Definitions, Name>>({
      jobName,
      operation,
      description,
      table: trigger.table,
      run: run as Parameters<RowFunction>[0]["run"],
    }) as FunctionDefinition;
  };

const createRowJobControlFunction = <S, SUser extends SessionUser, Context, Row extends AnyObject>({
  jobName,
  operation,
  description,
  table,
  run,
}: {
  jobName: string;
  operation: JobControlOperation;
  description: string | undefined;
  table: string;
  run:
    | ((context: JobControlFunctionContext<S, SUser, Context, Row>) => MaybePromise<void>)
    | undefined;
}) => {
  const functionDefinition = {
    input: { row: { type: "RowLookup" as const, table } },
    description,
    unrestrictedDbAccess: true as const,
    jobControl: { jobName, rowArg: "row" as const, operation },
    run: (input: { row: AnyObject }, context: UnrestrictedFunctionContext<S, SUser, Context>) =>
      context.jobs.control<S, Row>(jobName, {
        row: input.row,
        operation,
        run:
          run &&
          ((row, dbx) =>
            run({
              ...context,
              row,
              dbx,
              jobs: context.jobs.withTransaction(dbx),
            })),
      }),
  };
  return functionDefinition as typeof functionDefinition &
    ServerFunctionContextMarker<S, SUser, Context>;
};

type ControllableJobName<Definitions> = {
  [Name in keyof Definitions]: Definitions[Name] extends (
    {
      trigger: { type: "row" | "manual" };
    }
  ) ?
    Name
  : never;
}[keyof Definitions] &
  string;

type JobRow<
  Definitions extends Record<string, { run: (...args: any[]) => unknown }>,
  Name extends keyof Definitions,
> = NonNullable<Parameters<Definitions[Name]["run"]>[0]["row"]>;

type JobParams<
  Definitions extends Record<string, { run: (...args: any[]) => unknown }>,
  Name extends keyof Definitions,
> = Parameters<Definitions[Name]["run"]>[0]["params"];

type JobControlFunctionContext<S, SUser extends SessionUser, Context, Row> = Omit<
  UnrestrictedFunctionContext<S, SUser, Context>,
  "dbo" | "db" | "sql"
> & {
  row: Row;
  /** Transactional handlers for validation and preparation writes. */
  dbx: DBTableHandlersFromSchema<S>;
};

type JobParamsSchema<
  Definitions extends Record<string, { params?: ParamsSchema }>,
  Name extends keyof Definitions,
> = NonNullable<Definitions[Name]["params"]>;

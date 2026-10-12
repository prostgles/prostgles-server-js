import type { AnyObject, MaybePromise } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBTableHandlersFromSchema } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  ServerFunctionContextMarker,
  UnrestrictedFunctionContext,
} from "../PublishParser/defineServerFunction";
import type { JobControlOperation, JobsConfig } from "./JobTypes";

/** Bind controls to configured jobs. Published-function access and row read access are required. */
export const createJobControlFunctionDefiner =
  <S = void, Context = undefined, SUser extends SessionUser = SessionUser>() =>
  <Definitions extends JobsConfig<S, Context>>(jobs: Definitions) =>
  <Name extends RowJobName<Definitions>>(definition: {
    jobName: Name;
    operation: JobControlOperation;
    description?: string;
    /** Validate and prepare the locked row before the operation. Throw to roll back everything. */
    run?: (
      context: JobControlFunctionContext<S, SUser, Context, JobRow<Definitions, Name>>,
    ) => MaybePromise<void>;
  }) => {
    const { jobName, operation, description, run } = definition;
    const trigger = jobs[jobName]!.trigger;
    if (trigger.type !== "row" || !trigger.jobIdColumn)
      throw new Error(`Job control requires a row job with jobIdColumn: ${jobName}`);
    const functionDefinition = {
      input: { row: { type: "RowLookup" as const, table: trigger.table } },
      description,
      unrestrictedDbAccess: true as const,
      jobControl: { jobName, rowArg: "row" as const, operation },
      run: (input: { row: AnyObject }, context: UnrestrictedFunctionContext<S, SUser, Context>) =>
        context.jobs.control<S, JobRow<Definitions, Name>>(jobName, {
          row: input.row,
          operation,
          run: run && ((row, dbx) =>
            run({ ...context, row, dbx, jobs: context.jobs.withTransaction(dbx) })),
        }),
    };
    return functionDefinition as typeof functionDefinition &
      ServerFunctionContextMarker<S, SUser, Context>;
  };

type RowJobName<Definitions> = {
  [Name in keyof Definitions]: Definitions[Name] extends { trigger: { type: "row" } } ? Name
  : never;
}[keyof Definitions] &
  string;

type JobRow<
  Definitions extends Record<string, { run: (...args: any[]) => unknown }>,
  Name extends keyof Definitions,
> = NonNullable<Parameters<Definitions[Name]["run"]>[0]["row"]>;

type JobControlFunctionContext<S, SUser extends SessionUser, Context, Row> = Omit<
  UnrestrictedFunctionContext<S, SUser, Context>,
  "dbo" | "db" | "sql"
> & {
  row: Row;
  /** Transactional handlers for validation and preparation writes. */
  dbx: DBTableHandlersFromSchema<S>;
};

import type pgPromise from "pg-promise";
import type {
  AnyObject,
  DBSchema,
  FullFilter,
  JobControlOperation,
  JobStatus,
  JobRecord,
  JobValue,
  JSONB,
  MaybePromise,
} from "prostgles-types";
export type {
  JobRecord,
  JobInsertRecord,
  JobValue,
  JobStatus,
  JobControlOperation,
  JobControlFunctionMetadata,
  JobControlBinding,
} from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type {
  DBHandlerServer,
  DBTableHandlersFromSchema,
} from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DbTxTableHandlers } from "../DboBuilder/DboBuilderTypes";
import type { JSONBColumnDef } from "../TableConfig/TableConfigTypes";

export type ParamsSchema = Record<
  string,
  JSONBColumnDef & ({ optional: true } | { default: unknown })
>;
type ParamType<P extends JSONBColumnDef> =
  P extends { jsonbSchema: infer J extends JSONB.JSONBSchema } ? JSONB.GetSchemaType<J>
  : P extends { jsonbSchemaType: infer J extends JSONB.ObjectType["type"] } ? JSONB.GetObjectType<J>
  : never;
export type ParamsOutput<P extends ParamsSchema> = {
  -readonly [K in keyof P as P[K] extends { default: unknown } ? K : never]: ParamType<P[K]>;
} & {
  -readonly [K in keyof P as P[K] extends { default: unknown } ? never : K]?: ParamType<P[K]>;
};

export type RowTrigger<S, T extends JobTableName<S>> = {
  type: "row";
  table: T;
  /** Use an empty array for rows whose jobs are started only through the jobs API. */
  on: ("insert" | "update")[];
  /** On updates, at least one of these columns must actually change. */
  columns?: (keyof JobRow<S, T> & string)[];
  /** Existing column receiving the job ID atomically, including reruns, through normal table hooks. */
  jobIdColumn?: keyof JobRow<S, T> & string;
  /**
   * A filter that determines when the trigger should fire. If omitted, the trigger fires for all rows.
   */
  when?: FullFilter<JobRow<S, T>, S extends DBSchema ? S : void>;
};
/** Missed occurrences while all workers are stopped are not replayed. */
export type ScheduleTrigger = { type: "schedule"; cron: string; timezone?: string };
export type ManualTrigger = { type: "manual" };
export type JobRetention =
  | "forever"
  | Partial<
      Record<
        Extract<JobStatus, "succeeded" | "failed" | "cancelled">,
        | string
        | {
            /** Positive milliseconds or a PostgreSQL interval, measured from finished_at. */
            maxAge?: number | string;
            /** Keep the newest runs of this status. Zero removes all eligible runs. */
            maxCount?: number;
          }
      >
    >;
export type JobContext<
  S,
  T extends JobTableName<S> | undefined,
  P extends ParamsSchema,
  Context = undefined,
> = {
  /** Re-fetched at the start of each attempt. Undefined for jobs without a row. */
  row: T extends string ? Required<JobRow<S, T>> : undefined;
  params: ParamsOutput<P>;
  dbo: DBHandlerServer<S>;
  user: SessionUser["user"] | undefined;
  context: Context;
  /** An attempt released during graceful shutdown keeps its number when resumed. */
  run: { id: string; attempt: number; reason: "trigger" | "rerun" | "retry" };
  /** Cancellation and timeouts are cooperative: handlers must observe this signal. */
  signal: AbortSignal;
  progress: (done: number, total: number) => Promise<void>;
  progressMessage: (message: string | null) => Promise<void>;
  checkpoint: { get<C>(): Promise<C | undefined>; set<C>(value: C): Promise<void> };
  fail: (reason: string) => never;
};

export type JobDefinition<
  S = void,
  T extends JobTableName<S> | undefined = JobTableName<S> | undefined,
  P extends ParamsSchema = ParamsSchema,
  Context = undefined,
> = JobDefinitionOptions<S, T, P, Context> &
  (T extends JobTableName<S> ? { trigger: RowTrigger<S, T>; retention?: never }
  : {
      trigger: ScheduleTrigger | ManualTrigger;
      /** Required for jobs without a row. "forever" keeps all history.
       * Per-status strings shorthand maxAge; "forever" or omitted statuses keep their history.
       * Cleanup runs periodically and preserves the current scheduling minute for deduplication.
       */
      retention: JobRetention;
    });

export type JobsConfig<S = void, Context = undefined> = Record<
  string,
  (
    | { [T in JobTableName<S>]: Omit<JobDefinition<S, T, any, Context>, "params"> }[JobTableName<S>]
    | Omit<JobDefinition<S, undefined, any, Context>, "params">
  ) & { params?: ParamsSchema }
>;
export type JobsOptions<S = void, Context = undefined> = {
  definitions: JobsConfig<S, Context>;
  /** Application table managed through tableConfig. Defaults to prostgles_jobs. */
  tableName?: string;
};

/** Infers a job's params and row while sharing the application's schema/context. */
export const createJobDefiner = <S = void, Context = undefined>() =>
  ((definition: unknown) => definition) as DefineJob<S, Context>;

type DefineJob<S, Context> = {
  <T extends JobTableName<S>, const P extends ParamsSchema = {}>(
    definition: JobDefinitionOptions<S, T, P, Context> & {
      trigger: RowTrigger<S, T>;
      retention?: never;
    },
  ): JobDefinition<S, T, P, Context>;
  <
    const P extends ParamsSchema = {},
    Trigger extends ScheduleTrigger | ManualTrigger = ScheduleTrigger | ManualTrigger,
  >(
    definition: JobDefinition<S, undefined, P, Context> & { trigger: Trigger },
  ): JobDefinition<S, undefined, P, Context> & { trigger: Trigger };
};

export const jobControlStatuses: Record<JobControlOperation, readonly JobStatus[]> = {
  startOrRetry: ["failed", "cancelled"],
  rerun: ["succeeded"],
  cancel: ["pending", "running"],
};
export type JobControlOptions<S = void, Row extends AnyObject = AnyObject> = {
  row: AnyObject;
  operation: JobControlOperation;
  run?: (row: Row, dbx: DBTableHandlersFromSchema<S>) => MaybePromise<void>;
};
export type ManualJobControlOptions<S = void> = {
  /** Omit only when starting a new manual job with startOrRetry. */
  jobId?: string;
  params?: Record<string, JobValue>;
  operation: JobControlOperation;
  run?: (context: {
    job: JobRecord | undefined;
    params: Record<string, JobValue>;
    dbx: DBTableHandlersFromSchema<S>;
  }) => MaybePromise<void>;
};
/** Uses the execution request/user, or an explicit userId. Calls without either are trusted server operations.
 * Mutations create their own transaction unless explicitly bound with withTransaction.
 */
export type Jobs = {
  /** Bind to this instance's dbx from dbo.tx, withClientDbTx or a table hook. Rejects after it finishes. */
  withTransaction: (dbx: object) => Jobs;
  /** User reads obey the jobs table's publish.select fields and filters. */
  get: (id: string, options?: { userId: string }) => Promise<Partial<JobRecord> | undefined>;
  /** Server operation. Row jobs require a primary key and must satisfy trigger.when.
   * Expose through a published function to authorize client calls, as with rerun.
   */
  start: (
    name: string,
    params?: Record<string, JobValue>,
    options?: { row?: JobRecord["target_row_pkey"]; userId?: string },
  ) => Promise<{ jobId: string }>;
  /** Server operation. Expose through a published function to authorize client calls. */
  cancel: (id: string) => Promise<void>;
  /** Server operation. The user context determines who the new run executes as. */
  rerun: (
    id: string,
    params?: Record<string, JobValue>,
    options?: { userId: string },
  ) => Promise<{ jobId: string }>;
  /** Requires an execution user. Uses the bound transaction, or creates its own. */
  control: {
    <S = void, Row extends AnyObject = AnyObject>(
      name: string,
      options: JobControlOptions<S, Row>,
    ): Promise<{ jobId: string }>;
    <S = void>(name: string, options: ManualJobControlOptions<S>): Promise<{ jobId: string }>;
  };
};
export type JobTransaction = { t: pgPromise.ITask<{}>; dbx: DbTxTableHandlers };
export type RuntimeJobDefinition = JobDefinition<void, string | undefined, ParamsSchema, unknown>;
type JobDefinitionOptions<
  S,
  T extends JobTableName<S> | undefined,
  P extends ParamsSchema,
  Context,
> = {
  params?: P;
  /** Defaults to system. User jobs enforce the triggering/rerunning user's publish rules. */
  runAs?: "system" | "user";
  /**
   * Failures and stalled executions have separate retry budgets and backoff counts.
   * Graceful shutdowns consume neither.
   */
  retry?: {
    maxAttempts: number;
    /** Maximum stalled executions to recover from. Defaults to 3; 0 disables recovery. */
    maxStalledCount?: number;
    backoff?: "exponential" | "fixed";
    delayMs?: number;
  };
  timeoutMs?: number;
  /** Conflicts use the job name and row primary key, or just the name for jobs without a row. */
  onConflict?: "queue" | "replace" | "skip";
  /** Maximum parallel runs across workers. Defaults to 1. Same-key runs are serialized. */
  concurrency?: number;
  /** JSON return values are saved to output when the job succeeds. */
  run: (ctx: JobContext<S, T, P, Context>) => Promise<JobValue | void>;
};
type JobTableName<S> = S extends DBSchema ? keyof S & string : string;
type JobRow<S, T extends string> =
  S extends Record<T, { columns: infer R extends AnyObject }> ? R : AnyObject;

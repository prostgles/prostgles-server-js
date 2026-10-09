import type pgPromise from "pg-promise";
import type { AnyObject, DBSchema, FullFilter, JSONB } from "prostgles-types";
import type { SessionUser } from "../Auth/AuthTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type { DbTxTableHandlers } from "../DboBuilder/DboBuilderTypes";
import type { JSONBColumnDef } from "../TableConfig/TableConfigTypes";
import type {
  TableInsertRowFromTableConfig,
  TableRowFromTableConfig,
} from "../TableConfig/TableRowFromColumnDefinitions";
import type { jobTableConfig } from "./jobTableConfig";

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
  on: ("insert" | "update")[];
  /** On updates, at least one of these columns must actually change. */
  columns?: (keyof JobRow<S, T> & string)[];
  /** Existing column receiving the job ID atomically, including reruns, without invoking row hooks. */
  jobIdColumn?: keyof JobRow<S, T> & string;
  when?: FullFilter<JobRow<S, T>, S extends DBSchema ? S : void>;
};
/** Missed occurrences while all workers are stopped are not replayed. */
export type ScheduleTrigger = { type: "schedule"; cron: string; timezone?: string };
export type JobContext<
  S,
  T extends JobTableName<S> | undefined,
  P extends ParamsSchema,
  Context = undefined,
> = {
  /** Re-fetched at the start of each attempt. Undefined for schedules. */
  row: T extends string ? Required<JobRow<S, T>> : undefined;
  params: ParamsOutput<P>;
  dbo: DBOFullyTyped<S>;
  user: SessionUser["user"] | undefined;
  context: Context;
  run: { id: string; attempt: number; reason: "trigger" | "rerun" | "retry" };
  /** Cancellation and timeouts are cooperative: handlers must observe this signal. */
  signal: AbortSignal;
  progress: (done: number, total?: number) => Promise<void>;
  checkpoint: { get<C>(): Promise<C | undefined>; set<C>(value: C): Promise<void> };
  fail: (reason: string) => never;
};

export type JobDefinition<
  S = void,
  T extends JobTableName<S> | undefined = JobTableName<S> | undefined,
  P extends ParamsSchema = ParamsSchema,
  Context = undefined,
> = {
  trigger: T extends JobTableName<S> ? RowTrigger<S, T> : ScheduleTrigger;
  params?: P;
  /** Defaults to system. User jobs enforce the triggering/rerunning user's publish rules. */
  runAs?: "system" | "user";
  retry?: { maxAttempts: number; backoff?: "exponential" | "fixed"; delayMs?: number };
  timeoutMs?: number;
  /** Conflicts use the job name and row primary key, or just the name for schedules. */
  onConflict?: "queue" | "replace" | "skip";
  /** Maximum parallel runs across workers. Defaults to 1. Same-key runs are serialized. */
  concurrency?: number;
  run: (ctx: JobContext<S, T, P, Context>) => Promise<void>;
};

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
    definition: Omit<JobDefinition<S, T, P, Context>, "trigger"> & { trigger: RowTrigger<S, T> },
  ): JobDefinition<S, T, P, Context>;
  <const P extends ParamsSchema = {}>(
    definition: JobDefinition<S, undefined, P, Context>,
  ): JobDefinition<S, undefined, P, Context>;
};

export type JobValue =
  null | string | number | boolean | readonly JobValue[] | { readonly [key: string]: JobValue };
type JobValues = {
  owner: Record<string, JobValue>;
  params: Record<string, JobValue>;
  checkpoint: JobValue | null;
  progress: { done: number; total?: number } | null;
};
export type JobRecord = TableRowFromTableConfig<typeof jobTableConfig, JobValues>;
export type JobInsertRecord = TableInsertRowFromTableConfig<typeof jobTableConfig, JobValues>;
export type JobStatus = JobRecord["status"];
/** Uses the execution request/user, or an explicit userId. Calls without either are trusted server operations. */
export type Jobs = {
  /** User reads obey the jobs table's publish.select fields and filters. */
  get: (id: string, options?: { userId: string }) => Promise<Partial<JobRecord> | undefined>;
  /** Server operation. Expose through a published function to authorize client calls. */
  cancel: (id: string) => Promise<void>;
  /** Server operation. The user context determines who the new run executes as. */
  rerun: (
    id: string,
    params?: Record<string, JobValue>,
    options?: { userId: string },
  ) => Promise<{ jobId: string }>;
};
export type JobTransaction = { t: pgPromise.ITask<{}>; dbx: DbTxTableHandlers };
export type RuntimeJobDefinition = JobDefinition<void, string | undefined, ParamsSchema, unknown>;
type JobTableName<S> = S extends DBSchema ? keyof S & string : string;
type JobRow<S, T extends string> =
  S extends Record<T, { columns: infer R extends AnyObject }> ? R : AnyObject;

import type pgPromise from "pg-promise";
import type { AnyObject, DBSchema, InsertDataWithNested } from "prostgles-types";

import type { DbTxTableHandlers } from "../DboBuilder/DboBuilderTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  AfterAllTsTrigger,
  AfterCommitTsTrigger,
  AfterEachTsTrigger,
  BeforeEachTsTrigger,
  TransactionCallbacks,
} from "../PublishParser/PublishParser";

export type TableHooks<S = void, Context = undefined> =
  S extends DBSchema ?
    Partial<{
      [tableName in keyof S]: TableHooksDefinition<
        Required<S[tableName]["columns"]>,
        DBOFullyTyped<S>,
        Context,
        InsertDataWithNested<S[tableName]["columns"], S, tableName>,
        S
      >;
    }>
  : Record<string, TableHooksDefinition<AnyObject, DbTxTableHandlers, Context>>;

export type TableHooksDefinition<
  RowDataType = AnyObject,
  DBX = DbTxTableHandlers,
  Context = undefined,
  InputDataType = RowDataType,
  ClientSchema = void,
> = {
  /**
   * Runs sequentially before data validation and mutation SQL for each insert row,
   * or once per update request, including requests with no matching rows.
   * Upserts run applicable hooks with command `insertOnConflictDoUpdate` and no filter.
   * Upserts reject before mutation if an applicable hook targets only insert or only update.
   * Hooks targeting both commands run once, before the outcome is known.
   * The update filter includes the publish forcedFilter.
   * Also runs when generating SQL statements (including updateBatch).
   * File inserts/updates reject SQL-only requests; file updates lock matching rows before hooks.
   * May replace the pending data and pass `hookContext` to the next hook.
   * Data is the raw input, including nested inserts and values awaiting PostgreSQL casts.
   * Register `onCommit`/`onRollback` before starting external work so cleanup also runs if the
   * hook throws. These callbacks are awaited after the outer transaction finishes and receive
   * the non-transactional `db` and `dbo` objects.
   */
  beforeEach?: BeforeEachTsTrigger<InputDataType, DBX, Context>[];

  /**
   * Runs once per affected row after SQL, inside the same transaction.
   * After hooks require database trigger privileges on an ordinary or partitioned table.
   * Update `changedFields` requires an ordinary table; values are compared in PostgreSQL.
   * `row` is the inserted/updated row or the deleted row's pre-delete state. Throwing rolls back.
   * `data` is the input for the operation, including the whole array for bulk inserts.
   * Use `onCommit` for side effects that must only run after the transaction commits.
   * Its callback receives the non-transactional `db` and `dbo` objects.
   */
  afterEach?: AfterEachTsTrigger<RowDataType, DBX, Context, InputDataType>[];

  /**
   * Runs once after all applicable `afterEach` hooks, inside the same transaction.
   * Receives all affected `rows`; throwing rolls back the operation.
   * Mixed upserts run once per actual command. `data` contains the whole operation's input;
   * use `rows` for the affected records in this batch.
   * Use `onCommit` for side effects that must only run after the transaction commits.
   * Its callback receives the non-transactional `db` and `dbo` objects.
   * Nested writes retrigger hooks unless the individual hook sets `preventRecursion: true`.
   */
  afterAll?: AfterAllTsTrigger<RowDataType, DBX, Context>[];

  /**
   * Runs once after the outer transaction commits successfully with at least one affected row.
   * Receives committed rows and non-transactional handlers; it cannot roll back the mutation.
   * It is awaited before the mutation promise resolves. Errors are logged and do not change the
   * mutation result.
   */
  afterCommit?: AfterCommitTsTrigger<RowDataType, DBX, Context, ClientSchema>[];

  /**
   * Replaces the generated DELETE. Must perform the mutation and shape its return value using
   * the prepared filter and returning arguments. Delete `afterEach`/`afterAll`/`afterCommit`
   * hooks do not run.
   * Use `onCommit`/`onRollback` for external side effects after the outer transaction finishes.
   */
  onInsteadOfDelete?: (
    args: {
      context: Context;
      dbx: DBX;
      tx: pgPromise.ITask<{}>;
      returningQuery: string;
      isOneOrNone: boolean;
      queryType: "any" | "none";
      filterOpts: {
        where: string;
        filter: AnyObject;
      };
    } & TransactionCallbacks<DBX>,
  ) => Promise<AnyObject[] | undefined>;
};

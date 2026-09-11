import type pgPromise from "pg-promise";
import type {
  AnyObject,
  DBSchema,
  InsertDataWithNested,
} from "prostgles-types";

import type { DbTxTableHandlers } from "../DboBuilder/DboBuilderTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  AfterAllTsTrigger,
  AfterEachTsTrigger,
  BeforeEachTsTrigger,
  TransactionCallbacks,
} from "../PublishParser/PublishParser";

export type TableHooks<S = void, Context = undefined> = S extends DBSchema
  ? Partial<{
      [tableName in keyof S]: TableHooksDefinition<
        Required<S[tableName]["columns"]>,
        DBOFullyTyped<S>,
        Context,
        InsertDataWithNested<S[tableName]["columns"], S, tableName>
      >;
    }>
  : Record<string, TableHooksDefinition<AnyObject, DbTxTableHandlers, Context>>;

export type TableHooksDefinition<
  RowDataType = AnyObject,
  DBX = DbTxTableHandlers,
  Context = undefined,
  InputDataType = RowDataType,
> = {
  /**
   * Runs sequentially before data validation and mutation SQL for each insert row,
   * or once per update request, including requests with no matching rows.
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
   * `row` is the inserted/updated row or the deleted row's pre-delete state. Throwing rolls back.
   * `data` is the input for the operation, including the whole array for bulk inserts.
   * Use `onCommit` for side effects that must only run after the transaction commits.
   * Its callback receives the non-transactional `db` and `dbo` objects.
   */
  afterEach?: AfterEachTsTrigger<RowDataType, DBX, Context, InputDataType>[];

  /**
   * Runs once after all applicable `afterEach` hooks, inside the same transaction.
   * Receives all affected `rows`; throwing rolls back the operation.
   * Use `onCommit` for side effects that must only run after the transaction commits.
   * Its callback receives the non-transactional `db` and `dbo` objects.
   * Same-table, same-command writes from after-hooks do not retrigger after-hooks.
   */
  afterAll?: AfterAllTsTrigger<RowDataType, DBX, Context>[];

  /**
   * Replaces the generated DELETE. Must perform the mutation and shape its return value using
   * the prepared filter and returning arguments. Delete `afterEach`/`afterAll` hooks do not run.
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

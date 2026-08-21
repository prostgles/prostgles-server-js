import type pgPromise from "pg-promise";
import type { AnyObject, DBSchema } from "prostgles-types";

import type { DbTxTableHandlers } from "../DboBuilder/DboBuilderTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  AfterAllTsTrigger,
  AfterEachTsTrigger,
  BeforeEachTsTrigger,
} from "../PublishParser/PublishParser";

export type TableHooks<S = void, Context = undefined> =
  S extends DBSchema ?
    Partial<{
      [tableName in keyof S]: TableHooksDefinition<
        Required<S[tableName]["columns"]>,
        DBOFullyTyped<S>,
        Context
      >;
    }>
  : Record<string, TableHooksDefinition<AnyObject, DbTxTableHandlers, Context>>;

export type TableHooksDefinition<
  RowDataType = AnyObject,
  DBX = DbTxTableHandlers,
  Context = undefined,
> = {
  /**
   * Runs sequentially before validation and SQL for each insert row, or once per update request.
   * May replace the pending data and pass `hookContext` to the next hook.
   * `onInserted` also runs for updates, is not awaited, and runs before the transaction commits.
   */
  beforeEach?: BeforeEachTsTrigger<RowDataType, DBX, Context>[];

  /**
   * Runs once per affected row after SQL, inside the same transaction.
   * `row` is the inserted/updated row or the deleted row's pre-delete state. Throwing rolls back.
   * Use `onCommit` for side effects that must only run after the transaction commits.
   * Its callback receives the non-transactional `db` and `dbo` objects.
   */
  afterEach?: AfterEachTsTrigger<RowDataType, DBX, Context>[];

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
   */
  onInsteadOfDelete?: (args: {
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
  }) => Promise<AnyObject[] | undefined>;
};

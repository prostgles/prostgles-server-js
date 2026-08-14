import type pgPromise from "pg-promise";
import type { AnyObject, DBSchema } from "prostgles-types";

import type { DbTxTableHandlers, LocalParams } from "../DboBuilder/DboBuilderTypes";
import type { DBOFullyTyped } from "../DBSchemaBuilder/DBSchemaBuilder";
import type {
  AfterAllTsTrigger,
  AfterEachTsTrigger,
  BeforeEachTsTrigger,
  InsertRule,
  ValidateRowArgsCommon,
} from "../PublishParser/PublishParser";

export type TableHooks<S = void> =
  S extends DBSchema ?
    Partial<{
      [tableName in keyof S]: TableHooksDefinition<S[tableName]["columns"], DBOFullyTyped<S>>;
    }>
  : Record<string, TableHooksDefinition>;

export type TableHooksDefinition<R = AnyObject, DBX = DbTxTableHandlers> = {
  /**
   * Hook used to run custom logic before inserting a row.
   * The returned row must satisfy the table schema.
   */
  getPreInsertRow?: (
    args: PreInsertRowArgs,
  ) => Promise<{ row: AnyObject; onInserted: Promise<void> }>;
  beforeEach?: BeforeEachTsTrigger<R, DBX>[];
  afterEach?: AfterEachTsTrigger<R, DBX>[];
  afterAll?: AfterAllTsTrigger<R, DBX>[];
  onInsteadOfDelete?: (args: {
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

type PreInsertRowArgs = Omit<ValidateRowArgsCommon, "localParams"> & {
  validate: InsertRule["validate"];
  localParams: LocalParams | undefined;
};

import type {
  DBSchema,
  FullFilter,
  SelectParams,
  SelectReturnType,
  TableHandler,
} from "prostgles-types";
import type { TX } from "../DboBuilder/DboBuilderTypes";
import type { ServerSelectParams } from "../DboBuilder/ViewHandler/find";
import type { PublishAllOrNothing, PublishTableRule } from "../PublishParser/PublishParser";
import { type PublishObject } from "../PublishParser/PublishParser";

export type ServerTableHandler<
  Schema extends DBSchema = DBSchema,
  TName extends keyof Schema = keyof Schema,
> = Omit<TableHandler<Schema, TName>, "find" | "findOne"> & {
  isView: boolean;
  find<
    const P extends SelectParams<Schema[TName]["columns"], DBSchema extends Schema ? void : Schema>,
  >(
    filter?: FullFilter<Schema[TName]["columns"], DBSchema extends Schema ? void : Schema>,
    selectParams?: P & Pick<ServerSelectParams, "forUpdate">,
  ): Promise<
    SelectReturnType<DBSchema extends Schema ? void : Schema, P, Schema[TName]["columns"], true>
  >;
  findOne<
    const P extends SelectParams<Schema[TName]["columns"], DBSchema extends Schema ? void : Schema>,
  >(
    filter?: FullFilter<Schema[TName]["columns"], DBSchema extends Schema ? void : Schema>,
    selectParams?: P & Pick<ServerSelectParams, "forUpdate">,
  ): Promise<
    | undefined
    | SelectReturnType<DBSchema extends Schema ? void : Schema, P, Schema[TName]["columns"], false>
  >;
};

export type DBTableHandlersFromSchema<Schema = void> =
  Schema extends DBSchema ?
    {
      [tov_name in keyof Schema]: ServerTableHandler<Schema, tov_name>;
    }
  : Record<string, Partial<ServerTableHandler>>;

export type DBHandlerServerWithTx<
  TH = Record<string, Partial<ServerTableHandler>>,
  WithTransactions = true,
> = WithTransactions extends true ? { tx: TX<TH> } : Record<string, never>;

export type DBOFullyTyped<
  Schema = void,
  WithTransactions = true,
> = DBTableHandlersFromSchema<Schema> &
  DBHandlerServerWithTx<DBTableHandlersFromSchema<Schema>, WithTransactions>;

/** Publish-aware server wrappers for client requests; transactions and isView are unavailable. */
export type DBOFullyTypedClient<Schema = void> =
  Schema extends DBSchema ?
    {
      [TName in keyof Schema]:
        | Omit<ServerTableHandler<Schema, TName>, "isView">
        | (Schema[TName] extends { optional: true } ? undefined : never);
    }
  : Record<string, Partial<Omit<ServerTableHandler, "isView">>>;

export type PublishFullyTyped<Schema = void> =
  Schema extends DBSchema ?
    {
      [tov_name in keyof Partial<Schema>]:
        PublishAllOrNothing | PublishTableRule<Schema[tov_name]["columns"], Schema>;
    }
  : PublishObject;

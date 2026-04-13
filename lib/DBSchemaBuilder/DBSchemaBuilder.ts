import type { AnyObject, DBSchema, TableHandler } from "prostgles-types";
import type { TX } from "../DboBuilder/DboBuilderTypes";
import type { PublishAllOrNothing, PublishTableRule } from "../PublishParser/PublishParser";
import { type PublishObject } from "../PublishParser/PublishParser";

export type ServerTableHandler<
  T extends AnyObject = AnyObject,
  Schema extends DBSchema | void = void,
> = TableHandler<T, Schema> & { is_view: false };

export type DBTableHandlersFromSchema<Schema = void> =
  Schema extends DBSchema ?
    {
      [tov_name in keyof Schema]: ServerTableHandler<Schema[tov_name]["columns"], Schema>;
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

export type PublishFullyTyped<Schema = void> =
  Schema extends DBSchema ?
    {
      [tov_name in keyof Partial<Schema>]:
        | PublishAllOrNothing
        | PublishTableRule<Schema[tov_name]["columns"], Schema>;
    }
  : PublishObject;

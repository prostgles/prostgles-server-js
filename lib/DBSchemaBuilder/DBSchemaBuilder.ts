import type { AnyObject, DBSchema, TableHandler, ViewHandler } from "prostgles-types";
import type { TX } from "../DboBuilder/DboBuilderTypes";
import type {
  PublishAllOrNothing,
  PublishTableRule,
  PublishViewRule,
} from "../PublishParser/PublishParser";
import { type PublishObject } from "../PublishParser/PublishParser";

export type ServerViewHandler<
  T extends AnyObject = AnyObject,
  Schema extends DBSchema | void = void,
> = ViewHandler<T, Schema> & { is_view: true };
export type ServerTableHandler<
  T extends AnyObject = AnyObject,
  Schema extends DBSchema | void = void,
> = TableHandler<T, Schema> & { is_view: false };

export type DBTableHandlersFromSchema<Schema = void> =
  Schema extends DBSchema ?
    {
      [tov_name in keyof Schema]: Schema[tov_name]["is_view"] extends true ?
        ServerViewHandler<Schema[tov_name]["columns"], Schema>
      : ServerTableHandler<Schema[tov_name]["columns"], Schema>;
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
        | (Schema[tov_name]["is_view"] extends true ?
            PublishViewRule<Schema[tov_name]["columns"], Schema>
          : PublishTableRule<Schema[tov_name]["columns"], Schema>);
    }
  : PublishObject;

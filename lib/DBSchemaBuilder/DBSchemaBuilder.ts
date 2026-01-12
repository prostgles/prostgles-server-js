import type {
  AnyObject,
  DbJoinMaker,
  DBSchema,
  SQLHandler,
  TableHandler,
  TableSchema,
  ViewHandler,
} from "prostgles-types";
import type { TX } from "../DboBuilder/DboBuilderTypes";
import type {
  PublishAllOrNothing,
  PublishTableRule,
  PublishViewRule,
} from "../PublishParser/PublishParser";
import { type PublishObject } from "../PublishParser/PublishParser";
import type { TableConfig } from "../TableConfig/TableConfig";
import { escapeTSNames } from "../utils/utils";
import { getColumnTypescriptDefinition } from "./getColumnTypescriptDefinition";

export const getDBTypescriptSchema = ({
  tablesOrViews,
  config,
}: {
  tablesOrViews: TableSchema[];
  config: TableConfig | undefined;
}): string => {
  const tables: string[] = [];

  /** Tables and columns are sorted to avoid infinite loops due to changing order */
  tablesOrViews
    .slice(0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((tableOrView) => {
      const { privileges, columns } = tableOrView;
      const cols = columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
      tables.push(`${escapeTSNames(tableOrView.name)}: {
    is_view: ${tableOrView.is_view};
    select: ${privileges.select};
    insert: ${privileges.insert};
    update: ${privileges.update};
    delete: ${privileges.delete};
    columns: {${cols
      .map(
        (column) => `
      ${getColumnTypescriptDefinition({ tablesOrViews, config, tableOrView, column })}`
      )
      .join("")}
    };
  };\n  `);
    });
  return `
export type DBGeneratedSchema = {
  ${tables.join("")}
}
`;
};

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

export type DBHandlerServerExtra<
  TH = Record<string, Partial<ServerTableHandler>>,
  WithTransactions = true,
> = {
  sql: SQLHandler;
} & Partial<DbJoinMaker> &
  (WithTransactions extends true ? { tx: TX<TH> } : Record<string, never>);

export type DBOFullyTyped<
  Schema = void,
  WithTransactions = true,
> = DBTableHandlersFromSchema<Schema> &
  DBHandlerServerExtra<DBTableHandlersFromSchema<Schema>, WithTransactions>;

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

import { DBSchema, TableHandler, ViewHandler } from "prostgles-types";
import { DBHandlerServer, DboBuilder } from "./DboBuilder";
import { PublishAllOrNothing, PublishTableRule, PublishViewRule } from "./PublishParser";
export declare const getDBSchema: (dboBuilder: DboBuilder) => string;
type DBTableHandlersFromSchema<Schema = void> = Schema extends DBSchema ? {
    [tov_name in keyof Schema]: Schema[tov_name]["is_view"] extends true ? ViewHandler<Schema[tov_name]["columns"]> : TableHandler<Schema[tov_name]["columns"]>;
} : Record<string, TableHandler>;
export type DBOFullyTyped<Schema = void> = Schema extends DBSchema ? (DBTableHandlersFromSchema<Schema> & Pick<DBHandlerServer<DBTableHandlersFromSchema<Schema>>, "tx" | "sql">) : DBHandlerServer;
export type PublishFullyTyped<Schema = void> = Schema extends DBSchema ? (PublishAllOrNothing | {
    [tov_name in keyof Partial<Schema>]: PublishAllOrNothing | (Schema[tov_name]["is_view"] extends true ? PublishViewRule<Schema[tov_name]["columns"], Schema> : PublishTableRule<Schema[tov_name]["columns"], Schema>);
}) : (PublishAllOrNothing | Record<string, PublishViewRule | PublishTableRule | PublishAllOrNothing>);
export {};
//# sourceMappingURL=DBSchemaBuilder.d.ts.map
import { DBSchemaColumns, DBSchema, TableHandler, ViewHandler } from "prostgles-types";
import { DBHandlerServer, DboBuilder } from "./DboBuilder";
import { PublishAllOrNothing, PublishTableRule, PublishViewRule } from "./PublishParser";
export declare const getDBSchema: (dboBuilder: DboBuilder) => string;
export declare type DBOFullyTyped<Schema extends DBSchema = never> = Schema extends DBSchema ? ({
    [tov_name in keyof Schema]: Schema[tov_name]["is_view"] extends true ? ViewHandler<DBSchemaColumns<Schema[tov_name]["columns"]>> : TableHandler<DBSchemaColumns<Schema[tov_name]["columns"]>>;
} & Pick<DBHandlerServer, "tx" | "sql">) : DBHandlerServer;
export declare type PublishFullyTyped<Schema extends DBSchema> = {
    [tov_name in keyof Partial<Schema>]: PublishAllOrNothing | (Schema[tov_name]["is_view"] extends true ? PublishViewRule<Schema[tov_name]> : PublishTableRule<Schema[tov_name]>);
};
//# sourceMappingURL=DBSchemaBuilder.d.ts.map
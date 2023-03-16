import { DB } from "../Prostgles";
import { ColumnConfig } from "./TableConfig";
import pgPromise from "pg-promise";
type Args = {
    column: string;
    colConf: ColumnConfig;
    db: DB;
    table: string;
};
/**
 * Column create statement for a given config
 */
export declare const getColumnDefinitionQuery: ({ colConf: colConfRaw, column, db, table }: Args) => Promise<string | undefined>;
export type ColumnMinimalInfo = {
    table_name: string;
    table_schema: string;
    column_name: string;
    column_default: string | null;
    udt_name: string;
    nullable: boolean;
};
export declare const getTableColumns: ({ db, table }: {
    db: DB | pgPromise.ITask<{}>;
    table: string;
}) => Promise<ColumnMinimalInfo[]>;
export {};
//# sourceMappingURL=getColumnDefinitionQuery.d.ts.map
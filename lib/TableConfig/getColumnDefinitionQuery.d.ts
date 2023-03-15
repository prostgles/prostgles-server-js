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
export type ColConstraint = {
    name: string;
    table: string;
    type: "c" | "p" | "u" | "f";
    cols: Array<string>;
    definition: string;
    schema: string;
};
type ColConstraintsArgs = {
    db: DB | pgPromise.ITask<{}>;
    table?: string;
    column?: string;
    types?: ColConstraint["type"][];
};
export declare const getColConstraintsQuery: ({ column, table, types }: Omit<ColConstraintsArgs, "db">) => string;
export declare const getColConstraints: ({ db, column, table, types }: ColConstraintsArgs) => Promise<ColConstraint[]>;
export type ColumnMinimalInfo = {
    table_name: string;
    table_schema: string;
    column_name: string;
    column_default: string | null;
    udt_name: string;
    nullable: boolean;
};
export declare const getTableColumns: ({ db, tableName }: {
    db: DB;
    tableName: string;
}) => Promise<ColumnMinimalInfo[]>;
export {};
//# sourceMappingURL=getColumnDefinitionQuery.d.ts.map
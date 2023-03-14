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
export declare const getColumnDefinitionQuery: ({ colConf, column, db, table }: Args) => Promise<string>;
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
export {};
//# sourceMappingURL=getColumnDefinitionQuery.d.ts.map
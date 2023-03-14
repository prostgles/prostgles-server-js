import { DB } from "../Prostgles";
import { ColumnConfig } from "./TableConfig";
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
export declare const getColConstraints: (db: DB, table?: string, column?: string, types?: ColConstraint["type"][]) => Promise<ColConstraint[]>;
export {};
//# sourceMappingURL=getColumnDefinitionQuery.d.ts.map
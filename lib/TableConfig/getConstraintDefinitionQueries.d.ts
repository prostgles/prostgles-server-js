import pgPromise from "pg-promise";
import { DB } from "../Prostgles";
import { TableConfig } from "./TableConfig";
type Args = {
    tableName: string;
    tableConf: TableConfig[string];
};
export type ConstraintDef = {
    /**
     * Named constraints are used to show a relevant error message
     */
    name?: string;
    content: string;
    alterQuery: string;
};
export declare const getConstraintDefinitionQueries: ({ tableConf, tableName }: Args) => ConstraintDef[] | undefined;
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
//# sourceMappingURL=getConstraintDefinitionQueries.d.ts.map
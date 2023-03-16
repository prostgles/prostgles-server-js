import { DB } from "../Prostgles";
import { ColumnMinimalInfo } from "./getColumnDefinitionQuery";
import { ColConstraint, ConstraintDef } from "./getConstraintDefinitionQueries";
type Args = {
    db: DB;
    columnDefs: string[];
    tableName: string;
    constraintDefs?: ConstraintDef[];
};
export declare const getFutureTableSchema: ({ columnDefs, tableName, constraintDefs, db }: Args) => Promise<{
    constraints: ColConstraint[];
    cols: ColumnMinimalInfo[];
}>;
export {};
//# sourceMappingURL=getFutureTableSchema.d.ts.map
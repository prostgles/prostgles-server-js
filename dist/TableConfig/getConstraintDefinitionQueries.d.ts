import { TableConfig } from "./TableConfig";
type Args = {
    tableName: string;
    tableConf: TableConfig[string];
};
export declare const getConstraintDefinitionQueries: ({ tableConf, tableName }: Args) => string[] | undefined;
export {};
//# sourceMappingURL=getConstraintDefinitionQueries.d.ts.map
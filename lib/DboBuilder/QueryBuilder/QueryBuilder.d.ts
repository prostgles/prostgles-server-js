import { Filter, LocalParams, SortItem } from "../../DboBuilder";
import { TableRule } from "../../PublishParser";
import { SelectParams, ColumnInfo, PG_COLUMN_UDT_DATA_TYPE, Select, JoinSelect } from "prostgles-types";
import { TableHandler } from "../TableHandler";
import { FieldSpec, FunctionSpec } from "./Functions";
export type SelectItem = {
    type: "column" | "function" | "aggregation" | "joinedColumn" | "computed";
    getFields: (args?: any[]) => string[] | "*";
    getQuery: (tableAlias?: string) => string;
    columnPGDataType?: string;
    column_udt_type?: PG_COLUMN_UDT_DATA_TYPE;
    alias: string;
    selected: boolean;
};
export type SelectItemValidated = SelectItem & {
    fields: string[];
};
export type NewQuery = {
    /**
     * All fields from the table will be in nested SELECT and GROUP BY to allow order/filter by fields not in select
     */
    allFields: string[];
    /**
     * Contains user selection and all the allowed columns. Allowed columns not selected are marked with  selected: false
     */
    select: SelectItem[];
    table: string;
    where: string;
    orderByItems: SortItem[];
    having: string;
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: NewQuery[];
    tableAlias?: string;
    $path?: string[];
};
export declare const asNameAlias: (field: string, tableAlias?: string) => string;
export declare const parseFunctionObject: (funcData: any) => {
    funcName: string;
    args: any[];
};
export declare class SelectItemBuilder {
    select: SelectItemValidated[];
    private allFields;
    private allowedFields;
    private allowedOrderByFields;
    private computedFields;
    private functions;
    private allowedFieldsIncludingComputed;
    private isView;
    private columns;
    constructor(params: {
        allowedFields: string[];
        allowedOrderByFields: string[];
        computedFields: FieldSpec[];
        functions: FunctionSpec[];
        allFields: string[];
        isView: boolean;
        columns: ColumnInfo[];
    });
    private checkField;
    private addItem;
    private addFunction;
    addColumn: (fieldName: string, selected: boolean) => void;
    parseUserSelect: (userSelect: Select, joinParse?: (key: string, val: JoinSelect, throwErr: (msg: string) => any) => any) => Promise<any[]>;
}
export declare function getNewQuery(_this: TableHandler, filter: Filter, selectParams: (SelectParams & {
    alias?: string;
}), param3_unused: any, tableRules: TableRule | undefined, localParams: LocalParams | undefined, columns: ColumnInfo[]): Promise<NewQuery>;
//# sourceMappingURL=QueryBuilder.d.ts.map
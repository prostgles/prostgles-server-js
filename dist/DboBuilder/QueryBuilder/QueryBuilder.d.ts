import { Filter, LocalParams, SortItem } from "../../DboBuilder";
import { TableRule } from "../../PublishParser";
import { ColumnInfo, PG_COLUMN_UDT_DATA_TYPE, Select, JoinSelect } from "prostgles-types";
import { TableHandler } from "../TableHandler";
import { FieldSpec, FunctionSpec } from "./Functions";
import { ViewHandler } from "../ViewHandler";
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
    whereOpts: Awaited<ReturnType<ViewHandler["prepareWhere"]>>;
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
    parseUserSelect: (userSelect: Select, joinParse?: ((key: string, val: JoinSelect, throwErr: (msg: string) => any) => any) | undefined) => Promise<never[] | undefined>;
}
export declare function getNewQuery(_this: TableHandler, filter: Filter, selectParams: ({
    limit?: number | undefined;
    offset?: number | undefined;
    groupBy?: boolean | undefined;
    returnType?: "values" | "value" | "row" | "statement" | undefined;
} & {
    select?: ("" | "*" | {
        "*": 1;
    } | Record<string, Record<string, any>> | import("prostgles-types").DetailedJoinSelect | {
        [x: string]: {
            [x: string]: string | any[] | readonly any[];
        };
    } | ({
        [x: string]: true | 1 | (string | {
            [x: string]: string | any[] | readonly any[];
        });
        $rowhash?: (true | 1 | (string | {
            [x: string]: string | any[] | readonly any[];
        })) | undefined;
    } & Record<string, true | 1 | (string | {
        [x: string]: string | any[] | readonly any[];
    })>) | {
        [x: string]: string | true | 1;
        $rowhash?: string | true | 1 | undefined;
    } | {
        [x: string]: false | 0;
        $rowhash?: false | 0 | undefined;
    } | string[]) | undefined;
    orderBy?: import("prostgles-types")._OrderBy<import("prostgles-types").AnyObject> | undefined;
} & {
    alias?: string | undefined;
}) | undefined, param3_unused: null | undefined, tableRules: TableRule | undefined, localParams: LocalParams | undefined, columns: ColumnInfo[]): Promise<NewQuery>;
//# sourceMappingURL=QueryBuilder.d.ts.map
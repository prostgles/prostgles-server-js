import pgPromise from "pg-promise";
import { AnyObject, DeleteParams, FieldFilter, InsertParams, Select, SelectParams, UpdateParams } from "prostgles-types";
import { DboBuilder, Filter, LocalParams, TableHandlers, TableSchema } from "../DboBuilder";
import { DB } from "../Prostgles";
import { TableRule } from "../PublishParser";
import { insertDataParse } from "./insertDataParse";
import { SelectItem } from "./QueryBuilder/QueryBuilder";
import { JoinPaths, ViewHandler } from "./ViewHandler";
declare type ValidatedParams = {
    row: AnyObject;
    forcedData?: AnyObject;
    allowedFields?: FieldFilter;
    tableRules?: TableRule;
    fixIssues: boolean;
};
export declare class TableHandler extends ViewHandler {
    io_stats: {
        throttle_queries_per_sec: number;
        since: number;
        queries: number;
        batching: string[] | null;
    };
    constructor(db: DB, tableOrViewInfo: TableSchema, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, dbTX?: TableHandlers, joinPaths?: JoinPaths);
    willBatch(query: string): true | undefined;
    updateBatch(data: [Filter, AnyObject][], params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    parseUpdateRules: (filter: Filter, newData: AnyObject, params?: UpdateParams<any> | undefined, tableRules?: TableRule<AnyObject, void> | undefined, localParams?: LocalParams | undefined) => Promise<{
        fields: string[];
        validateRow?: import("../PublishParser").ValidateRow<AnyObject, void> | undefined;
        finalUpdateFilter: AnyObject;
        forcedData?: AnyObject | undefined;
        forcedFilter?: AnyObject | undefined;
        returningFields: FieldFilter<AnyObject>;
        filterFields?: FieldFilter<AnyObject> | undefined;
    }>;
    update: (filter: Filter, _newData: AnyObject, params?: UpdateParams<any> | undefined, tableRules?: TableRule<AnyObject, void> | undefined, localParams?: LocalParams | undefined) => Promise<void | AnyObject>;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues }: ValidatedParams): {
        data: any;
        allowedCols: string[];
    };
    insertDataParse: typeof insertDataParse;
    insert(rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, _localParams?: LocalParams): Promise<any | any[] | boolean>;
    prepareReturning: (returning: Select | undefined, allowedFields: string[]) => Promise<SelectItem[]>;
    makeReturnQuery(items?: SelectItem[]): string;
    delete(filter?: Filter, params?: DeleteParams, param3_unused?: undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    remove(filter: Filter, params?: UpdateParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any>;
    upsert(filter: Filter, newData: AnyObject, params?: UpdateParams, table_rules?: TableRule, localParams?: LocalParams): Promise<any>;
    sync(filter: Filter, params: SelectParams, param3_unused: undefined, table_rules: TableRule, localParams: LocalParams): Promise<{
        channelName: string;
        id_fields: string[];
        synced_field: string;
    }>;
}
export {};
//# sourceMappingURL=TableHandler.d.ts.map
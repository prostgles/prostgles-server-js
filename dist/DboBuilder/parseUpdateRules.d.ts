import { AnyObject, FieldFilter, UpdateParams } from "prostgles-types";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule, ValidateRow } from "../PublishParser";
import { TableHandler } from "./TableHandler";
/**
 * 1) Check if publish is valid
 * 2) Retrieve allowed update cols for a specific request
 */
export declare function parseUpdateRules(this: TableHandler, filter: Filter, newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<{
    fields: string[];
    validateRow?: ValidateRow;
    finalUpdateFilter: AnyObject;
    forcedData?: AnyObject;
    forcedFilter?: AnyObject;
    returningFields: FieldFilter;
    filterFields?: FieldFilter;
}>;
//# sourceMappingURL=parseUpdateRules.d.ts.map
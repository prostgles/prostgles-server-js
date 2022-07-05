import { AnyObject, InsertParams } from "prostgles-types";
import { LocalParams, TableHandler } from "../DboBuilder";
import { TableRule } from "../PublishParser";
/**
 * Used for doing referenced inserts within a single transaction
 */
export declare function insertDataParse(this: TableHandler, data: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, _localParams?: LocalParams): Promise<{
    data?: AnyObject | AnyObject[];
    insertResult?: AnyObject | AnyObject[];
}>;
//# sourceMappingURL=insertDataParse.d.ts.map
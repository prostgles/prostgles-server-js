import { AnyObject, InsertParams } from "prostgles-types";
import { LocalParams, TableHandler } from "../DboBuilder";
import { TableRule } from "../PublishParser";
export declare function insert(this: TableHandler, rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any | any[] | boolean>;
//# sourceMappingURL=insert.d.ts.map
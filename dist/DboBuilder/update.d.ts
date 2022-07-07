import { AnyObject, UpdateParams } from "prostgles-types";
import { Filter, LocalParams, TableHandler } from "../DboBuilder";
import { TableRule } from "../PublishParser";
export declare function update(this: TableHandler, filter: Filter, _newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<AnyObject | void>;
//# sourceMappingURL=update.d.ts.map
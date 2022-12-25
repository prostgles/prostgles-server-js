import { AnyObject, ValidatedColumnInfo } from "prostgles-types";
import { LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { TableHandler } from "./TableHandler";
import { ViewHandler } from "./ViewHandler";
export declare const isTableHandler: (v: any) => v is TableHandler;
export declare function getColumns(this: ViewHandler, lang?: string, params?: {
    rule: "update";
    filter: AnyObject;
    data: AnyObject;
}, _param3?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<ValidatedColumnInfo[]>;
//# sourceMappingURL=getColumns.d.ts.map
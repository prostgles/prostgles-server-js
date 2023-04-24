import { SelectParams } from "prostgles-types";
import { Filter, LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { TableHandler } from "./TableHandler";
import { ViewHandler } from "./ViewHandler";
export declare const find: (this: ViewHandler, filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams) => Promise<any[]>;
export declare const runQueryReturnType: (query: string, returnType: SelectParams["returnType"], handler: ViewHandler | TableHandler, localParams: LocalParams | undefined) => Promise<any>;
//# sourceMappingURL=find.d.ts.map
import { LocalParams } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { SelectItem } from "./QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler";
/**
 * parses a single filter
 * @example
 *  { fff: 2 } => "fff" = 2
 *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
 */
export declare function getCondition(this: ViewHandler, params: {
    filter: any;
    select?: SelectItem[];
    allowed_colnames: string[];
    tableAlias?: string;
    localParams?: LocalParams;
    tableRules?: TableRule;
}): Promise<string>;
//# sourceMappingURL=getCondition.d.ts.map
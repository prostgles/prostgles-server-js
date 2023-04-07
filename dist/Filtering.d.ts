import { SelectItem } from "./DboBuilder/QueryBuilder/QueryBuilder";
import { FullFilter } from "prostgles-types";
/**
* Parse a single filter
* Ensure only single key objects reach this point
*/
type ParseFilterItemArgs = {
    filter: FullFilter<void, void>;
    select?: SelectItem[];
    tableAlias?: string;
    pgp: any;
};
export declare const parseFilterItem: (args: ParseFilterItemArgs) => string;
export {};
//# sourceMappingURL=Filtering.d.ts.map
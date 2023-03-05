import { SelectParams } from "prostgles-types";
import { NewQuery } from "./QueryBuilder";
import { TableHandler } from "../TableHandler";
/**
 * Creating the text query from the NewQuery spec
 * No validation/authorisation at this point */
export declare function makeSelectQuery(_this: TableHandler, q: NewQuery, depth?: number, joinFields?: string[], selectParams?: SelectParams): string;
//# sourceMappingURL=makeSelectQuery.d.ts.map
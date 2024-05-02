import { AnyObject, isObject } from "prostgles-types";
import { FILTER_OPERANDS, FILTER_OPERAND_TO_SQL_OPERAND, parseFilterRightValue } from "../../Filtering";
import { FUNCTIONS, parseFunction } from "../QueryBuilder/Functions";
import { asNameAlias, parseFunctionObject } from "../QueryBuilder/QueryBuilder";
import { TableSchemaColumn } from "../DboBuilderTypes";
import { asValue } from "../../PubSubManager/PubSubManager";

const allowedComparators = FILTER_OPERANDS; //[">", "<", "=", "<=", ">=", "<>", "!="]
type Args = {
  filter: AnyObject;
  complexFilterKey: string;
  tableAlias: string | undefined;
  allowed_colnames: string[];
  columns: TableSchemaColumn[];
}

/* Parse complex filters
  { 
    $filter: [
      { $func: [...] }, 
      "=", 
      value | { $func: [..] }
    ] 
  } 
*/
export const parseComplexFilter = ({
  filter,
  complexFilterKey,
  tableAlias,
  allowed_colnames,
  columns,
}: Args) => {

  /**
   * { $funcName: [arg1, arg2] }
   * { $column: "column_name" }
   */
  const getFuncQuery = (funcData: AnyObject): string => {
    if(isObject(funcData) && "$column" in funcData){
      const column = funcData["$column"]
      if(typeof column !== "string"){
        throw `expecting: \n  { $column: "column_name" } received:\n ${JSON.stringify(funcData)}`;
      }
      if(!allowed_colnames.includes(column)){
        throw `Dissallowed or Invalid column ${column}. Allowed columns: ${allowed_colnames}`;
      }
      return asNameAlias(column, tableAlias)
    }
    const { funcName, args } = parseFunctionObject(funcData);
    const funcDef = parseFunction({ func: funcName, args, functions: FUNCTIONS, allowedFields: allowed_colnames });
    return funcDef.getQuery({ args, tableAlias, allColumns: columns, allowedFields: allowed_colnames });
  }

  const complexFilter = filter[complexFilterKey];
  if (!Array.isArray(complexFilter)) {
    throw `Invalid $filter. Must contain an array of at least element but got: ${JSON.stringify(complexFilter)} `
  } 
  const [leftFilter, comparator, rightFilterOrValue] = complexFilter;

  const leftVal = getFuncQuery(leftFilter);
  let result = leftVal;
  if (comparator) {
    if (typeof comparator !== "string" || !allowedComparators.includes(comparator as any)) {
      throw `Invalid $filter. comparator ${JSON.stringify(comparator)} is not valid. Expecting one of: ${allowedComparators}`;
    }
    if (!rightFilterOrValue) {
      throw "Invalid $filter. Expecting a value or function after the comparator";
    }
    const maybeValidComparator = comparator as keyof typeof FILTER_OPERAND_TO_SQL_OPERAND;
    const sqlOperand = FILTER_OPERAND_TO_SQL_OPERAND[maybeValidComparator];
    if(!sqlOperand){
      throw `Invalid $filter. comparator ${comparator} is not valid. Expecting one of: ${allowedComparators}`;
    }

    let rightVal = isObject(rightFilterOrValue) ? 
      getFuncQuery(rightFilterOrValue) : 
      parseFilterRightValue(rightFilterOrValue, {
        selectItem: undefined, 
        expect: ["$in", "$nin"].includes(comparator)? "csv" : undefined 
      });
    if(maybeValidComparator === "$between" || maybeValidComparator === "$notBetween"){
      
      if(!Array.isArray(rightVal) || rightVal.length !== 2){
        throw "Between filter expects an array of two values";
      }
      rightVal = asValue(rightVal[0]) + " AND " + asValue(rightVal[1]);
    }
    if (leftVal === rightVal){ 
      throw "Invalid $filter. Cannot compare two identical function signatures: " + JSON.stringify(leftFilter);
    }
      
    result += ` ${sqlOperand} ${rightVal}`;
  }

  return result;
}
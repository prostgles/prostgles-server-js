import { AnyObject, InsertParams, isObject } from "prostgles-types";
import { LocalParams, parseError, withUserRLS } from "../../DboBuilder";
import { TableRule } from "../../PublishParser/PublishParser";
import { insertDataParse } from "../insertDataParse";
import { insertTest } from "./insertTest";
import { TableHandler } from "./TableHandler";
import { runInsertUpdateQuery } from "./runInsertUpdateQuery";

export async function insert(this: TableHandler, rowOrRows: AnyObject | AnyObject[] = {}, insertParams?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any | any[] | boolean> {
  
  const ACTION = "insert";
  try {
    await this._log({ command: "insert", localParams, data: { rowOrRows, param2: insertParams } });

    const { fixIssues = false } = insertParams || {};
    const { returnQuery = false, nestedInsert } = localParams || {};
 
    const finalDBtx = this.getFinalDBtx(localParams);
    const rule = tableRules?.[ACTION];
    const { postValidate, checkFilter, validate, allowedNestedInserts } = rule ?? {};

    /** Post validate and checkFilter require a transaction dbo handler because they happen after the insert */
    if(postValidate || checkFilter){
      if(!finalDBtx){
        return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(rowOrRows, insertParams, param3_unused, tableRules, localParams))
      }
    }

    const { testOnly, fields, forcedData, returningFields } = await insertTest.bind(this)({ tableRules, localParams });
    if(testOnly){
      return true;
    }

    if(allowedNestedInserts){
      if(!nestedInsert || !allowedNestedInserts.some(ai => ai.table === nestedInsert?.previousTable && ai.column === nestedInsert.referencingColumn)){
        throw `Direct inserts not allowed. Only nested inserts from these tables: ${JSON.stringify(allowedNestedInserts)} `
      }
    }
    const { conflict_query } = validateInsertParams(insertParams);


    /**
     * If media it will: upload file and continue insert
     * If nested insert it will: make separate inserts and not continue main insert
     */
    const mediaOrNestedInsert = await insertDataParse.bind(this)(rowOrRows, insertParams, param3_unused, tableRules, localParams);
    const { data, insertResult } = mediaOrNestedInsert;
    if ("insertResult" in mediaOrNestedInsert) {
      return insertResult;
    }

    const getInsertQuery = async (_rows: AnyObject[]) => {
      const validatedData = await Promise.all(_rows.map(async _row => {

        const row = { ..._row };

        if (!isObject(row)) {
          console.trace(row)
          throw "\ninvalid insert data provided -> " + JSON.stringify(row);
        }
  
        const { data: validatedRow, allowedCols } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
        return { validatedRow, allowedCols };
      }));
      const validatedRows = validatedData.map(d => d.validatedRow);
      const allowedCols = Array.from( new Set(validatedData.flatMap(d => d.allowedCols)));
      const dbTx = finalDBtx || this.dboBuilder.dbo
      const query = await this.colSet.getInsertQuery(validatedRows, allowedCols, dbTx, validate, localParams);
      return query + conflict_query;
    };
    
    let query = ""; 
    if (Array.isArray(data)) {

      if(!data.length){
        throw "Empty insert. Provide data";
      }

      query = await getInsertQuery(data); 
    } else {
      query = await getInsertQuery([data ?? {}]); 
    }

    const queryWithoutUserRLS = query;
    const queryWithRLS = withUserRLS(localParams, query);
    if (returnQuery) return queryWithRLS;

    if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
      console.log(this.tx?.t.ctx?.start, "insert in " + this.name, data);
    }

    return runInsertUpdateQuery({
      rule, localParams, 
      queryWithoutUserRLS, 
      tableHandler: this, 
      returningFields, 
      data: rowOrRows,
      fields,
      params: insertParams,
      type: "insert",
    });
    
  } catch (e) {
    if (localParams?.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.${ACTION}()`)
  }
} 

const validateInsertParams = (params: InsertParams | undefined) => {

  const { onConflictDoNothing, returnType, returning } = params ?? {};
  let conflict_query = "";
  if (typeof onConflictDoNothing === "boolean" && onConflictDoNothing) {
    conflict_query = " ON CONFLICT DO NOTHING ";
  }

  const allowedReturnTypes: InsertParams["returnType"][] = ["row", "value", "values", "statement", undefined]
  if(!allowedReturnTypes.includes(returnType)){
    throw `Invalid return type ${returnType}. Expecting one of: ${allowedReturnTypes}`
  }

  if(returnType && returnType !== "statement" && !returning){
    throw `Must specify returning when using a non statement returnType: ${returnType}`;
  }

  if (params) {
    const good_paramsObj: Record<keyof InsertParams, 1> = { returning: 1, returnType: 1, fixIssues: 1, onConflictDoNothing: 1 };
    const good_params = Object.keys(good_paramsObj);
    const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
    if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
  }

  return { conflict_query }

}

// const removeBuffers = (o: any) => {
//   if(isPlainObject(o)){
//     return JSON.stringify(getKeys(o).reduce((a, k) => {
//       const value = o[k]
//       return { ...a, [k]: Buffer.isBuffer(value)? `Buffer[${value.byteLength}][...REMOVED]` : value 
//     }
//   }, {}));
//   }
// }
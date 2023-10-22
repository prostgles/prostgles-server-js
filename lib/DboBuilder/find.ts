
import { SelectParams, isObject } from "prostgles-types";
import { Filter, LocalParams, makeErrorFromPGError, parseError, withUserRLS } from "../DboBuilder";
import { canRunSQL } from "../DboBuilder/runSQL";
import { TableRule } from "../PublishParser";
import { getNewQuery } from "./QueryBuilder/getNewQuery";
import { getSelectQuery } from "./QueryBuilder/getSelectQuery";
import { TableHandler } from "./TableHandler/TableHandler";
import { ViewHandler } from "./ViewHandler/ViewHandler";
import { NewQuery } from "./QueryBuilder/QueryBuilder";

export const find = async function(this: ViewHandler, filter?: Filter, selectParams?: SelectParams, _?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any[]> {
  try {
    await this._log({ command: "find", localParams, data: { filter, selectParams } });
    filter = filter || {};
    const allowedReturnTypes = Object.keys({ row: 1, statement: 1, value: 1, values: 1, "statement-no-rls": 1, "statement-where": 1 } satisfies Record<Required<SelectParams>["returnType"], 1>);
    const { returnType } = selectParams || {};
    if (returnType && !allowedReturnTypes.includes(returnType)) {
      throw `returnType (${returnType}) can only be ${allowedReturnTypes.join(" OR ")}`
    }

    const { testRule = false } = localParams || {};

    if (testRule) return [];
    if (selectParams) {
      const good_params = Object.keys({ 
        "select": 1, "orderBy": 1, "offset": 1, "limit": 1, "returnType": 1, "groupBy": 1 
      } satisfies Record<keyof SelectParams, 1>);
      
      const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k as any));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    /* Validate publish */
    if (tableRules) { 

      if (!tableRules.select) throw "select rules missing for " + this.name;
      const fields = tableRules.select.fields; 
      const maxLimit = tableRules.select.maxLimit;

      if (<any>tableRules.select !== "*" && typeof tableRules.select !== "boolean" && !isObject(tableRules.select)) throw `\nINVALID publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`
      if (!fields) throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;
      if (maxLimit && !Number.isInteger(maxLimit)) throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;
    }

    const _selectParams = selectParams ?? {}
    const selectParamsLimitCheck = localParams?.bypassLimit && !Number.isFinite(_selectParams.limit)? { ..._selectParams, limit: null } : { limit: 1000, ..._selectParams }
    const newQuery = await getNewQuery(
      this, 
      filter, 
      selectParamsLimitCheck, 
      _, 
      tableRules, 
      localParams, 
    );

    const queryWithoutRLS = getSelectQuery(
      this, 
      newQuery, 
      undefined, 
      !!selectParamsLimitCheck?.groupBy
    );

    const queryWithRLS = withUserRLS(localParams, queryWithoutRLS);
    if (testRule) {
      try {
        await this.db.any(withUserRLS(localParams, "EXPLAIN " + queryWithRLS));
        return [];
      } catch (e) {
        console.error(e);
        throw `INTERNAL ERROR: Publish config is not valid for publish.${this.name}.select `
      }
    }

    /** Used for subscribe  */
    if(localParams?.returnNewQuery) return (newQuery as unknown as any);
    if (localParams?.returnQuery) {
      if(localParams?.returnQuery === "where-condition"){
        return newQuery.whereOpts.condition as any;
      }
      return ((localParams?.returnQuery === "noRLS"? queryWithoutRLS : queryWithRLS) as unknown as any[]);
    }

    return runQueryReturnType({ 
      queryWithoutRLS, 
      queryWithRLS, 
      returnType, 
      handler: this, 
      localParams,
      newQuery,
    });

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.find()`);
  }
}

type RunQueryReturnTypeArgs = {
  queryWithRLS: string;
  queryWithoutRLS: string;
  returnType: SelectParams["returnType"]; 
  handler: ViewHandler | TableHandler; 
  localParams: LocalParams | undefined;
  newQuery: NewQuery | undefined;
};

export const runQueryReturnType = async ({ newQuery, handler, localParams, queryWithRLS, queryWithoutRLS, returnType,}: RunQueryReturnTypeArgs) => {

  const query = queryWithRLS;
  const sqlTypes = ["statement", "statement-no-rls", "statement-where"];
  if(!returnType || returnType === "values"){

    return handler.dbHandler.any(query).then(data => {
      if (returnType === "values") {
        return data.map(d => Object.values(d)[0]);
      }
      return data;
    }).catch(err => makeErrorFromPGError(err, localParams, this));

  } else if (sqlTypes.some(v => v === returnType)) {
    if (!(await canRunSQL(handler.dboBuilder.prostgles, localParams))) {
      throw `Not allowed:  {returnType: ${JSON.stringify(returnType)}} requires execute sql privileges `
    }
    if(returnType === "statement-no-rls"){
      return queryWithoutRLS as any;
    }
    if(returnType === "statement-where"){
      if(!newQuery) throw `returnType ${returnType} not possible for this command type`;
      return newQuery.whereOpts.condition as any;
    }
    return query as unknown as any[];

  } else if (["row", "value"].includes(returnType)) {
    return handler.dbHandler.oneOrNone(query).then(data => {
      return (data && returnType === "value") ? Object.values(data)[0] : data;
    }).catch(err => makeErrorFromPGError(err, localParams, this));
  }
}
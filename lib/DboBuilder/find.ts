
import { SelectParams, isObject } from "prostgles-types";
import { Filter, LocalParams, makeErrorFromPGError, parseError, withUserRLS } from "../DboBuilder";
import { getSelectQuery } from "./QueryBuilder/getSelectQuery";
import { canRunSQL } from "../DboBuilder/runSQL";
import { TableRule } from "../PublishParser";
import { TableHandler } from "./TableHandler";
import { getNewQuery } from "./QueryBuilder/getNewQuery";
import { ViewHandler } from "./ViewHandler/ViewHandler";

export const find = async function(this: ViewHandler, filter?: Filter, selectParams?: SelectParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any[]> {
  try {
    await this._log({ command: "find", localParams, data: { filter, selectParams } });
    filter = filter || {};
    const allowedReturnTypes: Array<SelectParams["returnType"]> = ["row", "value", "values", "statement"]
    const { returnType } = selectParams || {};
    if (returnType && !allowedReturnTypes.includes(returnType)) {
      throw `returnType (${returnType}) can only be ${allowedReturnTypes.join(" OR ")}`
    }

    const { testRule = false, returnQuery = false, returnNewQuery } = localParams || {};

    if (testRule) return [];
    if (selectParams) {
      const good_params: Array<keyof SelectParams> = ["select", "orderBy", "offset", "limit", "returnType", "groupBy"];
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

    const q = await getNewQuery(
      this as unknown as TableHandler, 
      filter, 
      selectParams, 
      param3_unused, 
      tableRules, 
      localParams, 
    );

    const queryWithoutRLS = getSelectQuery(
      this, 
      q, 
      undefined, 
      !!selectParams?.groupBy
    );

    const queryWithRLS = withUserRLS(localParams, queryWithoutRLS);
    // console.log(_query, JSON.stringify(q, null, 2))
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
    if(returnNewQuery) return (q as unknown as any);
    if (returnQuery) {
      return ((returnQuery === "noRLS"? queryWithoutRLS : queryWithRLS) as unknown as any[]);
    }

    return runQueryReturnType(queryWithRLS, returnType, this, localParams);

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.find()`);
  }
}


export const runQueryReturnType = async (query: string, returnType: SelectParams["returnType"], handler: ViewHandler | TableHandler, localParams: LocalParams | undefined) => {

  if (returnType === "statement") {
    if (!(await canRunSQL(handler.dboBuilder.prostgles, localParams))) {
      throw `Not allowed:  {returnType: "statement"} requires sql privileges `
    }
    return query as unknown as any[];

  } else if (["row", "value"].includes(returnType!)) {
    return (handler.t || handler.db).oneOrNone(query).then(data => {
      return (data && returnType === "value") ? Object.values(data)[0] : data;
    }).catch(err => makeErrorFromPGError(err, localParams, this));
  } else {
    return (handler.t || handler.db).any(query).then(data => {
      if (returnType === "values") {
        return data.map(d => Object.values(d)[0]);
      }
      return data;
    }).catch(err => makeErrorFromPGError(err, localParams, this));
  }
}
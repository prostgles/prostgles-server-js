import type { SelectParams} from "prostgles-types";
import { isObject } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type {
  Filter,
  LocalParams} from "../DboBuilder";
import {
  getClientErrorFromPGError,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../DboBuilder";
import { getNewQuery } from "../QueryBuilder/getNewQuery";
import { getSelectQuery } from "../QueryBuilder/getSelectQuery";
import type { NewQuery } from "../QueryBuilder/QueryBuilder";
import { canRunSQL } from "../runSQL";
import type { TableHandler } from "../TableHandler/TableHandler";
import type { ViewHandler } from "./ViewHandler";

export const find = async function (
  this: ViewHandler,
  filter?: Filter,
  selectParams?: SelectParams,
  _?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams
): Promise<any[]> {
  const start = Date.now();
  const command =
    selectParams?.limit === 1 && selectParams.returnType === "row" ? "findOne" : "find";
  try {
    filter = filter || {};
    const allowedReturnTypes = Object.keys({
      row: 1,
      statement: 1,
      value: 1,
      values: 1,
      "statement-no-rls": 1,
      "statement-where": 1,
    } satisfies Record<Required<SelectParams>["returnType"], 1>);

    const { returnType } = selectParams || {};
    if (returnType && !allowedReturnTypes.includes(returnType)) {
      throw `returnType (${returnType}) can only be ${allowedReturnTypes.join(" OR ")}`;
    }

    const { testRule = false } = localParams || {};

    if (testRule) return [];
    if (selectParams) {
      const validParamNames = Object.keys({
        select: 1,
        orderBy: 1,
        offset: 1,
        limit: 1,
        returnType: 1,
        groupBy: 1,
        having: 1,
      } satisfies Record<keyof SelectParams, 1>);

      const invalidParams = Object.keys(selectParams).filter((k) => !validParamNames.includes(k));
      if (invalidParams.length)
        throw (
          "Invalid params: " +
          invalidParams.join(", ") +
          " \n Expecting: " +
          validParamNames.join(", ")
        );
    }

    /* Validate publish */
    if (tableRules) {
      if (!tableRules.select) throw "select rules missing for " + this.name;
      const fields = tableRules.select.fields;
      const maxLimit = tableRules.select.maxLimit;

      if (
        <any>tableRules.select !== "*" &&
        typeof tableRules.select !== "boolean" &&
        !isObject(tableRules.select)
      ) {
        throw `\nInvalid publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`;
      }
      if (!fields) {
        throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;
      }
      if (maxLimit && !Number.isInteger(maxLimit)) {
        throw (
          ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit
        );
      }
    }

    const _selectParams = selectParams ?? {};
    const selectParamsLimitCheck =
      localParams?.bypassLimit && !Number.isFinite(_selectParams.limit) ?
        { ..._selectParams, limit: null }
      : { limit: 1000, ..._selectParams };
    const newQuery = await getNewQuery(
      this,
      filter,
      selectParamsLimitCheck,
      _,
      tableRules,
      localParams
    );

    const queryWithoutRLS = getSelectQuery(
      this,
      newQuery,
      undefined,
      !!selectParamsLimitCheck.groupBy
    );

    const queryWithRLS = withUserRLS(localParams, queryWithoutRLS);
    // THIS HANGS TESTS
    // if (testRule) {
    //   try {
    //     await this.db.any(withUserRLS(localParams, "EXPLAIN " + queryWithRLS));
    //     return [];
    //   } catch (e) {
    //     console.error(e);
    //     throw `Internal error: publish config is not valid for publish.${this.name}.select `;
    //   }
    // }

    /** Used for subscribe  */
    if (localParams?.returnNewQuery) return newQuery as unknown as any;
    if (localParams?.returnQuery) {
      if (localParams.returnQuery === "where-condition") {
        return newQuery.whereOpts.condition as any;
      }
      return (localParams.returnQuery === "noRLS" ?
        queryWithoutRLS
      : queryWithRLS) as unknown as any[];
    }

    const result = await runQueryReturnType({
      queryWithoutRLS,
      queryWithRLS,
      returnType,
      handler: this,
      localParams,
      newQuery,
    });

    await this._log({
      command,
      localParams,
      data: { filter, selectParams },
      duration: Date.now() - start,
    });
    return result;
  } catch (e) {
    await this._log({
      command,
      localParams,
      data: { filter, selectParams },
      duration: Date.now() - start,
      error: getErrorAsObject(e),
    });
    throw getSerializedClientErrorFromPGError(e, {
      type: "tableMethod",
      localParams,
      view: this,
    });
  }
};

type RunQueryReturnTypeArgs = {
  queryWithRLS: string;
  queryWithoutRLS: string;
  returnType: SelectParams["returnType"];
  handler: ViewHandler | TableHandler;
  localParams: LocalParams | undefined;
  newQuery: NewQuery | undefined;
};

export const runQueryReturnType = async ({
  newQuery,
  handler,
  localParams,
  queryWithRLS,
  queryWithoutRLS,
  returnType,
}: RunQueryReturnTypeArgs) => {
  const query = queryWithRLS;
  const sqlTypes = ["statement", "statement-no-rls", "statement-where"] as const;
  if (!returnType || returnType === "values") {
    return handler.dbHandler
      .any(query)
      .then((data) => {
        if (returnType === "values") {
          return data.map((d) => Object.values(d)[0]);
        }
        return data;
      })
      .catch((err) =>
        getClientErrorFromPGError(err, {
          type: "tableMethod",
          localParams,
          view: handler,
        })
      );
  } else if (sqlTypes.some((v) => v === returnType)) {
    if (!(await canRunSQL(handler.dboBuilder.prostgles, localParams?.clientReq))) {
      throw `Not allowed:  { returnType: ${JSON.stringify(returnType)} } requires execute sql privileges `;
    }
    if (returnType === "statement-no-rls") {
      return queryWithoutRLS as any;
    }
    if (returnType === "statement-where") {
      if (!newQuery) throw `returnType ${returnType} not possible for this command type`;
      return newQuery.whereOpts.condition as any;
    }
    return query as unknown as any[];
  } else if (["row", "value"].includes(returnType)) {
    return handler.dbHandler
      .oneOrNone(query)
      .then((data) => {
        return data && returnType === "value" ? Object.values(data)[0] : data;
      })
      .catch((err) =>
        getClientErrorFromPGError(err, {
          type: "tableMethod",
          localParams,
          view: handler,
        })
      );
  }
};

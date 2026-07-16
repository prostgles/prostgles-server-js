import type { AnyObject, SelectParams } from "prostgles-types";
import { isObject } from "prostgles-types";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Filter, LocalParams } from "../DboBuilder";
import {
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  rejectWithPGClientError,
  withUserRLS,
} from "../DboBuilder";
import { getNewQuery } from "../QueryBuilder/getNewQuery";
import { getSelectQuery } from "../QueryBuilder/getSelectQuery";
import { getReturnTypeQuery } from "./getReturnTypeQuery";
import type { ViewHandler } from "./ViewHandler";

export const find = async function (
  this: ViewHandler,
  filter?: Filter,
  selectParams?: SelectParams,
  _?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
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
      localParams,
    );

    const queryWithoutRLS = getSelectQuery(
      this,
      newQuery,
      undefined,
      !!selectParamsLimitCheck.groupBy,
    );

    const queryWithRLS = withUserRLS(localParams, queryWithoutRLS);
    const queryToReturn = await getReturnTypeQuery({
      handler: this,
      localParams,
      queryWithoutRLS,
      queryWithRLS,
      returnType,
      newQuery,
    });
    if (queryToReturn) {
      return queryToReturn as unknown[];
    }

    const query = queryWithRLS;
    const isOneOrNone = returnType === "row" || returnType === "value";
    const queryPromise =
      isOneOrNone ?
        this.db.oneOrNone<AnyObject>(query).then((data) => (data ? [data] : []))
      : this.db.any<AnyObject>(query);

    const parsedResult = await queryPromise
      .then((rows) => {
        if (returnType === "values" || returnType === "value") {
          return rows.map((d) => Object.values(d)[0]);
        }

        return rows;
      })
      .catch((err) =>
        rejectWithPGClientError(err, {
          type: "tableMethod",
          localParams,
          view: this,
          prostgles: this.dboBuilder.prostgles,
        }),
      );

    await this._log({
      command,
      localParams,
      data: { filter, selectParams },
      duration: Date.now() - start,
    });

    return isOneOrNone ? parsedResult[0] : parsedResult;
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
      prostgles: this.dboBuilder.prostgles,
    });
  }
};

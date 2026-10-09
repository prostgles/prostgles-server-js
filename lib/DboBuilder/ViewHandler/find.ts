import type { AnyObject, DBSchema, SelectParams } from "prostgles-types";
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
import { validateSelectParams } from "./validateSelectParams";
import type { ViewHandler } from "./ViewHandler";
import { getDbHandlerWithAbort } from "./getDbHandlerWithAbort";

export type Param3 = {
  abortSignalId?: string;
};

export type ServerSelectParams<
  T extends AnyObject | void = void,
  S extends DBSchema | void = void,
> = SelectParams<T, S> & {
  /**
   * Lock this table's matching rows until the transaction ends. Requires a transaction.
   * Views, aggregations, groupBy, and OR joins are not supported.
   */
  forUpdate?: boolean;
};

export const find = async function (
  this: ViewHandler,
  filter: Filter = {},
  selectParams?: ServerSelectParams,
  param3?: Param3,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<any[]> {
  const start = Date.now();
  const { limit, returnType, abortSignal } = selectParams ?? {};

  const command = limit === 1 && returnType === "row" ? "findOne" : "find";
  try {
    validateSelectParams(selectParams);
    if (selectParams?.forUpdate) {
      if (!this.getTransaction(localParams)) throw new Error("forUpdate requires a transaction");
      if (this.isView) throw new Error("forUpdate is only supported on tables");
    }

    const { returnType } = selectParams || {};

    const { testRule = false } = localParams || {};

    if (testRule) return [];

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
      tableRules,
      localParams,
    );

    const queryWithoutRLS = getSelectQuery(
      this,
      newQuery,
      undefined,
      !!selectParamsLimitCheck.groupBy,
      selectParams?.forUpdate,
    );

    const queryWithRLS = withUserRLS(
      localParams,
      queryWithoutRLS,
      !!this.getTransaction(localParams),
    );

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
    const dbHandler = getDbHandlerWithAbort(this, localParams, {
      abortSignal,
      abortSignalId: param3?.abortSignalId,
    });
    const queryPromise =
      isOneOrNone ?
        dbHandler.oneOrNone<AnyObject>(query).then((data) => (data ? [data] : []))
      : dbHandler.any<AnyObject>(query);

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

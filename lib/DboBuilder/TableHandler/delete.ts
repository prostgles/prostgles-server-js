import type pgPromise from "pg-promise";
import { includes, type AnyObject, type DeleteParams, type FieldFilter } from "prostgles-types";
import type { DeleteRule, ParsedTableRule } from "../../PublishParser/PublishParser";
import type { Filter, LocalParams } from "../DboBuilder";
import {
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  rejectWithPGClientError,
  withUserRLS,
} from "../DboBuilder";
import type { TableHandler } from "./TableHandler";
import { onDeleteFromFileTable } from "./onDeleteFromFileTable";
import { getReturnTypeQuery } from "../ViewHandler/getReturnTypeQuery";
import { executeAfterHooksCheckAndPostValidation } from "./executeAfterHooksCheckAndPostValidation";

export async function _delete(
  this: TableHandler,
  filter?: Filter,
  params?: DeleteParams,
  param3_unused?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams,
): Promise<any> {
  const start = Date.now();
  try {
    const { returning } = params || {};
    filter = filter || {};
    this.checkFilter(filter);

    const operation = { name: "delete", rule: tableRules?.delete } as const;
    const { hasAfterChecks, shouldWrap } = this.shouldWrapInTx(operation, localParams, []);
    if (shouldWrap) {
      return this.dboBuilder.getTX((t) =>
        (t[this.name] as Partial<typeof this> | undefined)?.delete?.(
          filter,
          params,
          param3_unused,
          tableRules,
          localParams,
        ),
      );
    }

    let forcedFilter: AnyObject | undefined = {},
      filterFields: FieldFilter | undefined = "*",
      returningFields: FieldFilter | undefined = "*",
      validate: DeleteRule["validate"];

    const { testRule = false } = localParams || {};
    if (tableRules) {
      if (!tableRules.delete) throw "delete rules missing";
      forcedFilter = tableRules.delete.forcedFilter;
      filterFields = tableRules.delete.filterFields;
      returningFields = tableRules.delete.returningFields;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      validate = tableRules.delete.validate;

      if (!returningFields) returningFields = tableRules.select?.fields;
      if (!returningFields) returningFields = tableRules.delete.filterFields;

      if (!filterFields) throw ` Invalid delete rule for ${this.name}. filterFields missing `;

      /* Safely test publish rules */
      if (testRule) {
        await this.validateViewRules({
          filterFields,
          returningFields,
          forcedFilter,
          rule: "delete",
        });
        return true;
      }
    }

    if (params) {
      const good_paramsObj: Record<keyof DeleteParams, 1> = {
        returning: 1,
        returnType: 1,
      };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(params).filter((k) => !good_params.includes(k));
      if (bad_params.length)
        throw (
          "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ")
        );
    }

    let queryType: keyof pgPromise.ITask<{}> = "none";
    let queryWithoutRLS = `DELETE FROM ${this.escapedName} `;
    const filterOpts = await this.prepareWhere({
      select: undefined,
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules,
    });
    queryWithoutRLS += filterOpts.where;
    await validate?.(filterOpts.filter);

    const FULL_ROW_KEY = "_prostgles_full_row" as const;
    const fullRowReturning =
      hasAfterChecks ? `to_jsonb(${this.escapedName}) as ${FULL_ROW_KEY}` : undefined;
    let returningQuery = "";
    if (returning !== undefined) {
      queryType = "any";
      if (!returningFields) {
        throw "Returning disallowed";
      }
      returningQuery = this.makeReturnQuery(
        await this.prepareReturning(returning, this.parseFieldFilter(returningFields)),
      );
      if (hasAfterChecks) {
        returningQuery += `, ${fullRowReturning}`;
      }
      queryWithoutRLS += returningQuery;
    } else if (hasAfterChecks) {
      queryWithoutRLS += ` RETURNING ${fullRowReturning}`;
    }

    // TODO - delete orphaned files
    // if(this.dboBuilder.prostgles.opts.fileTable?.referencedTables?.[this.name]?.referenceColumns){
    //   if(!this.getFinalDBtx(localParams)){
    //     const ACTION = "delete";
    //     return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(filter, params, param3_unused, tableRules, localParams))
    //   }
    // }

    const queryWithRLS = withUserRLS(localParams, queryWithoutRLS);

    const queryToReturn = await getReturnTypeQuery({
      handler: this,
      localParams,
      queryWithoutRLS,
      queryWithRLS,
      returnType: params?.returnType,
      newQuery: undefined,
    });
    if (queryToReturn) {
      return queryToReturn as unknown[];
    }

    const transaction = this.getTransaction(localParams);
    const dbHandler = transaction?.t ?? this.db;

    const isOneOrNone = includes(["row", "value"], params?.returnType);
    const queryPromise = () =>
      isOneOrNone ?
        dbHandler.oneOrNone<AnyObject>(queryWithRLS).then((data) => (data ? [data] : []))
      : dbHandler.any<AnyObject>(queryWithRLS);

    const onInsteadOfDelete = this.config?.hooks?.onInsteadOfDelete;
    if (onInsteadOfDelete) {
      if (!transaction) {
        throw new Error(
          "onInsteadOfDelete requires a transaction. Please wrap the delete call in a transaction.",
        );
      }
      const result = await onInsteadOfDelete({
        queryType,
        isOneOrNone,
        dbx: transaction.dbTX,
        tx: transaction.t,
        returningQuery,
        filterOpts,
      });

      await this._log({
        command: "delete",
        localParams,
        data: { filter, params },
        duration: Date.now() - start,
      });
      return result;
    }
    const deletedRows = await queryPromise().catch((err) =>
      rejectWithPGClientError(err, {
        type: "tableMethod",
        localParams,
        view: this,
        prostgles: this.dboBuilder.prostgles,
      }),
    );

    if (hasAfterChecks) {
      const fullRows = deletedRows.map((d) => {
        const fullRow = d[FULL_ROW_KEY] as AnyObject | undefined;
        if (!fullRow) throw "Missing full row for after checks";
        return fullRow;
      });

      await executeAfterHooksCheckAndPostValidation({
        tableHandler: this,
        operation,
        localParams,
        rows: fullRows,
        data: [],
      });
    }

    const originalReturnRows = deletedRows.map(
      ({ [FULL_ROW_KEY]: _, ...originalReturn }) => originalReturn,
    );

    await this._log({
      command: "delete",
      localParams,
      data: { filter, params },
      duration: Date.now() - start,
    });
    return isOneOrNone ? originalReturnRows[0] : originalReturnRows;
  } catch (e) {
    await this._log({
      command: "delete",
      localParams,
      data: { filter, params },
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
}

import pgPromise from "pg-promise";
import { AnyObject, DeleteParams, FieldFilter } from "prostgles-types";
import { DeleteRule, ParsedTableRule } from "../../PublishParser/PublishParser";
import {
  Filter,
  LocalParams,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../DboBuilder";
import { runQueryReturnType } from "../ViewHandler/find";
import { TableHandler } from "./TableHandler";
import { onDeleteFromFileTable } from "./onDeleteFromFileTable";

export async function _delete(
  this: TableHandler,
  filter?: Filter,
  params?: DeleteParams,
  param3_unused?: undefined,
  tableRules?: ParsedTableRule,
  localParams?: LocalParams
): Promise<any> {
  const start = Date.now();
  try {
    const { returning } = params || {};
    filter = filter || {};
    this.checkFilter(filter);

    let forcedFilter: AnyObject | undefined = {},
      filterFields: FieldFilter | undefined = "*",
      returningFields: FieldFilter | undefined = "*",
      validate: DeleteRule["validate"];

    const { testRule = false, returnQuery = false } = localParams || {};
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

    let returningQuery = "";
    if (returning) {
      queryType = "any";
      if (!returningFields) {
        throw "Returning dissallowed";
      }
      returningQuery = this.makeReturnQuery(
        await this.prepareReturning(returning, this.parseFieldFilter(returningFields))
      );
      queryWithoutRLS += returningQuery;
    }

    // TODO - delete orphaned files
    // if(this.dboBuilder.prostgles.opts.fileTable?.referencedTables?.[this.name]?.referenceColumns){
    //   if(!this.getFinalDBtx(localParams)){
    //     const ACTION = "delete";
    //     return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(filter, params, param3_unused, tableRules, localParams))
    //   }
    // }

    const queryWithRLS = withUserRLS(localParams, queryWithoutRLS);
    if (returnQuery) return queryWithRLS;

    /**
     * Delete file
     */
    if (this.is_media) {
      const result = await onDeleteFromFileTable.bind(this)({
        localParams,
        queryType,
        returningQuery: undefined,
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

    const result = await runQueryReturnType({
      queryWithoutRLS,
      queryWithRLS,
      newQuery: undefined,
      returnType: params?.returnType,
      handler: this,
      localParams,
    });
    await this._log({
      command: "delete",
      localParams,
      data: { filter, params },
      duration: Date.now() - start,
    });
    return result;
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
    });
  }
}

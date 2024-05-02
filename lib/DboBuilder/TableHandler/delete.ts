import pgPromise from "pg-promise";
import { AnyObject, DeleteParams, FieldFilter } from "prostgles-types";
import { Filter, LocalParams, parseError, withUserRLS } from "../DboBuilder";
import { DeleteRule, TableRule } from "../../PublishParser/PublishParser";
import { runQueryReturnType } from "../ViewHandler/find";
import { TableHandler } from "./TableHandler";
import { onDeleteFromFileTable } from "./onDeleteFromFileTable";

export async function _delete(this: TableHandler, filter?: Filter, params?: DeleteParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any> {
  try {
    await this._log({ command: "delete", localParams, data: { filter, params } });
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
      validate = tableRules.delete.validate;

      if (!returningFields) returningFields = tableRules?.select?.fields;
      if (!returningFields) returningFields = tableRules?.delete?.filterFields;

      if (!filterFields) throw ` Invalid delete rule for ${this.name}. filterFields missing `;

      /* Safely test publish rules */
      if (testRule) {
        await this.validateViewRules({ filterFields, returningFields, forcedFilter, rule: "delete" });
        return true;
      }
    }

    if (params) {
      const good_paramsObj: Record<keyof DeleteParams, 1> = { returning: 1, returnType: 1 };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    let queryType: keyof pgPromise.ITask<{}> = 'none';
    let queryWithoutRLS = `DELETE FROM ${this.escapedName} `;
    const filterOpts = (await this.prepareWhere({
      select: undefined,
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules
    }))
    queryWithoutRLS += filterOpts.where;
    if (validate) {
      const _filter = filterOpts.filter;
      await validate(_filter);
    }

    let returningQuery = "";
    if (returning) {
      queryType = "any";
      if (!returningFields) {
        throw "Returning dissallowed";
      }
      returningQuery = this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
      queryWithoutRLS += returningQuery
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
      return onDeleteFromFileTable.bind(this)({ 
        localParams, 
        queryType, 
        returningQuery: returnQuery? returnQuery : undefined,
        filterOpts,
      });
    }

    return runQueryReturnType({ 
      queryWithoutRLS,
      queryWithRLS,
      newQuery: undefined, 
      returnType: params?.returnType, 
      handler: this, 
      localParams
    });

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.delete(${JSON.stringify(filter || {}, null, 2)}, ${JSON.stringify(params || {}, null, 2)})`);
  }
} 


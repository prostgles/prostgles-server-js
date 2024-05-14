import { AnyObject, UpdateParams } from "prostgles-types";
import { TableRule } from "../../PublishParser/PublishParser";
import { Filter, LocalParams, getErrorAsObject, parseError, withUserRLS } from "../DboBuilder";
import { getInsertTableRules, getReferenceColumnInserts } from "../insertNestedRecords";
import { runInsertUpdateQuery } from "./runInsertUpdateQuery";
import { TableHandler } from "./TableHandler";
import { updateFile } from "./updateFile";
import { prepareNewData } from "./DataValidator";

export async function update(this: TableHandler, filter: Filter, _newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<AnyObject | void> {
  const ACTION = "update";
  const start = Date.now();
  try {
    /** postValidate */
    const finalDBtx = this.getFinalDBtx(localParams);
    const wrapInTx = () => this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(filter, _newData, params, tableRules, localParams))
    const rule = tableRules?.[ACTION]
    if(rule?.postValidate && !finalDBtx){
      return wrapInTx();
    }

    let newData = _newData;
    if(this.is_media){
      ({ newData } = await updateFile.bind(this)({ newData, filter, localParams, tableRules }));
    }

    const parsedRules = await this.parseUpdateRules(filter, params, tableRules, localParams)
    if (localParams?.testRule) {
      return parsedRules;
    }

    if (!newData || !Object.keys(newData).length) {
      throw "no update data provided\nEXPECTING db.table.update(filter, updateData, options)";
    }

    const { fields, validateRow, forcedData,  returningFields, forcedFilter, filterFields } = parsedRules;
    const { onConflict, fixIssues = false } = params || {};
    const { returnQuery = false } = localParams ?? {};

    if (params) {
      const good_paramsObj: Record<keyof UpdateParams, 1> = { returning: 1, returnType: 1, fixIssues: 1, onConflict: 1, multi: 1 };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    const { data, allowedCols } = await prepareNewData({ 
      row: newData, 
      forcedData, 
      allowedFields: fields, 
      tableRules, 
      fixIssues,
      tableConfigurator: this.dboBuilder.prostgles.tableConfigurator,
      tableHandler: this, 
    });

    const updateFilter = await this.prepareWhere({
      select: undefined,
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules
    })
    
    /**
     * Nested inserts
     */
    const nData = { ...data };
    const nestedInserts = getReferenceColumnInserts(this, nData, true);
    const nestedInsertsResultsObj: Record<string, any> = {};
    if(nestedInserts.length){
      const updateCount = await this.count(updateFilter.filter);
      if(+updateCount > 1){
        throw "Cannot do a nestedInsert from an update that targets more than 1 row";
      }
      if(!finalDBtx){
        return wrapInTx();
      }
      await Promise.all(nestedInserts.map(async nestedInsert => {
        const nesedTableHandler = finalDBtx[nestedInsert.tableName] as TableHandler | undefined;
        if(!nesedTableHandler) throw `nestedInsert Tablehandler not found for ${nestedInsert.tableName}`;
        const refTableRules = !localParams? undefined : await getInsertTableRules(this, nestedInsert.tableName, localParams);
        const nestedLocalParams: LocalParams = { ...localParams, nestedInsert: { depth: 1, previousData: nData, previousTable: this.name, referencingColumn: nestedInsert.col } }
        const nestedInsertResult = await nesedTableHandler.insert(nestedInsert.data, { returning: "*" }, undefined, refTableRules, nestedLocalParams);
        nestedInsertsResultsObj[nestedInsert.col] = nestedInsertResult;

        nData[nestedInsert.col] = nestedInsertResult[nestedInsert.fcol];
        return {
          ...nestedInsert,
          result: nestedInsertResult,
        }
      }));
    }

    // let query = await this.colSet.getUpdateQuery(nData, allowedCols, this.getFinalDbo(localParams), validateRow, localParams)
    let query = (await this.dataValidator.parse({ command: "update", rows: [nData], allowedCols, dbTx: this.getFinalDbo(localParams), validationOptions: { validate: validateRow, localParams }})).getQuery()
    query += "\n" + updateFilter.where;
    if (onConflict === "DoNothing") query += " ON CONFLICT DO NOTHING ";
    if(onConflict === "DoUpdate"){
      throw "onConflict 'DoUpdate' not possible for an update";
    }
    const queryWithoutUserRLS = query;
    query = withUserRLS(localParams, query);

    if (returnQuery) return query as unknown as void;

    const result = await runInsertUpdateQuery({
      tableHandler: this,
      data: undefined,
      fields,
      localParams,
      params,
      queryWithoutUserRLS,
      returningFields,
      rule,
      type: "update",
      nestedInsertsResultsObj
    });
    await this._log({ command: "update", localParams, data: { filter, _newData, params }, duration: Date.now() - start });
    return result;
  } catch (e) {
    await this._log({ command: "update", localParams, data: { filter, _newData, params }, duration: Date.now() - start, error: getErrorAsObject(e) });
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.${ACTION}(${JSON.stringify(filter || {}, null, 2)}, ${Array.isArray(_newData)? "[{...}]": "{...}"}, ${JSON.stringify(params || {}, null, 2)})`)
  }
} 
import { AnyObject, unpatchText, UpdateParams } from "prostgles-types";
import { Filter, isPlainObject, LocalParams, parseError, withUserRLS } from "../../DboBuilder";
import { TableRule } from "../../PublishParser/PublishParser";
import { getInsertTableRules, getReferenceColumnInserts } from "../insertDataParse";
import { runInsertUpdateQuery } from "./runInsertUpdateQuery";
import { TableHandler } from "./TableHandler";
import { updateFile } from "./updateFile";

export async function update(this: TableHandler, filter: Filter, _newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<AnyObject | void> {
  const ACTION = "update";
  try {
    await this._log({ command: "update", localParams, data: { filter, _newData, params } });
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

    const parsedRules = await this.parseUpdateRules(filter, newData, params, tableRules, localParams)
    if (localParams?.testRule) {
      return parsedRules;
    }

    const { fields, validateRow, forcedData,  returningFields, forcedFilter, filterFields } = parsedRules;
    const { onConflictDoNothing = false, fixIssues = false } = params || {};
    const { returnQuery = false } = localParams ?? {};

    if (params) {
      const good_paramsObj: Record<keyof UpdateParams, 1> = { returning: 1, returnType: 1, fixIssues: 1, onConflictDoNothing: 1, multi: 1 };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    const { data, allowedCols } = this.validateNewData({ row: newData, forcedData, allowedFields: fields, tableRules, fixIssues });

    /* Patch data */
    const patchedTextData: {
      fieldName: string;
      from: number;
      to: number;
      text: string;
      md5: string
    }[] = [];
    this.columns.map(c => {
      const d = data[c.name];
      if (c.data_type === "text" && d && isPlainObject(d) && !["from", "to"].find(key => typeof d[key] !== "number")) {
        const unrecProps = Object.keys(d).filter(k => !["from", "to", "text", "md5"].includes(k));
        if (unrecProps.length) throw "Unrecognised params in textPatch field: " + unrecProps.join(", ");
        patchedTextData.push({ ...d, fieldName: c.name } as (typeof patchedTextData)[number]);
      }
    });

    if (patchedTextData?.length) {
      if (tableRules && !tableRules.select) throw "Select needs to be permitted to patch data";
      const rows = await this.find(filter, { select: patchedTextData.reduce((a, v) => ({ ...a, [v.fieldName]: 1 }), {}) }, undefined, tableRules);

      if (rows.length !== 1) {
        throw "Cannot patch data within a filter that affects more/less than 1 row";
      }
      patchedTextData.map(p => {
        data[p.fieldName] = unpatchText(rows[0][p.fieldName], p);
      });
    }

    const nData = { ...data };
    const updateFilter = await this.prepareWhere({
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules
    })

    const nestedInserts = getReferenceColumnInserts.bind(this)(nData, true);
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

    let query = await this.colSet.getUpdateQuery(nData, allowedCols, this.getFinalDbo(localParams), validateRow, localParams)
    query += "\n" + updateFilter.where;
    if (onConflictDoNothing) query += " ON CONFLICT DO NOTHING ";

    const queryWithoutUserRLS = query;
    query = withUserRLS(localParams, query);

    if (returnQuery) return query as unknown as void;

    return runInsertUpdateQuery({
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

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.${ACTION}(${JSON.stringify(filter || {}, null, 2)}, ${Array.isArray(_newData)? "[{...}]": "{...}"}, ${JSON.stringify(params || {}, null, 2)})`)
  }
} 
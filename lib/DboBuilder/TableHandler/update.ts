import { AnyObject, UpdateParams } from "prostgles-types";
import { TableRule } from "../../PublishParser/PublishParser";
import {
  Filter,
  LocalParams,
  getErrorAsObject,
  getSerializedClientErrorFromPGError,
  withUserRLS,
} from "../DboBuilder";
import { getInsertTableRules, getReferenceColumnInserts } from "./insert/insertNestedRecords";
import { prepareNewData } from "./DataValidator";
import { runInsertUpdateQuery } from "./runInsertUpdateQuery";
import { TableHandler } from "./TableHandler";
import { updateFile } from "./updateFile";

export async function update(
  this: TableHandler,
  filter: Filter,
  _newData: AnyObject,
  params?: UpdateParams,
  tableRules?: TableRule,
  localParams?: LocalParams
): Promise<AnyObject | void> {
  const ACTION = "update";
  const start = Date.now();
  try {
    /** postValidate */
    const finalDBtx = this.getFinalDBtx(localParams);
    const wrapInTx = () =>
      this.dboBuilder.getTX((_dbtx) =>
        _dbtx[this.name]?.[ACTION]?.(filter, _newData, params, tableRules, localParams)
      );
    const rule = tableRules?.[ACTION];
    if (rule?.postValidate && !finalDBtx) {
      return wrapInTx();
    }

    let newData = _newData;
    if (this.is_media) {
      ({ newData } = await updateFile.bind(this)({
        newData,
        filter,
        localParams,
        tableRules,
      }));
    }

    const parsedRules = await this.parseUpdateRules(filter, params, tableRules, localParams);
    if (localParams?.testRule) {
      return parsedRules;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!newData || !Object.keys(newData).length) {
      throw "no update data provided\nEXPECTING db.table.update(filter, updateData, options)";
    }

    const { fields, validateRow, forcedData, returningFields, forcedFilter, filterFields } =
      parsedRules;
    const { removeDisallowedFields = false } = params || {};
    const { returnQuery = false } = localParams ?? {};

    if (params) {
      const good_paramsObj: Record<keyof UpdateParams, 1> = {
        returning: 1,
        returnType: 1,
        removeDisallowedFields: 1,
        multi: 1,
      };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(params).filter((k) => !good_params.includes(k));
      if (bad_params.length)
        throw (
          "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ")
        );
    }

    const { data, allowedCols } = await prepareNewData({
      row: newData,
      forcedData,
      allowedFields: fields,
      tableRules,
      removeDisallowedFields,
      tableConfigurator: this.dboBuilder.prostgles.tableConfigurator,
      tableHandler: this,
    });

    const updateFilter = await this.prepareWhere({
      select: undefined,
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules,
    });

    /**
     * Nested inserts
     */
    const nData = { ...data };
    const nestedInserts = getReferenceColumnInserts(this, nData, true);
    const nestedInsertsResultsObj: Record<string, any> = {};
    if (nestedInserts.length) {
      const updateCount = await this.count(updateFilter.filter);
      if (+updateCount > 1) {
        throw "Cannot do a nestedInsert from an update that targets more than 1 row";
      }
      if (!finalDBtx) {
        return wrapInTx();
      }
      await Promise.all(
        nestedInserts.map(async (nestedInsert) => {
          const nesedTableHandler = finalDBtx[nestedInsert.tableName] as TableHandler | undefined;
          if (!nesedTableHandler)
            throw `nestedInsert Tablehandler not found for ${nestedInsert.tableName}`;
          const refTableRules =
            !localParams ? undefined : (
              await getInsertTableRules(this, nestedInsert.tableName, localParams.clientReq)
            );
          const nestedLocalParams: LocalParams = {
            ...localParams,
            nestedInsert: {
              depth: 1,
              previousData: nData,
              previousTable: this.name,
              referencingColumn: nestedInsert.insertedFieldName,
            },
          };
          const nestedInsertResult = (await nesedTableHandler.insert(
            nestedInsert.data,
            { returning: "*" },
            undefined,
            refTableRules,
            nestedLocalParams
          )) as AnyObject;
          nestedInsertsResultsObj[nestedInsert.insertedFieldName] = nestedInsertResult;

          nestedInsert.insertedFieldRef.fcols.forEach((fcol, idx) => {
            const col = nestedInsert.insertedFieldRef.cols[idx];
            if (!col) throw `col not found for ${nestedInsert.insertedFieldName}`;
            nData[col] = nestedInsertResult[fcol];
          });
          return {
            ...nestedInsert,
            result: nestedInsertResult,
          };
        })
      );
    }

    let query = (
      await this.dataValidator.parse({
        command: "update",
        rows: [nData],
        allowedCols,
        dbTx: this.getFinalDbo(localParams),
        validationOptions: { validate: validateRow, localParams },
      })
    ).getQuery();
    query += "\n" + updateFilter.where;
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
      nestedInsertsResultsObj,
    });
    await this._log({
      command: "update",
      localParams,
      data: { filter, _newData, params },
      duration: Date.now() - start,
    });
    return result;
  } catch (e) {
    await this._log({
      command: "update",
      localParams,
      data: { filter, _newData, params },
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

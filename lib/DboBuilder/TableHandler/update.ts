import { AnyObject, getKeys, isObject, unpatchText, UpdateParams } from "prostgles-types";
import { Filter, isPlainObject, LocalParams, Media, parseError, withUserRLS } from "../../DboBuilder";
import { TableRule, ValidateRow } from "../../PublishParser";
import { omitKeys } from "../../PubSubManager/PubSubManager";
import { isFile, uploadFile } from "../uploadFile";
import { runInsertUpdateQuery } from "./runInsertUpdateQuery";
import { TableHandler } from "./TableHandler";

export async function update(this: TableHandler, filter: Filter, _newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<AnyObject | void> {
  const ACTION = "update";
  try {
    await this._log({ command: "update", localParams, data: { filter, _newData, params } });
    /** postValidate */
    const finalDBtx = this.getFinalDBtx(localParams);
    const rule = tableRules?.[ACTION]
    if(rule?.postValidate){
      if(!finalDBtx){
        return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(filter, _newData, params, tableRules, localParams))
      }
    }

    let newData = _newData;
    if(this.is_media && isFile(newData) && (!tableRules || tableRules.update)){
      const existingMediaId: string = !(!filter || !isObject(filter) || getKeys(filter).join() !== "id" || typeof (filter as any).id !== "string")? (filter as any).id : undefined
      if(!existingMediaId){
        throw new Error(`Updating the file table with file data can only be done by providing a single id filter. E.g. { id: "9ea4e23c-2b1a-4e33-8ec0-c15919bb45ec" } `);
      }
      if(localParams?.testRule){
        newData = {};
      } else {
        const fileManager = this.dboBuilder.prostgles.fileManager
        if(!fileManager) throw new Error("fileManager missing");
        if(!localParams) throw new Error("localParams missing");
        const validate: ValidateRow | undefined = tableRules?.[ACTION]?.validate? async (row) => {
          return tableRules?.[ACTION]?.validate!({ update: row, filter, dbx:  this.tx?.dbTX || this.dboBuilder.dbo, localParams })
        } : undefined;

        const existingFile: Media | undefined = await (localParams?.tx?.dbTX?.[this.name] as TableHandler || this).findOne({ id: existingMediaId });
         
        if(!existingFile?.name) throw new Error("Existing file record not found");

        // oldFileDelete = () => fileManager.deleteFile(existingFile!.name!)
        await fileManager.deleteFile(existingFile!.name!); //oldFileDelete();
        const newFile = await uploadFile.bind(this)({ row: newData, validate, localParams, mediaId: existingFile.id })
        newData = omitKeys(newFile, ["id"]);
      }
    } else if(this.is_media && isObject(newData) && typeof newData.name === "string"){
      throw new Error("Cannot update the 'name' field of the file. It is used in interacting with the file")
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

    if (patchedTextData && patchedTextData.length) {
      if (tableRules && !tableRules.select) throw "Select needs to be permitted to patch data";
      const rows = await this.find(filter, { select: patchedTextData.reduce((a, v) => ({ ...a, [v.fieldName]: 1 }), {}) }, undefined, tableRules);

      if (rows.length !== 1) {
        throw "Cannot patch data within a filter that affects more/less than 1 row";
      }
      patchedTextData.map(p => {
        data[p.fieldName] = unpatchText(rows[0][p.fieldName], p);
      })

      // https://w3resource.com/PostgreSQL/overlay-function.p hp
      //  overlay(coalesce(status, '') placing 'hom' from 2 for 0)
    }

    const nData = { ...data };
    

    let query = await this.colSet.getUpdateQuery(nData, allowedCols, this.getFinalDbo(localParams), validateRow, localParams)
    query += "\n" + (await this.prepareWhere({
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules
    })).where;
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
      type: "update"
    });

    // if(params?.returnType){
    //   return runQueryReturnType(query, params.returnType, this, localParams);
    // }

    // let result;
    // if (this.tx) {
    //   result = await (this.tx.t)[qType](query).catch((err: any) => makeErrorFromPGError(err, localParams, this, fields));
    // } else {
    //   result = await this.db.tx(t => (t as any)[qType](query)).catch(err => makeErrorFromPGError(err, localParams, this, fields));
    // }
    
    // /** TODO: Delete old file at the end in case new file update fails */
    // // await oldFileDelete();

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.${ACTION}(${JSON.stringify(filter || {}, null, 2)}, ${Array.isArray(_newData)? "[{...}]": "{...}"}, ${JSON.stringify(params || {}, null, 2)})`)
  }
} 
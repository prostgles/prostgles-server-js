import { AnyObject, getKeys, isObject, unpatchText, UpdateParams } from "prostgles-types";
import { Filter, isPlainObject, LocalParams, makeErr, Media, parseError, TableHandler } from "../DboBuilder";
import { TableRule, ValidateRow } from "../PublishParser";
import { omitKeys } from "../PubSubManager";
import { isFile, uploadFile } from "./uploadFile"

export async function update(this: TableHandler, filter: Filter, _newData: AnyObject, params?: UpdateParams, tableRules?: TableRule, localParams?: LocalParams): Promise<AnyObject | void> {
  try {

    let oldFileDelete = () => {};

    let newData = _newData;
    if(this.is_media && isFile(newData) && (!tableRules || tableRules.insert)){
      let existingMediaId: string = !(!filter || !isObject(filter) || getKeys(filter).join() !== "id" || typeof (filter as any).id !== "string")? (filter as any).id : undefined
      if(!existingMediaId){
        throw new Error(`Updating the file table with file data can only be done by providing a single id filter. E.g. { id: "9ea4e23c-2b1a-4e33-8ec0-c15919bb45ec"} `);
      }
      if(localParams?.testRule){
        newData = {};
      } else {
        const fileManager = this.dboBuilder.prostgles.fileManager
        if(!fileManager) throw new Error("fileManager missing");
        const validate: ValidateRow | undefined = tableRules?.update?.validate? async (row) => {
          return tableRules?.update?.validate!({ update: row, filter })
        } : undefined;

        let existingFile: Media | undefined = await (localParams?.dbTX?.[this.name] as TableHandler || this).findOne({ id: existingMediaId });
         
        if(!existingFile?.name) throw new Error("Existing file record not found");

        // oldFileDelete = () => fileManager.deleteFile(existingFile!.name!)
        await fileManager.deleteFile(existingFile!.name!); //oldFileDelete();
        const newFile = await uploadFile.bind(this)(newData, validate, localParams, existingFile.id)
        newData = omitKeys(newFile, ["id"]);
      }
    }

    const parsedRules = await this.parseUpdateRules(filter, newData, params, tableRules, localParams)
    if (localParams?.testRule) {
      return parsedRules;
    }

    const { fields, validateRow, forcedData, finalUpdateFilter, returningFields, forcedFilter, filterFields } = parsedRules;


    let { returning, multi = true, onConflictDoNothing = false, fixIssues = false } = params || {};
    const { returnQuery = false } = localParams ?? {};


    if (params) {
      const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
      const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    const { data, allowedCols } = this.validateNewData({ row: newData, forcedData, allowedFields: fields, tableRules, fixIssues });

    /* Patch data */
    let patchedTextData: {
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

    let nData = { ...data };
    

    let query = await this.colSet.getUpdateQuery(nData, allowedCols, validateRow)
    query += (await this.prepareWhere({
      filter,
      forcedFilter,
      filterFields,
      localParams,
      tableRule: tableRules
    })).where;
    if (onConflictDoNothing) query += " ON CONFLICT DO NOTHING ";

    let qType: "none" | "any" | "one" = "none";
    if (returning) {
      qType = multi ? "any" : "one";
      query += this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
    }

    if (returnQuery) return query as unknown as void;

    let result;
    if (this.t) {
      result = await (this.t)[qType](query).catch((err: any) => makeErr(err, localParams, this, fields));
    } else {
      result = await this.db.tx(t => (t as any)[qType](query)).catch(err => makeErr(err, localParams, this, fields));
    }
    
    /** TODO: Delete old file at the end in case new file update fails */
    // await oldFileDelete();

    return result;

  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw { err: parseError(e), msg: `Issue with dbo.${this.name}.update(${JSON.stringify(filter || {}, null, 2)}, ${Array.isArray(_newData)? "...DATA[]": "...DATA"}, ${JSON.stringify(params || {}, null, 2)})` };
  }
};
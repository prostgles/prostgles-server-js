import pgPromise from "pg-promise";
import { AnyObject, asName, FieldFilter, get, getKeys, InsertParams, isObject } from "prostgles-types";
import { LocalParams, makeErrorFromPGError, parseError, pgp, withUserRLS } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { asValue, pickKeys } from "../PubSubManager/PubSubManager";
import { TableHandler } from "./TableHandler";

export async function insert(this: TableHandler, rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, localParams?: LocalParams): Promise<any | any[] | boolean> {
  // const localParams = _localParams || {};
  
  const ACTION = "insert";
  try {
    await this._log({ command: "insert", localParams, data: { rowOrRows, param2 } });

    const { onConflictDoNothing, fixIssues = false } = param2 || {};
    const { testRule = false, returnQuery = false } = localParams || {};

    const { returning } = param2 || {};
    const finalDBtx = localParams?.tx?.dbTX || this.dbTX;
    if(tableRules?.[ACTION]?.postValidate ){
      if(!finalDBtx){
        return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(rowOrRows, param2, param3_unused, tableRules, localParams))
      }
    }

    let returningFields: FieldFilter | undefined,
      forcedData: AnyObject | undefined,
      fields: FieldFilter | undefined;

    if (tableRules) {
      if (!tableRules[ACTION]) throw "insert rules missing for " + this.name;
      returningFields = tableRules[ACTION].returningFields;
      forcedData = tableRules[ACTION].forcedData;
      fields = tableRules[ACTION].fields;

      /* If no returning fields specified then take select fields as returning */
      if (!returningFields) returningFields = get(tableRules, "select.fields") || get(tableRules, "insert.fields");

      if (!fields) throw ` invalid insert rule for ${this.name} -> fields missing `;

      /* Safely test publish rules */
      if (testRule) {
        // if(this.is_media && tableRules.insert.preValidate) throw "Media table cannot have a preValidate. It already is used internally by prostgles for file upload";
        await this.validateViewRules({ fields, returningFields, forcedFilter: forcedData, rule: "insert" });
        if (forcedData) {
          const keys = Object.keys(forcedData);
          if (keys.length) {
            const dataCols = keys.filter(k => this.column_names.includes(k));
            const nestedInsertCols = keys.filter(k => !this.column_names.includes(k) && this.dboBuilder.dbo[k]?.insert);
            if(nestedInsertCols.length){
              throw `Nested insert not supported for forcedData rule: ${nestedInsertCols}`;
            }
            const badCols = keys.filter(k => !dataCols.includes(k) && !nestedInsertCols.includes(k));
            if(badCols.length){
              throw `Invalid columns found in forced filter: ${badCols.join(", ")}`;
            }
            try {
              const values = "(" + dataCols.map(k => asValue(forcedData![k]) + "::" + this.columns.find(c => c.name === k)!.udt_name).join(", ") + ")",
                colNames = dataCols.map(k => asName(k)).join(",");
              const query = pgp.as.format("EXPLAIN INSERT INTO " + this.escapedName + " (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { colNames, values })
              await this.db.any(query);
            } catch (e) {
              throw "\nissue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
            }
          }
        }

        return true;
      }
    }

    let conflict_query = "";
    if (typeof onConflictDoNothing === "boolean" && onConflictDoNothing) {
      conflict_query = " ON CONFLICT DO NOTHING ";
    }

    if (param2) {
      const good_paramsObj: Record<keyof InsertParams, 1> = { returning: 1, returnType: 1, fixIssues: 1, onConflictDoNothing: 1 };
      const good_params = Object.keys(good_paramsObj);
      const bad_params = Object.keys(param2).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    if (!rowOrRows) rowOrRows = {}; //throw "Provide data in param1";

    /** TODO: use WITH inserted as (query) SELECT jsonb_agg(inserted.*) as validateReturn, userReturning */
    const originalReturning = await this.prepareReturning(returning, this.parseFieldFilter(returningFields))
    const fullReturning = await this.prepareReturning(returning, this.parseFieldFilter("*"));

    /** Used for postValidate. Add any missing computed returning from original query */
    fullReturning.concat(originalReturning.filter(s => !fullReturning.some(f => f.alias === s.alias)));

    const finalSelect = tableRules?.[ACTION]?.postValidate? fullReturning : originalReturning;
    const returningSelect = this.makeReturnQuery(finalSelect);
    
    const makeQuery = async (_row: AnyObject | undefined) => {
      const row = { ..._row };

      if (!isObject(row)) {
        console.trace(row)
        throw "\ninvalid insert data provided -> " + JSON.stringify(row);
      }

      const { data, allowedCols } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
      const _data = { ...data };

      let insertQ = "";
      if (!Array.isArray(_data) && !getKeys(_data).length || Array.isArray(_data) && !_data.length) {
        await tableRules?.[ACTION]?.validate?.(_data, this.dbTX || this.dboBuilder.dbo);
        insertQ = `INSERT INTO ${asName(this.name)} DEFAULT VALUES `;
      } else {
        //@ts-ignore
        insertQ = await this.colSet.getInsertQuery(_data, allowedCols, this.dbTX || this.dboBuilder.dbo, tableRules?.[ACTION]?.validate) // pgp.helpers.insert(_data, columnSet); 
      }
      return insertQ + conflict_query + returningSelect;
    };

    let query = "";
    let queryType: keyof pgPromise.ITask<{}> = "none";

    /**
     * If media it will: upload file and continue insert
     * If nested insert it will: make separate inserts and not continue main insert
     */
    const insRes = await this.insertDataParse(rowOrRows, param2, param3_unused, tableRules, localParams);
    const { data, insertResult } = insRes;
    if ("insertResult" in insRes) {
      return insertResult;
    }

    if (Array.isArray(data)) {

      if(!data.length){
        throw "Empty insert. Provide data";
      }

      const queries = await Promise.all(data.map(async p => {
        const q = await makeQuery(p);
        return q;
      }));

      query = pgp.helpers.concat(queries);
      if (returningSelect) queryType = "many";
    } else {
      query = await makeQuery(data);
      if (returningSelect) queryType = "one";
    }

    query = withUserRLS(localParams, query);
    if (returnQuery) return query;
    let result;

    if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
      console.log(this.t?.ctx?.start, "insert in " + this.name, data);
    }

    const tx = localParams?.tx?.t || this.t;

    const allowedFieldKeys = this.parseFieldFilter(fields);
    if (tx) {
      result = await (tx as any)[queryType](query).catch((err: any) => makeErrorFromPGError(err, localParams, this, allowedFieldKeys));
    } else {
      result = await this.db.tx(t => (t as any)[queryType](query)).catch(err => makeErrorFromPGError(err, localParams, this, allowedFieldKeys));
    }

    if(tableRules?.[ACTION]?.postValidate){
      if(!finalDBtx) throw new Error("Unexpected: no dbTX for postValidate");
      const rows = Array.isArray(result)? result : [result];
      for await (const row of rows){
        await tableRules?.[ACTION]?.postValidate(row ?? {}, finalDBtx)
      }

      /* We used a full returning for postValidate. Now we must filter out dissallowed columns  */
      if(returning){
        if(Array.isArray(result)){
          return result.map(row => {
            pickKeys(row, originalReturning.map(s => s.alias))
          });
        }
        return pickKeys(result, originalReturning.map(s => s.alias))
      }

      return undefined;
    }

    return result;
  } catch (e) {
    if (localParams && localParams.testRule) throw e;

    // ${JSON.stringify(rowOrRows || {}, null, 2)}, 
    // ${JSON.stringify(param2 || {}, null, 2)}
    throw parseError(e, `dbo.${this.name}.${ACTION}()`)
  }
} 


// const removeBuffers = (o: any) => {
//   if(isPlainObject(o)){
//     return JSON.stringify(getKeys(o).reduce((a, k) => {
//       const value = o[k]
//       return { ...a, [k]: Buffer.isBuffer(value)? `Buffer[${value.byteLength}][...REMOVED]` : value 
//     }
//   }, {}));
//   }
// }
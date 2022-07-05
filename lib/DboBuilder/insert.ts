import pgPromise from "pg-promise";
import { AnyObject, asName, FieldFilter, get, InsertParams, isObject } from "prostgles-types";
import { isPojoObject, LocalParams, makeErr, parseError, pgp, TableHandler } from "../DboBuilder";
import { TableRule } from "../PublishParser";

export async function insert(this: TableHandler, rowOrRows: (AnyObject | AnyObject[]), param2?: InsertParams, param3_unused?: undefined, tableRules?: TableRule, _localParams?: LocalParams): Promise<any | any[] | boolean> {
  const localParams = _localParams || {};
  const { dbTX } = localParams
  try {

    const { returning, onConflictDoNothing, fixIssues = false } = param2 || {};
    const { testRule = false, returnQuery = false } = localParams || {};

    let returningFields: FieldFilter | undefined,
      forcedData: AnyObject | undefined,
      fields: FieldFilter | undefined;

    if (tableRules) {
      if (!tableRules.insert) throw "insert rules missing for " + this.name;
      returningFields = tableRules.insert.returningFields;
      forcedData = tableRules.insert.forcedData;
      fields = tableRules.insert.fields;

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
            try {
              const colset = new pgp.helpers.ColumnSet(this.columns.filter(c => keys.includes(c.name)).map(c => ({ name: c.name, cast: c.udt_name === "uuid" ? c.udt_name : undefined }))),
                values = pgp.helpers.values(forcedData, colset),
                colNames = this.prepareSelect(keys, this.column_names);
              await this.db.any("EXPLAIN INSERT INTO " + this.escapedName + " (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { colNames, values })
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
      const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
      const bad_params = Object.keys(param2).filter(k => !good_params.includes(k));
      if (bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
    }

    if (!rowOrRows) rowOrRows = {}; //throw "Provide data in param1";
    let returningSelect = this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
    const makeQuery = async (_row: AnyObject | undefined, isOne = false) => {
      let row = { ..._row };

      if (!isPojoObject(row)) {
        console.trace(row)
        throw "\ninvalid insert data provided -> " + JSON.stringify(row);
      }

      const { data, allowedCols } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
      let _data = { ...data };

      let insertQ = "";
      if (!Object.keys(_data).length) insertQ = `INSERT INTO ${asName(this.name)} DEFAULT VALUES `;
      else insertQ = await this.colSet.getInsertQuery(_data, allowedCols, tableRules?.insert?.validate) // pgp.helpers.insert(_data, columnSet); 
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
      // if(returning) throw "Sorry but [returning] is dissalowed for multi insert";
      let queries = await Promise.all(data.map(async p => {
        const q = await makeQuery(p);
        return q;
      }));

      query = pgp.helpers.concat(queries);
      if (returning) queryType = "many";
    } else {
      query = await makeQuery(data, true);
      if (returning) queryType = "one";
    }

    if (returnQuery) return query;
    let result;

    if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
      console.log(this.t?.ctx?.start, "insert in " + this.name, data);
    }

    const tx = dbTX?.[this.name]?.t || this.t;

    const allowedFieldKeys = this.parseFieldFilter(fields);
    if (tx) {
      result = (tx as any)[queryType](query).catch((err: any) => makeErr(err, localParams, this, allowedFieldKeys));
    } else {
      result = this.db.tx(t => (t as any)[queryType](query)).catch(err => makeErr(err, localParams, this, allowedFieldKeys));
    }

    return result;
  } catch (e) {
    if (localParams && localParams.testRule) throw e;

    // ${JSON.stringify(rowOrRows || {}, null, 2)}, 
    // ${JSON.stringify(param2 || {}, null, 2)}
    throw {
      err: parseError(e), msg: `Issue with dbo.${this.name}.insert(...)`,
      args: {
        1: rowOrRows,
        2: param2
      }
    };
  }
};
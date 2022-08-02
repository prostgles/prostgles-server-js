"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insert = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
async function insert(rowOrRows, param2, param3_unused, tableRules, _localParams) {
    const localParams = _localParams || {};
    const { dbTX } = localParams;
    try {
        const { onConflictDoNothing, fixIssues = false } = param2 || {};
        let { returning } = param2 || {};
        const { testRule = false, returnQuery = false } = localParams || {};
        const finalDBtx = dbTX || this.dbTX;
        if (tableRules?.insert?.postValidate) {
            if (!finalDBtx) {
                return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.insert?.(rowOrRows, param2, param3_unused, tableRules, _localParams));
            }
            /** Post validate can only access the fields that are accessible to the client */
            returning ?? (returning = {});
            if (returning !== "*") {
                returning["*"] = 1;
            }
        }
        let returningFields, forcedData, fields;
        if (tableRules) {
            if (!tableRules.insert)
                throw "insert rules missing for " + this.name;
            returningFields = tableRules.insert.returningFields;
            forcedData = tableRules.insert.forcedData;
            fields = tableRules.insert.fields;
            /* If no returning fields specified then take select fields as returning */
            if (!returningFields)
                returningFields = (0, prostgles_types_1.get)(tableRules, "select.fields") || (0, prostgles_types_1.get)(tableRules, "insert.fields");
            if (!fields)
                throw ` invalid insert rule for ${this.name} -> fields missing `;
            /* Safely test publish rules */
            if (testRule) {
                // if(this.is_media && tableRules.insert.preValidate) throw "Media table cannot have a preValidate. It already is used internally by prostgles for file upload";
                await this.validateViewRules({ fields, returningFields, forcedFilter: forcedData, rule: "insert" });
                if (forcedData) {
                    const keys = Object.keys(forcedData);
                    if (keys.length) {
                        try {
                            const colset = new DboBuilder_1.pgp.helpers.ColumnSet(this.columns.filter(c => keys.includes(c.name)).map(c => ({ name: c.name, cast: c.udt_name === "uuid" ? c.udt_name : undefined }))), values = DboBuilder_1.pgp.helpers.values(forcedData, colset), colNames = this.prepareSelect(keys, this.column_names);
                            await this.db.any("EXPLAIN INSERT INTO " + this.escapedName + " (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { colNames, values });
                        }
                        catch (e) {
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
            const bad_params = (0, prostgles_types_1.getKeys)(param2).filter(k => !good_params.includes(k));
            if (bad_params && bad_params.length)
                throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
        }
        if (!rowOrRows)
            rowOrRows = {}; //throw "Provide data in param1";
        let returningSelect = this.makeReturnQuery(await this.prepareReturning(returning, this.parseFieldFilter(returningFields)));
        const makeQuery = async (_row, isOne = false) => {
            let row = { ..._row };
            if (!(0, DboBuilder_1.isPojoObject)(row)) {
                console.trace(row);
                throw "\ninvalid insert data provided -> " + JSON.stringify(row);
            }
            const { data, allowedCols } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
            let _data = { ...data };
            let insertQ = "";
            if (!Array.isArray(_data) && !(0, prostgles_types_1.getKeys)(_data).length || Array.isArray(_data) && !_data.length) {
                await tableRules?.insert?.validate?.(_data, this.dbTX || this.dboBuilder.dbo);
                insertQ = `INSERT INTO ${(0, prostgles_types_1.asName)(this.name)} DEFAULT VALUES `;
            }
            else {
                insertQ = await this.colSet.getInsertQuery(_data, allowedCols, this.dbTX || this.dboBuilder.dbo, tableRules?.insert?.validate); // pgp.helpers.insert(_data, columnSet); 
            }
            return insertQ + conflict_query + returningSelect;
        };
        let query = "";
        let queryType = "none";
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
            let queries = await Promise.all(data.map(async (p) => {
                const q = await makeQuery(p);
                return q;
            }));
            query = DboBuilder_1.pgp.helpers.concat(queries);
            if (returning)
                queryType = "many";
        }
        else {
            query = await makeQuery(data, true);
            if (returning)
                queryType = "one";
        }
        if (returnQuery)
            return query;
        let result;
        if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
            console.log(this.t?.ctx?.start, "insert in " + this.name, data);
        }
        const tx = dbTX?.[this.name]?.t || this.t;
        const allowedFieldKeys = this.parseFieldFilter(fields);
        if (tx) {
            result = tx[queryType](query).catch((err) => (0, DboBuilder_1.makeErr)(err, localParams, this, allowedFieldKeys));
        }
        else {
            result = this.db.tx(t => t[queryType](query)).catch(err => (0, DboBuilder_1.makeErr)(err, localParams, this, allowedFieldKeys));
        }
        if (tableRules?.insert?.postValidate) {
            if (!finalDBtx)
                throw new Error("Unexpected: no dbTX for postValidate");
            const rows = Array.isArray(data) ? data : [data];
            for await (const row of rows) {
                await tableRules?.insert?.postValidate(row ?? {}, finalDBtx);
            }
        }
        return result;
    }
    catch (e) {
        if (localParams && localParams.testRule)
            throw e;
        // ${JSON.stringify(rowOrRows || {}, null, 2)}, 
        // ${JSON.stringify(param2 || {}, null, 2)}
        throw {
            err: (0, DboBuilder_1.isPlainObject)(e) && e.err ? e.err : (0, DboBuilder_1.parseError)(e),
            msg: (0, DboBuilder_1.isPlainObject)(e) && e.msg ? e.msg : `Issue with dbo.${this.name}.insert(...)`,
        };
    }
}
exports.insert = insert;
;
const removeBuffers = (o) => {
    if ((0, DboBuilder_1.isPlainObject)(o)) {
        return JSON.stringify((0, prostgles_types_1.getKeys)(o).reduce((a, k) => {
            const value = o[k];
            return { ...a, [k]: Buffer.isBuffer(value) ? `Buffer[${value.byteLength}][...REMOVED]` : value
            };
        }, {}));
    }
};
//# sourceMappingURL=insert.js.map
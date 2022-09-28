"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insert = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager");
async function insert(rowOrRows, param2, param3_unused, tableRules, localParams) {
    // const localParams = _localParams || {};
    const ACTION = "insert";
    try {
        const { onConflictDoNothing, fixIssues = false } = param2 || {};
        const { testRule = false, returnQuery = false } = localParams || {};
        let { returning } = param2 || {};
        const finalDBtx = localParams?.tx?.dbTX || this.dbTX;
        if (tableRules?.[ACTION]?.postValidate) {
            if (!finalDBtx) {
                return this.dboBuilder.getTX(_dbtx => _dbtx[this.name]?.[ACTION]?.(rowOrRows, param2, param3_unused, tableRules, localParams));
            }
        }
        let returningFields, forcedData, fields;
        if (tableRules) {
            if (!tableRules[ACTION])
                throw "insert rules missing for " + this.name;
            returningFields = tableRules[ACTION].returningFields;
            forcedData = tableRules[ACTION].forcedData;
            fields = tableRules[ACTION].fields;
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
                        const dataCols = keys.filter(k => this.column_names.includes(k));
                        const nestedInsertCols = keys.filter(k => !this.column_names.includes(k) && this.dboBuilder.dbo[k].insert);
                        if (nestedInsertCols.length) {
                            throw `Nested insert not supported for forcedData rule: ${nestedInsertCols}`;
                        }
                        const badCols = keys.filter(k => !dataCols.includes(k) && !nestedInsertCols.includes(k));
                        if (badCols.length) {
                            throw `Invalid columns found in forced filter: ${badCols.join(", ")}`;
                        }
                        try {
                            const values = "(" + dataCols.map(k => (0, PubSubManager_1.asValue)(forcedData[k]) + "::" + this.columns.find(c => c.name === k).udt_name).join(", ") + ")", colNames = dataCols.map(k => (0, prostgles_types_1.asName)(k)).join(",");
                            const query = DboBuilder_1.pgp.as.format("EXPLAIN INSERT INTO " + this.escapedName + " (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { colNames, values });
                            await this.db.any(query);
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
        /** TODO: use WITH inserted as (query) SELECT jsonb_agg(inserted.*) as validateReturn, userReturning */
        const originalReturning = await this.prepareReturning(returning, this.parseFieldFilter(returningFields));
        let fullReturning = await this.prepareReturning(returning, this.parseFieldFilter("*"));
        /** Used for postValidate. Add any missing computed returning from original query */
        fullReturning.concat(originalReturning.filter(s => !fullReturning.some(f => f.alias === s.alias)));
        const finalSelect = tableRules?.[ACTION]?.postValidate ? fullReturning : originalReturning;
        let returningSelect = this.makeReturnQuery(finalSelect);
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
                await tableRules?.[ACTION]?.validate?.(_data, this.dbTX || this.dboBuilder.dbo);
                insertQ = `INSERT INTO ${(0, prostgles_types_1.asName)(this.name)} DEFAULT VALUES `;
            }
            else {
                insertQ = await this.colSet.getInsertQuery(_data, allowedCols, this.dbTX || this.dboBuilder.dbo, tableRules?.[ACTION]?.validate); // pgp.helpers.insert(_data, columnSet); 
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
            let queries = await Promise.all(data.map(async (p) => {
                const q = await makeQuery(p);
                return q;
            }));
            query = DboBuilder_1.pgp.helpers.concat(queries);
            if (returningSelect)
                queryType = "many";
        }
        else {
            query = await makeQuery(data, true);
            if (returningSelect)
                queryType = "one";
        }
        if (returnQuery)
            return query;
        let result;
        if (this.dboBuilder.prostgles.opts.DEBUG_MODE) {
            console.log(this.t?.ctx?.start, "insert in " + this.name, data);
        }
        const tx = localParams?.tx?.t || this.t;
        const allowedFieldKeys = this.parseFieldFilter(fields);
        if (tx) {
            result = await tx[queryType](query).catch((err) => (0, DboBuilder_1.makeErr)(err, localParams, this, allowedFieldKeys));
        }
        else {
            result = await this.db.tx(t => t[queryType](query)).catch(err => (0, DboBuilder_1.makeErr)(err, localParams, this, allowedFieldKeys));
        }
        if (tableRules?.[ACTION]?.postValidate) {
            if (!finalDBtx)
                throw new Error("Unexpected: no dbTX for postValidate");
            const rows = Array.isArray(result) ? result : [result];
            for await (const row of rows) {
                await tableRules?.[ACTION]?.postValidate(row ?? {}, finalDBtx);
            }
            /* We used a full returning for postValidate. Now we must filter out dissallowed columns  */
            if (returning) {
                if (Array.isArray(result)) {
                    return result.map(row => {
                        (0, PubSubManager_1.pickKeys)(row, originalReturning.map(s => s.alias));
                    });
                }
                return (0, PubSubManager_1.pickKeys)(result, originalReturning.map(s => s.alias));
            }
            return undefined;
        }
        return result;
    }
    catch (e) {
        if (localParams && localParams.testRule)
            throw e;
        // ${JSON.stringify(rowOrRows || {}, null, 2)}, 
        // ${JSON.stringify(param2 || {}, null, 2)}
        throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.${ACTION}()`);
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

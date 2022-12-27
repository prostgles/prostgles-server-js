"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseUpdateRules = void 0;
const prostgles_types_1 = require("prostgles-types");
/**
 * 1) Check if publish is valid
 * 2) Retrieve allowed update cols for a specific request
 */
async function parseUpdateRules(filter, newData, params, tableRules, localParams) {
    const { testRule = false } = localParams ?? {};
    if (!testRule) {
        if (!newData || !Object.keys(newData).length) {
            throw "no update data provided\nEXPECTING db.table.update(filter, updateData, options)";
        }
        this.checkFilter(filter);
    }
    let forcedFilter = {}, forcedData = {}, validate, returningFields = "*", filterFields = "*", fields = "*";
    let finalUpdateFilter = { ...filter };
    if (tableRules) {
        if (!tableRules.update)
            throw "update rules missing for " + this.name;
        ({ forcedFilter, forcedData, fields, filterFields, validate } = tableRules.update);
        returningFields = tableRules.update.returningFields ?? tableRules?.select?.fields ?? "";
        if (!returningFields && params?.returning) {
            throw "You are not allowed to return any fields from the update";
        }
        if (!fields) {
            throw ` Invalid update rule fo r ${this.name}. fields missing `;
        }
        finalUpdateFilter = (await this.prepareWhere({ filter, forcedFilter, filterFields, localParams, tableRule: tableRules })).filter;
        if (forcedFilter) {
            const match = await this.findOne(finalUpdateFilter);
            const requiredItem = await this.findOne(filter);
            if (!match && requiredItem) {
                fields = [];
            }
        }
        if (tableRules.update.dynamicFields?.length) {
            /**
             * dynamicFields.fields used to allow a custom list of fields for specific records
             * dynamicFields.filter cannot overlap each other
             * updates must target records from a specific dynamicFields.filter or not match any dynamicFields.filter
             */
            if (testRule) {
                for await (const [dfIndex, dfRule] of tableRules.update.dynamicFields.entries()) {
                    const condition = await this.getCondition({ allowed_colnames: this.column_names, filter: dfRule.filter });
                    if (!condition)
                        throw "dynamicFields.filter cannot be empty: " + JSON.stringify(dfRule);
                    await this.find(dfRule.filter, { limit: 0 });
                    /** Ensure dynamicFields filters do not overlap */
                    for await (const [_dfIndex, _dfRule] of tableRules.update.dynamicFields.entries()) {
                        if (dfIndex !== _dfIndex) {
                            if (await this.findOne({ $and: [dfRule.filter, _dfRule.filter] }, { select: "" })) {
                                throw `dynamicFields.filter cannot overlap each other. \n
                                Overlapping dynamicFields rules:
                                    ${JSON.stringify(dfRule)} 
                                    AND
                                    ${JSON.stringify(_dfRule)} 
                                `;
                            }
                        }
                    }
                }
            }
            /** Pick dynamicFields.fields if matching filter */
            let matchedRule;
            for await (const dfRule of tableRules.update.dynamicFields) {
                const match = await this.findOne({ $and: [finalUpdateFilter, dfRule.filter].filter(prostgles_types_1.isDefined) });
                if (match) {
                    /** Ensure it doesn't overlap with other dynamicFields.filter */
                    if (matchedRule) {
                        throw "Your update is targeting multiple tableRules.update.dynamicFields. Restrict update filter to only target one rule";
                    }
                    matchedRule = dfRule;
                    fields = dfRule.fields;
                }
            }
        }
        /* Safely test publish rules */
        if (testRule) {
            await this.validateViewRules({ fields, filterFields, returningFields, forcedFilter, dynamicFields: tableRules.update.dynamicFields, rule: "update" });
            if (forcedData) {
                try {
                    const { data, allowedCols } = this.validateNewData({ row: forcedData, forcedData: undefined, allowedFields: "*", tableRules, fixIssues: false });
                    const updateQ = await this.colSet.getUpdateQuery(data, allowedCols, this.dbTX || this.dboBuilder.dbo, validate ? ((row) => validate({ update: row, filter: {} }, this.dbTX || this.dboBuilder.dbo)) : undefined); //pgp.helpers.update(data, columnSet)
                    let query = updateQ + " WHERE FALSE ";
                    await this.db.any("EXPLAIN " + query);
                }
                catch (e) {
                    throw " issue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                }
            }
            return true;
        }
    }
    /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
    let _fields = this.parseFieldFilter(fields);
    /**
     * A forced filter must be basic
     */
    if (forcedFilter) {
        const _forcedFilterKeys = Object.keys(forcedFilter);
        const nonFields = _forcedFilterKeys.filter(key => !this.column_names.includes(key));
        if (nonFields.length)
            throw "forcedFilter must be a basic filter ( { col_name: 'value' } ). Invalid filter keys: " + nonFields;
        // const clashingFields = _forcedFilterKeys.filter(key => _fields.includes(key));
    }
    const validateRow = validate ? (row) => validate({ update: row, filter: finalUpdateFilter }, this.dbTX || this.dboBuilder.dbo) : undefined;
    return {
        fields: _fields,
        validateRow,
        finalUpdateFilter,
        forcedData,
        forcedFilter,
        returningFields,
        filterFields,
    };
}
exports.parseUpdateRules = parseUpdateRules;

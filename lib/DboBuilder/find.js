"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runQueryReturnType = exports.find = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const makeSelectQuery_1 = require("../DboBuilder/QueryBuilder/makeSelectQuery");
const runSQL_1 = require("../DboBuilder/runSQL");
const QueryBuilder_1 = require("./QueryBuilder/QueryBuilder");
const find = async function (filter, selectParams, param3_unused, tableRules, localParams) {
    try {
        filter = filter || {};
        const allowedReturnTypes = ["row", "value", "values", "statement"];
        const { returnType } = selectParams || {};
        if (returnType && !allowedReturnTypes.includes(returnType)) {
            throw `returnType (${returnType}) can only be ${allowedReturnTypes.join(" OR ")}`;
        }
        const { testRule = false, returnQuery = false, returnNewQuery } = localParams || {};
        if (testRule)
            return [];
        if (selectParams) {
            const good_params = ["select", "orderBy", "offset", "limit", "returnType", "groupBy"];
            const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
            if (bad_params && bad_params.length)
                throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
        }
        /* Validate publish */
        if (tableRules) {
            if (!tableRules.select)
                throw "select rules missing for " + this.name;
            const fields = tableRules.select.fields;
            const maxLimit = tableRules.select.maxLimit;
            if (tableRules.select !== "*" && typeof tableRules.select !== "boolean" && !(0, prostgles_types_1.isObject)(tableRules.select))
                throw `\nINVALID publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`;
            if (!fields)
                throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;
            if (maxLimit && !Number.isInteger(maxLimit))
                throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;
        }
        const q = await (0, QueryBuilder_1.getNewQuery)(this, filter, selectParams, param3_unused, tableRules, localParams, this.columns), _query = (0, makeSelectQuery_1.makeSelectQuery)(this, q, undefined, undefined, selectParams);
        // console.log(_query, JSON.stringify(q, null, 2))
        if (testRule) {
            try {
                await this.db.any("EXPLAIN " + _query);
                return [];
            }
            catch (e) {
                console.error(e);
                throw `INTERNAL ERROR: Publish config is not valid for publish.${this.name}.select `;
            }
        }
        /** Used for subscribe  */
        if (returnNewQuery)
            return q;
        if (returnQuery)
            return _query;
        return (0, exports.runQueryReturnType)(_query, returnType, this, localParams);
    }
    catch (e) {
        // console.trace(e)
        if (localParams && localParams.testRule)
            throw e;
        throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.find()`);
        // throw { err: parseError(e), msg: `Issue with dbo.${this.name}.find()`, args: { filter, selectParams} };
    }
};
exports.find = find;
const runQueryReturnType = async (query, returnType, handler, localParams) => {
    if (returnType === "statement") {
        if (!(await (0, runSQL_1.canRunSQL)(handler.dboBuilder.prostgles, localParams))) {
            throw `Not allowed:  {returnType: "statement"} requires sql privileges `;
        }
        return query;
    }
    else if (["row", "value"].includes(returnType)) {
        return (handler.t || handler.db).oneOrNone(query).then(data => {
            return (data && returnType === "value") ? Object.values(data)[0] : data;
        }).catch(err => (0, DboBuilder_1.makeErrorFromPGError)(err, localParams, this));
    }
    else {
        return (handler.t || handler.db).any(query).then(data => {
            if (returnType === "values") {
                return data.map(d => Object.values(d)[0]);
            }
            return data;
        }).catch(err => (0, DboBuilder_1.makeErrorFromPGError)(err, localParams, this));
    }
};
exports.runQueryReturnType = runQueryReturnType;

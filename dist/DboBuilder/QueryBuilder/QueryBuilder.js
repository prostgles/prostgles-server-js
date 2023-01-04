"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNewQuery = exports.SelectItemBuilder = exports.parseFunctionObject = exports.asNameAlias = void 0;
const DboBuilder_1 = require("../../DboBuilder");
const prostgles_types_1 = require("prostgles-types");
const utils_1 = require("../../utils");
const Functions_1 = require("./Functions");
const asNameAlias = (field, tableAlias) => {
    let result = (0, prostgles_types_1.asName)(field);
    if (tableAlias)
        return (0, prostgles_types_1.asName)(tableAlias) + "." + result;
    return result;
};
exports.asNameAlias = asNameAlias;
const parseFunctionObject = (funcData) => {
    const makeErr = (msg) => `Function not specified correctly. Expecting { $funcName: ["columnName",...] } object but got: ${JSON.stringify(funcData)} \n ${msg}`;
    if (!(0, prostgles_types_1.isObject)(funcData))
        throw makeErr("");
    const keys = Object.keys(funcData);
    if (keys.length !== 1)
        throw makeErr("");
    const funcName = keys[0];
    const args = funcData[funcName];
    if (!args || !Array.isArray(args)) {
        throw makeErr("Arguments missing or invalid");
    }
    return { funcName, args };
};
exports.parseFunctionObject = parseFunctionObject;
class SelectItemBuilder {
    constructor(params) {
        this.select = [];
        this.checkField = (f, isSelected) => {
            const allowedSelectedFields = this.allowedFieldsIncludingComputed;
            const allowedNonSelectedFields = [...this.allowedFieldsIncludingComputed, ...this.allowedOrderByFields];
            /** Not selected items can be part of the orderBy fields */
            if (!(isSelected ? allowedSelectedFields : allowedNonSelectedFields).includes(f)) {
                throw "Field " + f + " is invalid or dissallowed";
            }
            return f;
        };
        this.addItem = (item) => {
            let fields = item.getFields();
            // console.trace(fields)
            if (fields === "*")
                fields = this.allowedFields.slice(0);
            fields.map(f => this.checkField(f, item.selected));
            if (this.select.find(s => s.alias === item.alias)) {
                throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
            }
            this.select.push({ ...item, fields });
        };
        this.addFunction = (func, args, alias) => {
            const funcDef = (0, Functions_1.parseFunction)({
                func, args, functions: this.functions,
                allowedFields: this.allowedFieldsIncludingComputed,
            });
            this.addItem({
                type: funcDef.type,
                alias,
                getFields: () => funcDef.getFields(args),
                getQuery: (tableAlias) => funcDef.getQuery({ allColumns: this.columns, allowedFields: this.allowedFields, args, tableAlias,
                    ctidField: undefined,
                    /* CTID not available in AFTER trigger */
                    // ctidField: this.isView? undefined : "ctid" 
                }),
                selected: true
            });
        };
        this.addColumn = (fieldName, selected) => {
            /* Check if computed col */
            if (selected) {
                const compCol = Functions_1.COMPUTED_FIELDS.find(cf => cf.name === fieldName);
                if (compCol && !this.select.find(s => s.alias === fieldName)) {
                    const cf = {
                        ...compCol,
                        type: "computed",
                        numArgs: 0,
                        singleColArg: false,
                        getFields: (args) => []
                    };
                    this.addFunction(cf, [], compCol.name);
                    return;
                }
            }
            const colDef = this.columns.find(c => c.name === fieldName);
            let alias = selected ? fieldName : ("not_selected_" + fieldName);
            this.addItem({
                type: "column",
                columnPGDataType: colDef?.data_type,
                column_udt_type: colDef?.udt_name,
                alias,
                getQuery: () => (0, prostgles_types_1.asName)(fieldName),
                getFields: () => [fieldName],
                selected
            });
        };
        this.parseUserSelect = async (userSelect, joinParse) => {
            /* Array select */
            if (Array.isArray(userSelect)) {
                if (userSelect.find(key => typeof key !== "string"))
                    throw "Invalid array select. Expecting an array of strings";
                userSelect.map(key => this.addColumn(key, true));
                /* Empty select */
            }
            else if (userSelect === "") {
                // select.push({
                //   type: "function",
                //   alias: "",
                //   getFields: () => [],
                //   getQuery: () => ""
                // })
                return [];
            }
            else if (userSelect === "*") {
                this.allowedFields.map(key => this.addColumn(key, true));
            }
            else if ((0, DboBuilder_1.isPlainObject)(userSelect) && !(0, prostgles_types_1.isEmpty)(userSelect)) {
                const selectKeys = Object.keys(userSelect), selectValues = Object.values(userSelect);
                /* Cannot include and exclude at the same time */
                if (selectValues.filter(v => [0, false].includes(v)).length) {
                    if (selectValues.filter(v => ![0, false].includes(v)).length) {
                        throw "\nCannot include and exclude fields at the same time";
                    }
                    /* Exclude only */
                    this.allowedFields.filter(f => !selectKeys.includes(f)).map(key => this.addColumn(key, true));
                }
                else {
                    await Promise.all(selectKeys.map(async (key) => {
                        const val = userSelect[key], throwErr = (extraErr = "") => {
                            console.trace(extraErr);
                            throw "Unexpected select -> " + JSON.stringify({ [key]: val }) + "\n" + extraErr;
                        };
                        /* Included fields */
                        if ([1, true].includes(val)) {
                            if (key === "*") {
                                this.allowedFields.map(key => this.addColumn(key, true));
                            }
                            else {
                                this.addColumn(key, true);
                            }
                            /* Aggs and functions */
                        }
                        else if (typeof val === "string" || (0, DboBuilder_1.isPlainObject)(val)) {
                            /* Function shorthand notation
                                { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id
                            */
                            if ((typeof val === "string" && val !== "*") ||
                                (0, DboBuilder_1.isPlainObject)(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0]) // !isPlainObject(Object.values(val)[0])
                            ) {
                                // if(!Array.isArray(Object.values(val)[0])){
                                //   throw `Could not parse selected item: ${JSON.stringify(val)}\nFunction arguments must be in an array`;
                                // }
                                let funcName, args;
                                if (typeof val === "string") {
                                    /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
                                    try {
                                        this.checkField(key, true);
                                    }
                                    catch (err) {
                                        throwErr(` Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. \n Use correct column name or full aliased function notation, e.g.: -> { alias: { $func_name: ["column_name"] } } `);
                                    }
                                    funcName = val;
                                    args = [key];
                                    /** Function full notation { $funcName: ["colName", ...args] } */
                                }
                                else {
                                    ({ funcName, args } = (0, exports.parseFunctionObject)(val));
                                }
                                this.addFunction(funcName, args, key);
                                /* Join */
                            }
                            else {
                                if (!joinParse)
                                    throw "Joins dissalowed";
                                await joinParse(key, val, throwErr);
                            }
                        }
                        else
                            throwErr();
                    }));
                }
            }
            else
                throw "Unexpected select -> " + JSON.stringify(userSelect);
        };
        this.allFields = params.allFields;
        this.allowedFields = params.allowedFields;
        this.allowedOrderByFields = params.allowedOrderByFields;
        this.computedFields = params.computedFields;
        this.isView = params.isView;
        this.functions = params.functions;
        this.columns = params.columns;
        this.allowedFieldsIncludingComputed = this.allowedFields.concat(this.computedFields ? this.computedFields.map(cf => cf.name) : []);
        if (!this.allowedFields.length) {
            throw "allowedFields empty/missing";
        }
        /* Check for conflicting computed column names */
        const conflictingCol = this.allFields.find(fieldName => this.computedFields.find(cf => cf.name === fieldName));
        if (conflictingCol) {
            throw "INTERNAL ERROR: Cannot have duplicate column names ( " + conflictingCol + " ). One or more computed column names are colliding with table columns ones";
        }
    }
}
exports.SelectItemBuilder = SelectItemBuilder;
async function getNewQuery(_this, filter, selectParams = {}, param3_unused = null, tableRules, localParams, columns) {
    if (localParams?.isRemoteRequest && !tableRules?.select?.fields) {
        throw `INTERNAL ERROR: publish.${_this.name}.select.fields rule missing`;
    }
    const allowedOrderByFields = !tableRules ? _this.column_names.slice(0) : _this.parseFieldFilter(tableRules?.select?.orderByFields ?? tableRules?.select?.fields);
    const allowedSelectFields = !tableRules ? _this.column_names.slice(0) : _this.parseFieldFilter(tableRules?.select?.fields);
    let joinQueries = [];
    const { select: userSelect = "*" } = selectParams, sBuilder = new SelectItemBuilder({
        allowedFields: allowedSelectFields,
        allowedOrderByFields,
        computedFields: Functions_1.COMPUTED_FIELDS,
        isView: _this.is_view,
        functions: Functions_1.FUNCTIONS,
        allFields: _this.column_names.slice(0),
        columns
    });
    await sBuilder.parseUserSelect(userSelect, async (key, val, throwErr) => {
        let j_filter = {}, j_selectParams = {}, j_path, j_alias, j_tableRules, j_table, j_isLeftJoin = true;
        if (val === "*") {
            j_selectParams.select = "*";
            j_alias = key;
            j_table = key;
        }
        else {
            /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
            const JOIN_KEYS = ["$innerJoin", "$leftJoin"];
            const JOIN_PARAMS = ["select", "filter", "$path", "offset", "limit", "orderBy"];
            const joinKeys = Object.keys(val).filter(k => JOIN_KEYS.includes(k));
            if (joinKeys.length > 1) {
                throwErr("\nCannot specify more than one join type ( $innerJoin OR $leftJoin )");
            }
            else if (joinKeys.length === 1) {
                const invalidParams = Object.keys(val).filter(k => ![...JOIN_PARAMS, ...JOIN_KEYS].includes(k));
                if (invalidParams.length)
                    throw "Invalid join params: " + invalidParams.join(", ");
                j_isLeftJoin = joinKeys[0] === "$leftJoin";
                j_table = val[joinKeys[0]];
                j_alias = key;
                if (typeof j_table !== "string")
                    throw "\nIssue with select. \nJoin type must be a string table name but got -> " + JSON.stringify({ [key]: val });
                j_selectParams.select = val.select || "*";
                j_filter = val.filter || {};
                j_selectParams.limit = val.limit;
                j_selectParams.offset = val.offset;
                j_selectParams.orderBy = val.orderBy;
                j_path = val.$path;
            }
            else {
                j_selectParams.select = val;
                j_alias = key;
                j_table = key;
            }
        }
        if (!j_table)
            throw "j_table missing";
        const _thisJoinedTable = _this.dboBuilder.dbo[j_table];
        if (!_thisJoinedTable) {
            throw `Joined table ${JSON.stringify(j_table)} is disallowed or inexistent \nOr you've forgot to put the function arguments into an array`;
        }
        let isLocal = true;
        if (localParams && (localParams.socket || localParams.httpReq)) {
            isLocal = false;
            j_tableRules = await _this.dboBuilder.publishParser?.getValidatedRequestRuleWusr({ tableName: j_table, command: "find", localParams });
        }
        if (isLocal || j_tableRules) {
            const joinQuery = await getNewQuery(_thisJoinedTable, j_filter, { ...j_selectParams, alias: j_alias }, param3_unused, j_tableRules, localParams, columns);
            joinQuery.isLeftJoin = j_isLeftJoin;
            joinQuery.tableAlias = j_alias;
            joinQuery.$path = j_path;
            joinQueries.push(joinQuery);
            // console.log(joinQuery)
        }
    });
    /**
     * Add non selected columns
     * This ensures all fields are available for orderBy in case of nested select
     * */
    Array.from(new Set([...allowedSelectFields, ...allowedOrderByFields])).map(key => {
        if (!sBuilder.select.find(s => s.alias === key && s.type === "column")) {
            sBuilder.addColumn(key, false);
        }
    });
    let select = sBuilder.select;
    // const validatedAggAliases = select
    //   .filter(s => s.type !== "joinedColumn")
    //   .map(s => s.alias);
    const filterOpts = await _this.prepareWhere({
        filter,
        select,
        forcedFilter: (0, utils_1.get)(tableRules, "select.forcedFilter"),
        filterFields: (0, utils_1.get)(tableRules, "select.filterFields"),
        tableAlias: selectParams.alias,
        localParams,
        tableRule: tableRules
    });
    const where = filterOpts.where;
    const p = _this.getValidatedRules(tableRules, localParams);
    let resQuery = {
        /** Why was this the case? */
        // allFields: allowedSelectFields,
        allFields: _this.column_names.slice(0),
        select,
        table: _this.name,
        joins: joinQueries,
        where,
        having: "",
        isLeftJoin: false,
        // having: cond.having,
        limit: _this.prepareLimitQuery(selectParams.limit, p),
        orderByItems: _this.prepareSortItems(selectParams.orderBy, allowedOrderByFields, selectParams.alias, select),
        offset: _this.prepareOffsetQuery(selectParams.offset)
    };
    // console.log(resQuery);
    // console.log(buildJoinQuery(_this, resQuery));
    return resQuery;
}
exports.getNewQuery = getNewQuery;
//# sourceMappingURL=QueryBuilder.js.map
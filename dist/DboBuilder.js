"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TS_PG_Types = exports.isPlainObject = exports.DboBuilder = exports.TableHandler = exports.ViewHandler = exports.EXISTS_KEYS = exports.pgp = void 0;
const Bluebird = require("bluebird");
const pgPromise = require("pg-promise");
const prostgles_types_1 = require("prostgles-types");
const utils_1 = require("./utils");
const QueryBuilder_1 = require("./QueryBuilder");
const Prostgles_1 = require("./Prostgles");
const PubSubManager_1 = require("./PubSubManager");
const Filtering_1 = require("./Filtering");
exports.pgp = pgPromise({
    promiseLib: Bluebird
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});
function replaceNonAlphaNumeric(string) {
    return string.replace(/[\W_]+/g, "_");
}
function capitalizeFirstLetter(string) {
    return replaceNonAlphaNumeric(string).charAt(0).toUpperCase() + string.slice(1);
}
function snakify(str, capitalize = false) {
    return str.split("").map((c, i) => {
        if (!i) {
            if (capitalize)
                c = c.toUpperCase();
            if (c.match(/[^a-z_A-Z]/)) {
                return ((capitalize) ? "D_" : "_") + c.charCodeAt(0);
            }
        }
        else {
            if (c.match(/[^a-zA-Z_0-9]/)) {
                return "_" + c.charCodeAt(0);
            }
        }
        return c;
    }).join("");
}
function escapeTSNames(str, capitalize = true) {
    let res = str;
    res = (capitalize ? str[0].toUpperCase() : str[0]) + str.slice(1);
    return JSON.stringify(res);
}
const shortestPath_1 = require("./shortestPath");
/* DEBUG CLIENT ERRORS HERE */
function makeErr(err, localParams) {
    // console.trace(err)
    if (process.env.TEST_TYPE || process.env.PRGL_DEBUG)
        console.trace(err);
    return Promise.reject(Object.assign(Object.assign(Object.assign(Object.assign({}, ((!localParams || !localParams.socket) ? err : {})), PubSubManager_1.filterObj(err, ["column", "code", "table", "constraint"])), (err && err.toString ? { txt: err.toString() } : {})), { code_info: sqlErrCodeToMsg(err.code) }));
}
exports.EXISTS_KEYS = ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];
function parseError(e) {
    // console.trace("INTERNAL ERROR: ", e);
    let res = (!Object.keys(e || {}).length ? e : (e && e.toString) ? e.toString() : e);
    if (isPlainObject(e))
        res = JSON.stringify(e, null, 2);
    return "INTERNAL ERROR: " + res;
}
class ColSet {
    constructor(columns, tableName) {
        this.opts = { columns, tableName, colNames: columns.map(c => c.name) };
    }
    getRow(data, allowedCols) {
        const badCol = allowedCols.find(c => !this.opts.colNames.includes(c));
        if (!allowedCols || badCol) {
            throw "Missing or unexpected columns: " + badCol;
        }
        if (prostgles_types_1.isEmpty(data))
            throw "No data";
        const row = PubSubManager_1.filterObj(data, allowedCols), rowKeys = Object.keys(row);
        return rowKeys.map(key => {
            const col = this.opts.columns.find(c => c.name === key);
            if (!col)
                throw "Unexpected missing col name";
            const colIsJSON = ["json", "jsonb"].includes(col.data_type);
            return {
                escapedCol: prostgles_types_1.asName(key),
                escapedVal: exports.pgp.as.format(colIsJSON ? "$1:json" : "$1", [row[key]])
            };
        });
    }
    getInsertQuery(data, allowedCols) {
        return (Array.isArray(data) ? data : [data]).map(d => {
            const rowParts = this.getRow(d, allowedCols);
            const select = rowParts.map(r => r.escapedCol).join(", "), values = rowParts.map(r => r.escapedVal).join(", ");
            return `INSERT INTO ${prostgles_types_1.asName(this.opts.tableName)} (${select}) VALUES (${values})`;
        }).join(";\n") + " ";
    }
    getUpdateQuery(data, allowedCols) {
        return (Array.isArray(data) ? data : [data]).map(d => {
            const rowParts = this.getRow(d, allowedCols);
            return `UPDATE ${prostgles_types_1.asName(this.opts.tableName)} SET ` + rowParts.map(r => `${r.escapedCol} = ${r.escapedVal} `).join(",\n");
        }).join(";\n") + " ";
    }
}
class ViewHandler {
    constructor(db, tableOrViewInfo, pubSubManager, dboBuilder, t, joinPaths) {
        this.tsColumnDefs = [];
        this.is_view = true;
        this.filterDef = "";
        if (!db || !tableOrViewInfo)
            throw "";
        this.db = db;
        this.t = t;
        this.joinPaths = joinPaths;
        this.tableOrViewInfo = tableOrViewInfo;
        this.name = tableOrViewInfo.name;
        this.escapedName = prostgles_types_1.asName(this.name);
        this.columns = tableOrViewInfo.columns;
        this.column_names = tableOrViewInfo.columns.map(c => c.name);
        this.pubSubManager = pubSubManager;
        this.dboBuilder = dboBuilder;
        this.joins = this.dboBuilder.joins;
        // fix this
        // and also make hot schema reload over ws 
        this.colSet = new ColSet(this.columns, this.name);
        const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;
        // this.tsDataName = snakify(this.name, true);
        // if(this.tsDataName === "T") this.tsDataName = this.tsDataName + "_";
        // this.tsDataDef = `export type ${this.tsDataName} = {\n`;
        this.columns.map(({ name, udt_name }) => {
            this.tsColumnDefs.push(`${escapeTSNames(name, false)}?: ${postgresToTsType(udt_name)};`);
        });
        // this.tsDataDef += "};";
        // this.tsDataDef += "\n";
        // this.tsDataDef += `export type ${this.tsDataName}_Filter = ${this.tsDataName} | object | { ${JSON.stringify($and_key)}: (${this.tsDataName} | object)[] } | { ${JSON.stringify($or_key)}: (${this.tsDataName} | object)[] } `;
        // this.filterDef = ` ${this.tsDataName}_Filter `;
        // const filterDef = this.filterDef;
        // this.tsDboDefs = [
        //     `   getColumns: () => Promise<any[]>;`,
        //     `   find: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<Partial<${this.tsDataName} & { [x: string]: any }>[]>;`,
        //     `   findOne: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<Partial<${this.tsDataName} & { [x: string]: any }>>;`,
        //     `   subscribe: (filter: ${filterDef}, params: SelectParams, onData: (items: Partial<${this.tsDataName} & { [x: string]: any }>[]) => any) => Promise<{ unsubscribe: () => any }>;`,
        //     `   subscribeOne: (filter: ${filterDef}, params: SelectParams, onData: (item: Partial<${this.tsDataName} & { [x: string]: any }>) => any) => Promise<{ unsubscribe: () => any }>;`,
        //     `   count: (filter?: ${filterDef}) => Promise<number>;`
        // ];
        // this.makeDef();
    }
    // makeDef(){
    //     this.tsDboName = `DBO_${snakify(this.name)}`;
    //     this.tsDboDef = `export type ${this.tsDboName} = {\n ${this.tsDboDefs.join("\n")} \n};\n`;
    // }
    getRowHashSelect(allowedFields, alias, tableAlias) {
        let allowed_cols = this.column_names;
        if (allowedFields)
            allowed_cols = this.parseFieldFilter(allowedFields);
        return "md5(" +
            allowed_cols
                /* CTID not available in AFTER trigger */
                // .concat(this.is_view? [] : ["ctid"])
                .sort()
                .map(f => (tableAlias ? (prostgles_types_1.asName(tableAlias) + ".") : "") + prostgles_types_1.asName(f))
                .map(f => `md5(coalesce(${f}::text, 'dd'))`)
                .join(" || ") +
            `)` + (alias ? ` as ${prostgles_types_1.asName(alias)}` : "");
    }
    getFullDef() {
        return [];
    }
    validateViewRules(fields, filterFields, returningFields, forcedFilter, rule) {
        return __awaiter(this, void 0, void 0, function* () {
            /* Safely test publish rules */
            if (fields) {
                try {
                    this.parseFieldFilter(fields);
                }
                catch (e) {
                    throw ` issue with publish.${this.name}.${rule}.fields: \nVALUE: ` + JSON.stringify(fields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
                }
            }
            if (filterFields) {
                try {
                    this.parseFieldFilter(filterFields);
                }
                catch (e) {
                    throw ` issue with publish.${this.name}.${rule}.filterFields: \nVALUE: ` + JSON.stringify(filterFields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
                }
            }
            if (returningFields) {
                try {
                    this.parseFieldFilter(returningFields);
                }
                catch (e) {
                    throw ` issue with publish.${this.name}.${rule}.returningFields: \nVALUE: ` + JSON.stringify(returningFields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
                }
            }
            if (forcedFilter) {
                try {
                    yield this.find(forcedFilter, { limit: 0 });
                }
                catch (e) {
                    throw ` issue with publish.${this.name}.${rule}.forcedFilter: \nVALUE: ` + JSON.stringify(forcedFilter, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
                }
            }
            return true;
        });
    }
    getShortestJoin(table1, table2, startAlias, isInner = false) {
        // let searchedTables = [], result; 
        // while (!result && searchedTables.length <= this.joins.length * 2){
        // }
        let toOne = true, query = this.joins.map(({ tables, on, type }, i) => {
            if (type.split("-")[1] === "many") {
                toOne = false;
            }
            const tl = `tl${startAlias + i}`, tr = `tr${startAlias + i}`;
            return `FROM ${tables[0]} ${tl} ${isInner ? "INNER" : "LEFT"} JOIN ${tables[1]} ${tr} ON ${Object.keys(on).map(lKey => `${tl}.${lKey} = ${tr}.${on[lKey]}`).join("\nAND ")}`;
        }).join("\n");
        return { query, toOne: false };
    }
    getJoins(source, target, path) {
        let result = [];
        if (!this.joinPaths)
            throw "Joins dissallowed";
        if (path && !path.length)
            throw `Empty join path ( $path ) specified for ${source} <-> ${target}`;
        /* Find the join path between tables */
        let jp;
        if (!path) {
            jp = this.joinPaths.find(j => path ? j.path.join() === path.join() : j.t1 === source && j.t2 === target);
        }
        else {
            jp = {
                t1: source,
                t2: target,
                path
            };
        }
        if (!jp || !this.joinPaths.find(j => path ? j.path.join() === path.join() : j.t1 === source && j.t2 === target))
            throw `Joining ${source} <-...-> ${target} dissallowed or missing`;
        /* Make the join chain info excluding root table */
        result = (path || jp.path).slice(1).map((t2, i, arr) => {
            const t1 = i === 0 ? source : arr[i - 1];
            if (!this.joins)
                this.joins = JSON.parse(JSON.stringify(this.dboBuilder.joins));
            /* Get join options */
            const jo = this.joins.find(j => j.tables.includes(t1) && j.tables.includes(t2));
            if (!jo)
                throw `Joining ${t1} <-> ${t2} dissallowed or missing`;
            ;
            let on = [];
            Object.keys(jo.on).map(leftKey => {
                const rightKey = jo.on[leftKey];
                /* Left table is joining on keys */
                if (jo.tables[0] === t1) {
                    on.push([leftKey, rightKey]);
                    /* Left table is joining on values */
                }
                else {
                    on.push([rightKey, leftKey]);
                }
            });
            return {
                source,
                target,
                table: t2,
                on
            };
        });
        return result;
    }
    checkFilter(filter) {
        if (filter === null || filter && !isPojoObject(filter))
            throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
    }
    getInfo(tableRules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const p = this.getValidatedRules(tableRules, localParams);
            if (!p.select.getInfo)
                throw "Not allowed";
            return {
                oid: this.tableOrViewInfo.oid,
                comment: this.tableOrViewInfo.comment,
            };
        });
    }
    // TODO: fix renamed table trigger problem
    getColumns(tableRules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const p = this.getValidatedRules(tableRules, localParams);
                if (!p.select.getColumns)
                    throw "Not allowed";
                // console.log("getColumns", this.name, this.columns.map(c => c.name))
                return this.columns.map(c => (Object.assign(Object.assign({}, c), { tsDataType: postgresToTsType(c.udt_name), insert: Boolean(p.insert && p.insert.fields && p.insert.fields.includes(c.name)), select: Boolean(p.select && p.select.fields && p.select.fields.includes(c.name)), filter: Boolean(p.select && p.select.filterFields && p.select.filterFields.includes(c.name)), update: Boolean(p.update && p.update.fields && p.update.fields.includes(c.name)), delete: Boolean(p.delete && p.delete.filterFields && p.delete.filterFields.includes(c.name)) })));
            }
            catch (e) {
                throw "Something went wrong in " + `db.${this.name}.getColumns()`;
            }
        });
    }
    getValidatedRules(tableRules, localParams) {
        if (utils_1.get(localParams, "socket") && !tableRules) {
            throw "INTERNAL ERROR: Unexpected case -> localParams && !tableRules";
        }
        /* Computed fields are allowed only if select is allowed */
        const allColumns = this.column_names.slice(0).map(fieldName => ({
            type: "column",
            name: fieldName,
            getQuery: ({ tableAlias }) => QueryBuilder_1.asNameAlias(fieldName, tableAlias),
            selected: false
        })).concat(QueryBuilder_1.COMPUTED_FIELDS.map(c => ({
            type: c.type,
            name: c.name,
            getQuery: ({ tableAlias, allowedFields }) => c.getQuery({
                allowedFields,
                ctidField: undefined,
                /* CTID not available in AFTER trigger */
                // ctidField: this.is_view? undefined : "ctid",
                tableAlias
            }),
            selected: false
        })));
        if (tableRules) {
            if (prostgles_types_1.isEmpty(tableRules))
                throw "INTERNAL ERROR: Unexpected case -> Empty table rules for " + this.name;
            const throwFieldsErr = (command, fieldType = "fields") => {
                throw `Invalid publish.${this.name}.${command} rule -> ${fieldType} setting is missing.\nPlease specify allowed ${fieldType} in this format: "*" | { col_name: false } | { col1: true, col2: true }`;
            }, getFirstSpecified = (...fieldParams) => {
                const firstValid = fieldParams.find(fp => fp !== undefined);
                return this.parseFieldFilter(firstValid);
            };
            let res = {
                allColumns
            };
            /* SELECT */
            if (tableRules.select) {
                if (!tableRules.select.fields)
                    return throwFieldsErr("select");
                let maxLimit = 1000;
                if (tableRules.select.maxLimit !== undefined) {
                    if (maxLimit !== null && (!Number.isInteger(maxLimit) || maxLimit < 0))
                        throw ` Invalid publish.${this.name}.select.maxLimit -> expecting   a positive integer OR null    but got ` + maxLimit;
                    maxLimit = tableRules.select.maxLimit;
                }
                res.select = {
                    fields: this.parseFieldFilter(tableRules.select.fields),
                    forcedFilter: Object.assign({}, tableRules.select.forcedFilter),
                    filterFields: this.parseFieldFilter(tableRules.select.filterFields),
                    getColumns: tableRules.select.getColumns,
                    getInfo: tableRules.select.getInfo,
                    maxLimit
                };
                if (res.select.getColumns === undefined)
                    res.select.getColumns = true;
                if (res.select.getInfo === undefined)
                    res.select.getInfo = true;
            }
            /* UPDATE */
            if (tableRules.update) {
                if (!tableRules.update.fields)
                    return throwFieldsErr("update");
                res.update = {
                    fields: this.parseFieldFilter(tableRules.update.fields),
                    forcedData: Object.assign({}, tableRules.update.forcedData),
                    forcedFilter: Object.assign({}, tableRules.update.forcedFilter),
                    returningFields: getFirstSpecified(tableRules.update.returningFields, utils_1.get(tableRules, "select.fields"), tableRules.update.fields),
                    filterFields: this.parseFieldFilter(tableRules.update.filterFields)
                };
            }
            /* INSERT */
            if (tableRules.insert) {
                if (!tableRules.insert.fields)
                    return throwFieldsErr("insert");
                res.insert = {
                    fields: this.parseFieldFilter(tableRules.insert.fields),
                    forcedData: Object.assign({}, tableRules.insert.forcedData),
                    returningFields: getFirstSpecified(tableRules.insert.returningFields, utils_1.get(tableRules, "select.fields"), tableRules.insert.fields)
                };
            }
            /* DELETE */
            if (tableRules.delete) {
                if (!tableRules.delete.filterFields)
                    return throwFieldsErr("delete", "filterFields");
                res.delete = {
                    forcedFilter: Object.assign({}, tableRules.delete.forcedFilter),
                    filterFields: this.parseFieldFilter(tableRules.delete.filterFields),
                    returningFields: getFirstSpecified(tableRules.delete.returningFields, utils_1.get(tableRules, "select.fields"), tableRules.delete.filterFields)
                };
            }
            return res;
        }
        else {
            const all_cols = this.column_names.slice(0);
            return {
                allColumns,
                select: {
                    fields: all_cols,
                    filterFields: all_cols,
                    forcedFilter: {},
                    maxLimit: null,
                    getColumns: true,
                    getInfo: true
                },
                update: {
                    fields: all_cols,
                    filterFields: all_cols,
                    forcedFilter: {},
                    forcedData: {},
                    returningFields: all_cols
                },
                insert: {
                    fields: all_cols,
                    forcedData: {},
                    returningFields: all_cols
                },
                delete: {
                    filterFields: all_cols,
                    forcedFilter: {},
                    returningFields: all_cols
                }
            };
        }
    }
    find(filter, selectParams, param3_unused = null, tableRules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                filter = filter || {};
                const { expectOne = false } = selectParams || {};
                const { testRule = false, returnQuery = false } = localParams || {};
                if (testRule)
                    return [];
                if (selectParams) {
                    const good_params = ["select", "orderBy", "offset", "limit", "expectOne", "having"];
                    const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
                    if (bad_params && bad_params.length)
                        throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
                }
                /* Validate publish */
                if (tableRules) {
                    let fields, filterFields, forcedFilter, maxLimit;
                    if (!tableRules.select)
                        throw "select rules missing for " + this.name;
                    fields = tableRules.select.fields;
                    forcedFilter = tableRules.select.forcedFilter;
                    filterFields = tableRules.select.filterFields;
                    maxLimit = tableRules.select.maxLimit;
                    if (tableRules.select !== "*" && typeof tableRules.select !== "boolean" && !isPlainObject(tableRules.select))
                        throw `\nINVALID publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`;
                    if (!fields)
                        throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;
                    if (maxLimit && !Number.isInteger(maxLimit))
                        throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;
                }
                let q = yield QueryBuilder_1.getNewQuery(this, filter, selectParams, param3_unused, tableRules, localParams), _query = QueryBuilder_1.makeQuery(this, q);
                // console.log(_query)
                if (testRule) {
                    try {
                        yield this.db.any("EXPLAIN " + _query);
                        return [];
                    }
                    catch (e) {
                        console.error(e);
                        throw `INTERNAL ERROR: Publish config is not valid for publish.${this.name}.select `;
                    }
                }
                // console.log(_query);
                if (returnQuery)
                    return _query;
                if (expectOne) {
                    return (this.t || this.db).oneOrNone(_query).catch(err => makeErr(err, localParams));
                }
                else {
                    return (this.t || this.db).any(_query).catch(err => makeErr(err, localParams));
                }
            }
            catch (e) {
                // console.trace(e)
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.find()` };
            }
        });
    }
    findOne(filter, selectParams, param3_unused, table_rules, localParams) {
        try {
            const expectOne = true;
            const { select = "*", orderBy = null, offset = 0 } = selectParams || {};
            if (selectParams) {
                const good_params = ["select", "orderBy", "offset"];
                const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
                if (bad_params && bad_params.length)
                    throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }
            return this.find(filter, { select, orderBy, limit: 1, offset, expectOne }, null, table_rules, localParams);
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.findOne()` };
        }
    }
    count(filter, param2_unused, param3_unused, table_rules, localParams = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            filter = filter || {};
            try {
                return yield this.find(filter, { select: "", limit: 0 }, null, table_rules, localParams)
                    .then((allowed) => __awaiter(this, void 0, void 0, function* () {
                    const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {};
                    const where = (yield this.prepareWhere({ filter, forcedFilter, filterFields, addKeywords: true, localParams, tableRule: table_rules }));
                    let query = "SELECT COUNT(*) FROM " + this.escapedName + " " + where;
                    return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ count }) => +count);
                }));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.count()` };
            }
        });
    }
    getAllowedSelectFields(selectParams = "*", allowed_cols, allow_empty = true) {
        let all_columns = this.column_names.slice(0), allowedFields = all_columns.slice(0), resultFields = [];
        if (selectParams) {
            resultFields = this.parseFieldFilter(selectParams, allow_empty);
        }
        if (allowed_cols) {
            allowedFields = this.parseFieldFilter(allowed_cols, allow_empty);
        }
        let col_names = (resultFields || []).filter(f => !allowedFields || allowedFields.includes(f));
        /* Maintain allowed cols order */
        if (selectParams === "*" && allowedFields && allowedFields.length)
            col_names = allowedFields;
        return col_names;
    }
    prepareColumnSet(selectParams = "*", allowed_cols, allow_empty = true, onlyNames = true) {
        let all_columns = this.column_names.slice(0);
        let col_names = this.getAllowedSelectFields(selectParams, all_columns, allow_empty);
        try {
            let colSet = new exports.pgp.helpers.ColumnSet(col_names);
            return onlyNames ? colSet.names : colSet;
        }
        catch (e) {
            throw e;
        }
    }
    prepareSelect(selectParams = "*", allowed_cols, allow_empty = true, tableAlias) {
        if (tableAlias) {
            let cs = this.prepareColumnSet(selectParams, allowed_cols, true, false);
            return cs.columns.map(col => `${this.escapedName}.${prostgles_types_1.asName(col.name)}`).join(", ");
        }
        else {
            return this.prepareColumnSet(selectParams, allowed_cols, true, true);
        }
    }
    prepareHaving(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return "";
        });
    }
    /**
     * Parses group or simple filter
     */
    prepareWhere(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { filter, select, forcedFilter, filterFields: ff, addKeywords = true, tableAlias = null, localParams, tableRule } = params;
            const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;
            let filterFields = ff;
            /* Local update allow all. TODO -> FIX THIS */
            if (!ff && !tableRule)
                filterFields = "*";
            const parseFullFilter = (f, parentFilter = null) => __awaiter(this, void 0, void 0, function* () {
                if (!f)
                    throw "Invalid/missing group filter provided";
                let result = "";
                let keys = Object.keys(f);
                if (!keys.length)
                    return result;
                if ((keys.includes($and_key) || keys.includes($or_key))) {
                    if (keys.length > 1)
                        throw `\ngroup filter must contain only one array property. e.g.: { ${$and_key}: [...] } OR { ${$or_key}: [...] } `;
                    if (parentFilter && Object.keys(parentFilter).includes(""))
                        throw "group filter ($and/$or) can only be placed at the root or within another group filter";
                }
                const { [$and_key]: $and, [$or_key]: $or } = f, group = $and || $or;
                if (group && group.length) {
                    const operand = $and ? " AND " : " OR ";
                    let conditions = (yield Promise.all(group.map((gf) => __awaiter(this, void 0, void 0, function* () { return yield parseFullFilter(gf, group); })))).filter(c => c);
                    if (conditions && conditions.length) {
                        if (conditions.length === 1)
                            return conditions.join(operand);
                        else
                            return ` ( ${conditions.sort().join(operand)} ) `;
                    }
                }
                else if (!group) {
                    result = yield this.getCondition({
                        filter: Object.assign({}, f),
                        select,
                        allowed_colnames: this.parseFieldFilter(filterFields),
                        tableAlias,
                        localParams,
                        tableRules: tableRule
                    });
                }
                return result;
            });
            if (!isPlainObject(filter))
                throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);
            let _filter = Object.assign({}, filter);
            if (forcedFilter) {
                _filter = {
                    [$and_key]: [forcedFilter, _filter].filter(f => f)
                };
            }
            // let keys = Object.keys(filter);
            // if(!keys.length) return result;
            let cond = yield parseFullFilter(_filter, null);
            if (cond && addKeywords)
                cond = "WHERE " + cond;
            return cond || "";
        });
    }
    prepareExistCondition(eConfig, localParams, tableRules) {
        return __awaiter(this, void 0, void 0, function* () {
            let res = "";
            const thisTable = this.name;
            let { f2, tables, isJoined } = eConfig;
            let t2 = tables[tables.length - 1];
            tables.forEach(t => {
                if (!this.dboBuilder.dbo[t])
                    throw "Invalid or dissallowed table: " + t;
            });
            /* Nested $exists not allowed */
            if (f2 && Object.keys(f2).find(fk => exports.EXISTS_KEYS.includes(fk))) {
                throw "Nested exists dissallowed";
            }
            const makeTableChain = (finalFilter) => {
                let joinPaths = [];
                tables.map((t2, depth) => {
                    let t1 = depth ? tables[depth - 1] : thisTable;
                    let exactPaths = [t1, t2];
                    if (!depth && eConfig.shortestJoin)
                        exactPaths = undefined;
                    joinPaths = joinPaths.concat(this.getJoins(t1, t2, exactPaths));
                });
                let r = makeJoin(joinPaths, 0);
                // console.log(r);
                return r;
                function makeJoin(paths, ji) {
                    const jp = paths[ji];
                    let prevTable = ji ? paths[ji - 1].table : jp.source;
                    let table = paths[ji].table;
                    let tableAlias = prostgles_types_1.asName(ji < paths.length - 1 ? `jd${ji}` : table);
                    let prevTableAlias = prostgles_types_1.asName(ji ? `jd${ji - 1}` : thisTable);
                    let cond = `${jp.on.map(([c1, c2]) => `${prevTableAlias}.${prostgles_types_1.asName(c1)} = ${tableAlias}.${prostgles_types_1.asName(c2)}`).join("\n AND ")}`;
                    // console.log(join, cond);
                    let j = `SELECT 1 \n` +
                        `FROM ${prostgles_types_1.asName(table)} ${tableAlias} \n` +
                        `WHERE ${cond} \n`; //
                    if (ji === paths.length - 1 &&
                        finalFilter) {
                        j += `AND ${finalFilter} \n`;
                    }
                    const indent = (a, b) => a;
                    if (ji < paths.length - 1) {
                        j += `AND ${makeJoin(paths, ji + 1)} \n`;
                    }
                    j = indent(j, ji + 1);
                    let res = `EXISTS ( \n` +
                        j +
                        `) \n`;
                    return indent(res, ji);
                }
            };
            let t2Rules = undefined, forcedFilter, filterFields, tableAlias;
            /* Check if allowed to view data */
            if (localParams && localParams.socket && this.dboBuilder.publishParser) {
                /* Need to think about joining through dissallowed tables */
                t2Rules = yield this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: t2, command: "find", socket: localParams.socket });
                if (!t2Rules || !t2Rules.select)
                    throw "Dissallowed";
                ({ forcedFilter, filterFields } = t2Rules.select);
            }
            let finalWhere;
            try {
                finalWhere = (yield this.dboBuilder.dbo[t2].prepareWhere({
                    filter: f2,
                    forcedFilter,
                    filterFields,
                    addKeywords: false,
                    tableAlias,
                    localParams,
                    tableRule: tableRules
                }));
            }
            catch (err) {
                // console.trace(err)
                throw "Issue with preparing $exists query for table " + t2 + "\n->" + JSON.stringify(err);
            }
            // console.log(f2, finalWhere);
            if (!isJoined) {
                res = ` EXISTS (SELECT 1 \nFROM ${prostgles_types_1.asName(t2)} \n${finalWhere ? `WHERE ${finalWhere}` : ""}) `;
            }
            else {
                res = makeTableChain(finalWhere);
            }
            return res;
        });
    }
    /**
     * parses a single filter
     * @example: { fff: 2 } => "fff" = 2
     *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
     */
    getCondition(params) {
        return __awaiter(this, void 0, void 0, function* () {
            const { filter, select, allowed_colnames, tableAlias, localParams, tableRules } = params;
            let data = Object.assign({}, filter);
            /* Exists join filter */
            const ERR = "Invalid exists filter. \nExpecting somethibng like: { $exists: { tableName.tableName2: Filter } } | { $exists: { \"**.tableName3\": Filter } }";
            const SP_WILDCARD = "**";
            let existsKeys = Object.keys(data)
                .filter(k => exports.EXISTS_KEYS.includes(k) && Object.keys(data[k] || {}).length)
                .map(key => {
                const isJoined = exports.EXISTS_KEYS.slice(-2).includes(key);
                let firstKey = Object.keys(data[key])[0], tables = firstKey.split("."), f2 = data[key][firstKey], shortestJoin = false;
                if (!isJoined) {
                    if (tables.length !== 1)
                        throw "Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }";
                }
                else {
                    /* First part can be the ** param meaning shortest join */
                    if (!tables.length)
                        throw ERR + "\nBut got: " + data[key];
                    if (tables[0] === SP_WILDCARD) {
                        tables = tables.slice(1);
                        shortestJoin = true;
                    }
                }
                return {
                    key,
                    existType: key,
                    isJoined,
                    shortestJoin,
                    f2,
                    tables
                };
            });
            /* Exists with exact path */
            // Object.keys(data).map(k => {
            //     let isthis = isPlainObject(data[k]) && !this.column_names.includes(k) && !k.split(".").find(kt => !this.dboBuilder.dbo[kt]);
            //     if(isthis) {
            //         existsKeys.push({
            //             key: k,
            //             notJoined: false,
            //             exactPaths: k.split(".")
            //         });
            //     }
            // });
            let existsCond = "";
            if (existsKeys.length) {
                existsCond = (yield Promise.all(existsKeys.map((k) => __awaiter(this, void 0, void 0, function* () { return yield this.prepareExistCondition(k, localParams, tableRules); })))).join(" AND ");
            }
            /* Computed field queries */
            const p = this.getValidatedRules(tableRules, localParams);
            const computedFields = p.allColumns.filter(c => c.type === "computed");
            let computedColConditions = [];
            Object.keys(data || {}).map(key => {
                const compCol = computedFields.find(cf => cf.name === key);
                if (compCol) {
                    computedColConditions.push(compCol.getQuery({
                        tableAlias,
                        allowedFields: p.select.fields,
                        /* CTID not available in AFTER trigger */
                        // ctidField: this.is_view? undefined : "ctid"
                        ctidField: undefined,
                    }) + ` = ${exports.pgp.as.format("$1", [data[key]])}`);
                    delete data[key];
                }
            });
            let allowedSelect = [];
            /* Select aliases take precedence over col names */
            if (select) {
                /* Allow filtering by selected fields/funcs */
                allowedSelect = select.filter(s => {
                    /*  */
                    if (["function", "computed", "column"].includes(s.type)) {
                        if (s.type !== "column" || allowed_colnames.includes(s.alias)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            // console.log(allowedSelect);
            /* Add remaining allowed fields */
            allowedSelect = allowedSelect.concat(p.allColumns.filter(c => allowed_colnames.includes(c.name) &&
                !allowedSelect.find(s => s.alias === c.name)).map(f => ({
                type: f.type,
                alias: f.name,
                getQuery: (tableAlias) => f.getQuery({ tableAlias, allowedFields: allowed_colnames }),
                selected: false,
                getFields: () => [f.name]
            })));
            let filterKeys = Object.keys(data).filter(k => !computedFields.find(cf => cf.name === k) && !existsKeys.find(ek => ek.key === k));
            // if(allowed_colnames){
            //     const aliasedColumns = (select || []).filter(s => 
            //         ["function", "computed", "column"].includes(s.type) && allowed_colnames.includes(s.alias) ||  
            //         s.getFields().find(f => allowed_colnames.includes(f))
            //     ).map(s => s.alias);
            //     const validCols = [...allowed_colnames, ...aliasedColumns];
            // }
            const validFieldNames = allowedSelect.map(s => s.alias);
            const invalidColumn = filterKeys
                .find(fName => !validFieldNames.find(c => c === fName ||
                (fName.startsWith(c) && (fName.slice(c.length).includes("->") ||
                    fName.slice(c.length).includes(".")))));
            if (invalidColumn) {
                throw `Table: ${this.name} -> disallowed/inexistent columns in filter: ${invalidColumn} \n  Expecting one of: ${allowedSelect.map(s => s.type === "column" ? s.getQuery() : s.alias).join(", ")}`;
            }
            /* TODO: Allow filter funcs */
            // const singleFuncs = FUNCTIONS.filter(f => f.singleColArg);
            const f = PubSubManager_1.filterObj(data, filterKeys);
            const q = Filtering_1.parseFilterItem({
                filter: f,
                tableAlias,
                pgp: exports.pgp,
                select: allowedSelect
            });
            // console.log({ f, q })
            let templates = [q].filter(q => q);
            if (existsCond)
                templates.push(existsCond);
            templates = templates.concat(computedColConditions);
            return templates.sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
                .join(" AND \n");
            // console.log(templates)
            // return templates; //pgp.as.format(template, data);
            /*
                SHOULD CHECK DATA TYPES TO AVOID "No operator matches the given data type" error
                console.log(table.columns)
            */
        });
    }
    /* This relates only to SELECT */
    prepareSort(orderBy, allowed_cols, tableAlias, excludeOrder = false, select) {
        let column_names = this.column_names.slice(0);
        const throwErr = () => {
            throw "\nInvalid orderBy option -> " + JSON.stringify(orderBy) +
                "\nExpecting { key2: false, key1: true } | { key1: 1, key2: -1 } | [{ key1: true }, { key2: false }] | [{ key1: 1 }, { key2: -1 }]";
        }, parseOrderObj = (orderBy, expectOne = false) => {
            if (!isPlainObject(orderBy))
                return throwErr();
            if (expectOne && Object.keys(orderBy).length > 1)
                throw "\nInvalid orderBy " + JSON.stringify(orderBy) +
                    "\nEach orderBy array element cannot have more than one key";
            /* { key2: bool, key1: bool } */
            if (!Object.values(orderBy).find(v => ![true, false].includes(v))) {
                return Object.keys(orderBy).map(key => ({ key, asc: Boolean(orderBy[key]) }));
            }
            else if (!Object.values(orderBy).find(v => ![-1, 1].includes(v))) {
                return Object.keys(orderBy).map(key => ({ key, asc: orderBy[key] === 1 }));
            }
            else if (!Object.values(orderBy).find(v => !["asc", "desc"].includes(v))) {
                return Object.keys(orderBy).map(key => ({ key, asc: orderBy[key] === "asc" }));
            }
            else
                return throwErr();
        };
        if (!orderBy)
            return "";
        let allowedFields = [];
        if (allowed_cols) {
            allowedFields = this.parseFieldFilter(allowed_cols);
        }
        let _ob = [];
        if (isPlainObject(orderBy)) {
            _ob = parseOrderObj(orderBy);
        }
        else if (typeof orderBy === "string") {
            /* string */
            _ob = [{ key: orderBy, asc: true }];
        }
        else if (Array.isArray(orderBy)) {
            /* Order by is formed of a list of ascending field names */
            let _orderBy = orderBy;
            if (_orderBy && !_orderBy.find(v => typeof v !== "string")) {
                /* [string] */
                _ob = _orderBy.map(key => ({ key, asc: true }));
            }
            else if (_orderBy.find(v => isPlainObject(v) && Object.keys(v).length)) {
                if (!_orderBy.find(v => typeof v.key !== "string" || typeof v.asc !== "boolean")) {
                    /* [{ key, asc }] */
                    _ob = Object.freeze(_orderBy);
                }
                else {
                    /* [{ [key]: asc }] | [{ [key]: -1 }] */
                    _ob = _orderBy.map(v => parseOrderObj(v, true)[0]);
                }
            }
            else
                return throwErr();
        }
        else
            return throwErr();
        if (!_ob || !_ob.length)
            return "";
        const validatedAggAliases = select.filter(s => s.type !== "joinedColumn").map(s => s.alias);
        // console.log({ validatedAggAliases })
        let bad_param = _ob.find(({ key }) => !(validatedAggAliases || []).includes(key) &&
            (!column_names.includes(key) ||
                (allowedFields.length && !allowedFields.includes(key))));
        if (!bad_param) {
            const selectedAliases = select.filter(s => s.selected).map(s => s.alias);
            return (excludeOrder ? "" : " ORDER BY ") + (_ob.map(({ key, asc }) => {
                /* Order by column index when possible to bypass name collision when ordering by a computed column.
                    (Postgres will sort by existing columns whenever possible)
                */
                const orderType = asc ? " ASC " : " DESC ";
                const index = selectedAliases.indexOf(key) + 1;
                const colKey = (index > 0) ? index : [tableAlias, key].filter(v => v).map(prostgles_types_1.asName).join(".");
                const res = `${colKey} ${orderType}`;
                return res;
            }).join(", "));
        }
        else {
            throw "Unrecognised orderBy fields or params: " + bad_param.key;
        }
    }
    /* This relates only to SELECT */
    prepareLimitQuery(limit, p) {
        if (limit !== undefined && limit !== null && !Number.isInteger(limit)) {
            throw "Unexpected LIMIT. Must be null or an integer";
        }
        let _limit = limit;
        /* If no limit then set as the lesser of (100, maxLimit) */
        if (_limit !== null && !Number.isInteger(_limit)) {
            _limit = [100, p.select.maxLimit].filter(Number.isInteger).sort((a, b) => a - b)[0];
        }
        else {
            /* If a limit higher than maxLimit specified throw error */
            if (Number.isInteger(p.select.maxLimit) && _limit > p.select.maxLimit) {
                throw "Unexpected LIMIT. Must be less than " + p.select.maxLimit;
            }
        }
        return _limit;
    }
    /* This relates only to SELECT */
    prepareOffsetQuery(offset) {
        if (Number.isInteger(offset)) {
            return offset;
        }
        return 0;
    }
    intersectColumns(allowedFields, dissallowedFields, fixIssues = false) {
        let result = [];
        if (allowedFields) {
            result = this.parseFieldFilter(allowedFields);
        }
        if (dissallowedFields) {
            const _dissalowed = this.parseFieldFilter(dissallowedFields);
            if (!fixIssues) {
                throw `dissallowed/invalid field found for ${this.name}: `;
            }
            result = result.filter(key => !_dissalowed.includes(key));
        }
        return result;
    }
    /**
    * Prepare and validate field object:
    * @example ({ item_id: 1 }, { user_id: 32 }) => { item_id: 1, user_id: 32 }
    * OR
    * ({ a: 1 }, { b: 32 }, ["c", "d"]) => throw "a field is not allowed"
    * @param {Object} obj - initial data
    * @param {Object} forcedData - set/override property
    * @param {string[]} allowed_cols - allowed columns (excluding forcedData) from table rules
    */
    prepareFieldValues(obj = {}, forcedData = {}, allowed_cols, fixIssues = false) {
        let column_names = this.column_names.slice(0);
        if (!column_names || !column_names.length)
            throw "table column_names mising";
        let _allowed_cols = column_names.slice(0);
        let _obj = Object.assign({}, obj);
        if (allowed_cols) {
            _allowed_cols = this.parseFieldFilter(allowed_cols, false);
        }
        let final_filter = Object.assign({}, _obj), filter_keys = Object.keys(final_filter);
        if (fixIssues && filter_keys.length) {
            final_filter = {};
            filter_keys
                .filter(col => _allowed_cols.includes(col))
                .map(col => {
                final_filter[col] = _obj[col];
            });
        }
        /* If has keys check against allowed_cols */
        if (final_filter && Object.keys(final_filter).length && _allowed_cols) {
            validateObj(final_filter, _allowed_cols);
        }
        if (forcedData && Object.keys(forcedData).length) {
            final_filter = Object.assign(Object.assign({}, final_filter), forcedData);
        }
        validateObj(final_filter, column_names.slice(0));
        return final_filter;
    }
    parseFieldFilter(fieldParams = "*", allow_empty = true, allowed_cols) {
        return ViewHandler._parseFieldFilter(fieldParams, allow_empty, allowed_cols || this.column_names.slice(0));
    }
    /**
    * Filter string array
    * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
    * @param {boolean} allow_empty - allow empty select. defaults to true
    */
    static _parseFieldFilter(fieldParams = "*", allow_empty = true, allowed_cols) {
        if (!allowed_cols)
            throw "allowed_cols missing";
        const all_fields = allowed_cols; // || this.column_names.slice(0);
        let colNames = null, initialParams = JSON.stringify(fieldParams);
        if (fieldParams) {
            /*
                "field1, field2, field4" | "*"
            */
            if (typeof fieldParams === "string") {
                fieldParams = fieldParams.split(",").map(k => k.trim());
            }
            /* string[] */
            if (Array.isArray(fieldParams) && !fieldParams.find(f => typeof f !== "string")) {
                /*
                    ["*"]
                */
                if (fieldParams[0] === "*") {
                    return all_fields.slice(0);
                    /*
                        [""]
                    */
                }
                else if (fieldParams[0] === "") {
                    if (allow_empty) {
                        return [""];
                    }
                    else {
                        throw "Empty value not allowed";
                    }
                    /*
                        ["field1", "field2", "field3"]
                    */
                }
                else {
                    colNames = fieldParams.slice(0);
                }
                /*
                    { field1: true, field2: true } = only field1 and field2
                    { field1: false, field2: false } = all fields except field1 and field2
                */
            }
            else if (isPlainObject(fieldParams)) {
                if (Object.keys(fieldParams).length) {
                    let keys = Object.keys(fieldParams);
                    if (keys[0] === "") {
                        if (allow_empty) {
                            return [""];
                        }
                        else {
                            throw "Empty value not allowed";
                        }
                    }
                    validate(keys);
                    keys.forEach(key => {
                        const allowedVals = [true, false, 0, 1];
                        if (!allowedVals.includes(fieldParams[key]))
                            throw `Invalid field selection value for: { ${key}: ${fieldParams[key]} }. \n Allowed values: ${allowedVals.join(" OR ")}`;
                    });
                    let allowed = keys.filter(key => fieldParams[key]), disallowed = keys.filter(key => !fieldParams[key]);
                    if (disallowed && disallowed.length) {
                        return all_fields.filter(col => !disallowed.includes(col));
                    }
                    else {
                        return [...allowed];
                    }
                }
                else {
                    return all_fields.slice(0);
                }
            }
            else {
                throw " Unrecognised field filter.\nExpecting any of:   string | string[] | { [field]: boolean } \n Received ->  " + initialParams;
            }
            validate(colNames);
        }
        return colNames;
        function validate(cols) {
            let bad_keys = cols.filter(col => !all_fields.includes(col));
            if (bad_keys && bad_keys.length) {
                throw "\nUnrecognised or illegal fields: " + bad_keys.join(", ");
            }
        }
    }
}
exports.ViewHandler = ViewHandler;
function isPojoObject(obj) {
    if (obj && (typeof obj !== "object" || Array.isArray(obj) || obj instanceof Date)) {
        return false;
    }
    return true;
}
class TableHandler extends ViewHandler {
    constructor(db, tableOrViewInfo, pubSubManager, dboBuilder, t, joinPaths) {
        super(db, tableOrViewInfo, pubSubManager, dboBuilder, t, joinPaths);
        this.prepareReturning = (returning, allowedFields, tableAlias) => __awaiter(this, void 0, void 0, function* () {
            let result = "";
            if (returning) {
                let sBuilder = new QueryBuilder_1.SelectItemBuilder({
                    allFields: this.column_names.slice(0),
                    allowedFields,
                    computedFields: QueryBuilder_1.COMPUTED_FIELDS,
                    functions: QueryBuilder_1.FUNCTIONS.filter(f => f.type === "function" && f.singleColArg),
                    isView: this.is_view
                });
                yield sBuilder.parseUserSelect(returning);
                if (sBuilder.select.length)
                    result = "RETURNING ";
                result += sBuilder.select.map(s => s.getQuery() + " AS " + QueryBuilder_1.asNameAlias(s.alias, tableAlias)).join(", ");
            }
            return result;
        });
        this.remove = this.delete;
        this.io_stats = {
            since: Date.now(),
            queries: 0,
            throttle_queries_per_sec: 500,
            batching: null
        };
        this.is_view = false;
    }
    /* TO DO: Maybe finished query batching */
    willBatch(query) {
        const now = Date.now();
        if (this.io_stats.since < Date.now()) {
            this.io_stats.since = Date.now();
            this.io_stats.queries = 0;
        }
        else {
            this.io_stats.queries++;
        }
        if (this.io_stats.queries > this.io_stats.throttle_queries_per_sec) {
            return true;
        }
    }
    subscribe(filter, params = {}, localFunc, table_rules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.is_view)
                    throw "Cannot subscribe to a view";
                if (this.t)
                    throw "subscribe not allowed within transactions";
                if (!localParams && !localFunc)
                    throw " missing data. provide -> localFunc | localParams { socket } ";
                if (localParams && localParams.socket && localFunc) {
                    console.error({ localParams, localFunc });
                    throw " Cannot have localFunc AND socket ";
                }
                const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {}, condition = yield this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: null, localParams, tableRule: table_rules }), throttle = utils_1.get(params, "throttle") || 0, selectParams = PubSubManager_1.filterObj(params || {}, [], ["throttle"]);
                // const { subOne = false } = localParams || {};
                if (!localFunc) {
                    return yield this.find(filter, Object.assign(Object.assign({}, selectParams), { limit: 0 }), null, table_rules, localParams)
                        .then(isValid => {
                        const { socket = null } = localParams;
                        return this.pubSubManager.addSub({
                            table_info: this.tableOrViewInfo,
                            socket,
                            table_rules,
                            condition: condition,
                            func: localFunc,
                            filter: Object.assign({}, filter),
                            params: Object.assign({}, selectParams),
                            channel_name: null,
                            socket_id: socket.id,
                            table_name: this.name,
                            throttle,
                            last_throttled: 0,
                        }).then(channelName => ({ channelName }));
                    });
                }
                else {
                    this.pubSubManager.addSub({
                        table_info: this.tableOrViewInfo,
                        socket: null,
                        table_rules,
                        condition,
                        func: localFunc,
                        filter: Object.assign({}, filter),
                        params: Object.assign({}, selectParams),
                        channel_name: null,
                        socket_id: null,
                        table_name: this.name,
                        throttle,
                        last_throttled: 0,
                    }).then(channelName => ({ channelName }));
                    const unsubscribe = () => {
                        this.pubSubManager.removeLocalSub(this.name, condition, localFunc);
                    };
                    let res = Object.freeze({ unsubscribe });
                    return res;
                }
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.subscribe()` };
            }
        });
    }
    subscribeOne(filter, params = {}, localFunc, table_rules, localParams) {
        let func = localParams ? undefined : (rows) => localFunc(rows[0]);
        return this.subscribe(filter, Object.assign(Object.assign({}, params), { limit: 2 }), func, table_rules, localParams);
    }
    updateBatch(data, params, tableRules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const queries = yield Promise.all(data.map(([filter, data]) => __awaiter(this, void 0, void 0, function* () {
                    return yield this.update(filter, data, Object.assign(Object.assign({}, (params || {})), { returning: undefined }), tableRules, Object.assign(Object.assign({}, (localParams || {})), { returnQuery: true }));
                })));
                // console.log(queries)
                return this.db.tx(t => {
                    const _queries = queries.map(q => t.none(q));
                    return t.batch(_queries);
                }).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.update()` };
            }
        });
    }
    update(filter, newData, params, tableRules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { testRule = false, returnQuery = false } = localParams || {};
                if (!testRule) {
                    if (!newData || !Object.keys(newData).length)
                        throw "no update data provided\nEXPECTING db.table.update(filter, updateData, options)";
                    this.checkFilter(filter);
                }
                let forcedFilter = {}, forcedData = {}, returningFields = "*", filterFields = "*", fields = "*";
                if (tableRules) {
                    if (!tableRules.update)
                        throw "update rules missing for " + this.name;
                    ({ forcedFilter, forcedData, returningFields, fields, filterFields } = tableRules.update);
                    if (!returningFields)
                        returningFields = utils_1.get(tableRules, "select.fields");
                    if (!fields)
                        throw ` Invalid update rule for ${this.name}. fields missing `;
                    /* Safely test publish rules */
                    if (testRule) {
                        yield this.validateViewRules(fields, filterFields, returningFields, forcedFilter, "update");
                        if (forcedData) {
                            try {
                                const { data, allowedCols } = this.validateNewData({ row: forcedData, forcedData: null, allowedFields: "*", tableRules, fixIssues: false });
                                const updateQ = this.colSet.getUpdateQuery(data, allowedCols); //pgp.helpers.update(data, columnSet)
                                let query = updateQ + " WHERE FALSE ";
                                yield this.db.any("EXPLAIN " + query);
                            }
                            catch (e) {
                                throw " issue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                            }
                        }
                        return true;
                    }
                }
                let { returning, multi = true, onConflictDoNothing = false, fixIssues = false } = params || {};
                if (params) {
                    const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
                    const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
                    if (bad_params && bad_params.length)
                        throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
                }
                /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
                let _fields = this.parseFieldFilter(fields);
                if (forcedFilter) {
                    let _forcedFilterKeys = Object.keys(forcedFilter);
                    _fields = _fields.filter(fkey => !_forcedFilterKeys.includes(fkey));
                }
                const { data, allowedCols } = this.validateNewData({ row: newData, forcedData, allowedFields: _fields, tableRules, fixIssues });
                /* Patch data */
                let patchedTextData = [];
                this.columns.map(c => {
                    const d = data[c.name];
                    if (c.data_type === "text" && d && isPlainObject(d) && !["from", "to"].find(key => typeof d[key] !== "number")) {
                        const unrecProps = Object.keys(d).filter(k => !["from", "to", "text", "md5"].includes(k));
                        if (unrecProps.length)
                            throw "Unrecognised params in textPatch field: " + unrecProps.join(", ");
                        patchedTextData.push(Object.assign(Object.assign({}, d), { fieldName: c.name }));
                    }
                    // console.log("update2", patchedTextData);
                });
                if (patchedTextData && patchedTextData.length) {
                    if (tableRules && !tableRules.select)
                        throw "Select needs to be permitted to patch data";
                    const rows = yield this.find(filter, { select: patchedTextData.reduce((a, v) => (Object.assign(Object.assign({}, a), { [v.fieldName]: 1 })), {}) }, null, tableRules);
                    // console.log(rows)
                    if (rows.length !== 1) {
                        throw "Cannot patch data within a filter that affects more/less than 1 row";
                    }
                    patchedTextData.map(p => {
                        data[p.fieldName] = prostgles_types_1.unpatchText(rows[0][p.fieldName], p);
                    });
                    // https://w3resource.com/PostgreSQL/overlay-function.p hp
                    //  overlay(coalesce(status, '') placing 'hom' from 2 for 0)
                }
                let nData = Object.assign({}, data);
                if (tableRules && tableRules.update && tableRules.update.validate) {
                    nData = yield tableRules.update.validate(nData);
                }
                let query = this.colSet.getUpdateQuery(nData, allowedCols); //pgp.helpers.update(nData, columnSet) + " ";
                query += (yield this.prepareWhere({
                    filter,
                    forcedFilter,
                    filterFields,
                    localParams,
                    tableRule: tableRules
                }));
                if (onConflictDoNothing)
                    query += " ON CONFLICT DO NOTHING ";
                let qType = "none";
                if (returning) {
                    qType = multi ? "any" : "one";
                    query += yield this.prepareReturning(returning, this.parseFieldFilter(returningFields));
                }
                // console.log(query)
                if (returnQuery)
                    return query;
                if (this.t) {
                    return this.t[qType](query).catch(err => makeErr(err, localParams));
                }
                return this.db.tx(t => t[qType](query)).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.update()` };
            }
        });
    }
    ;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }) {
        const synced_field = utils_1.get(tableRules || {}, "sync.synced_field");
        /* Update synced_field if sync is on and missing */
        if (synced_field && !row[synced_field]) {
            row[synced_field] = Date.now();
        }
        let data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
        const dataKeys = Object.keys(data);
        if (!data || !dataKeys.length) {
            // throw "missing/invalid data provided";
        }
        // let cs = new pgp.helpers.ColumnSet(this.columnSet.columns.filter(c => dataKeys.includes(c.name)), { table: this.name });
        return { data, allowedCols: this.columns.filter(c => dataKeys.includes(c.name)).map(c => c.name) };
    }
    insert(data, param2, param3_unused, tableRules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { returning, onConflictDoNothing, fixIssues = false } = param2 || {};
                const { testRule = false, returnQuery = false } = localParams || {};
                let returningFields, forcedData, validate, preValidate, fields;
                if (tableRules) {
                    if (!tableRules.insert)
                        throw "insert rules missing for " + this.name;
                    returningFields = tableRules.insert.returningFields;
                    forcedData = tableRules.insert.forcedData;
                    fields = tableRules.insert.fields;
                    validate = tableRules.insert.validate;
                    preValidate = tableRules.insert.preValidate;
                    /* If no returning fields specified then take select fields as returning */
                    if (!returningFields)
                        returningFields = utils_1.get(tableRules, "select.fields");
                    if (!returningFields)
                        returningFields = utils_1.get(tableRules, "insert.fields");
                    if (!fields)
                        throw ` invalid insert rule for ${this.name} -> fields missing `;
                    /* Safely test publish rules */
                    if (testRule) {
                        yield this.validateViewRules(fields, null, returningFields, null, "insert");
                        if (forcedData) {
                            const keys = Object.keys(forcedData);
                            if (keys.length) {
                                try {
                                    const values = exports.pgp.helpers.values(forcedData), colNames = this.prepareSelect(keys, this.column_names);
                                    yield this.db.any("EXPLAIN INSERT INTO " + this.escapedName + " (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { colNames, values });
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
                if (!data)
                    data = {}; //throw "Provide data in param1";
                let returningSelect = yield this.prepareReturning(returning, this.parseFieldFilter(returningFields));
                const makeQuery = (_row, isOne = false) => __awaiter(this, void 0, void 0, function* () {
                    let row = Object.assign({}, _row);
                    if (preValidate) {
                        row = yield preValidate(row);
                    }
                    if (!isPojoObject(row))
                        throw "\ninvalid insert data provided -> " + JSON.stringify(row);
                    const { data, allowedCols } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
                    let _data = Object.assign({}, data);
                    if (validate) {
                        _data = yield validate(_data);
                    }
                    let insertQ = "";
                    if (!Object.keys(_data).length)
                        insertQ = `INSERT INTO ${prostgles_types_1.asName(this.name)} DEFAULT VALUES `;
                    else
                        insertQ = this.colSet.getInsertQuery(_data, allowedCols); // pgp.helpers.insert(_data, columnSet); 
                    return insertQ + conflict_query + returningSelect;
                });
                if (param2) {
                    const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
                    const bad_params = Object.keys(param2).filter(k => !good_params.includes(k));
                    if (bad_params && bad_params.length)
                        throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
                }
                let query = "";
                let queryType = "none";
                if (Array.isArray(data)) {
                    // if(returning) throw "Sorry but [returning] is dissalowed for multi insert";
                    let queries = yield Promise.all(data.map((p) => __awaiter(this, void 0, void 0, function* () {
                        const q = yield makeQuery(p);
                        return q;
                    })));
                    // console.log(queries)
                    query = exports.pgp.helpers.concat(queries);
                    if (returning)
                        queryType = "many";
                }
                else {
                    query = yield makeQuery(data, true);
                    if (returning)
                        queryType = "one";
                }
                // console.log(query);
                if (returnQuery)
                    return query;
                if (this.t)
                    return this.t[queryType](query).catch(err => makeErr(err, localParams));
                return this.db.tx(t => t[queryType](query)).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.insert()` };
            }
        });
    }
    ;
    delete(filter, params, param3_unused, table_rules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { returning } = params || {};
                filter = filter || {};
                this.checkFilter(filter);
                // table_rules = table_rules || {};
                let forcedFilter = {}, filterFields = "*", returningFields = "*";
                const { testRule = false, returnQuery = false } = localParams || {};
                if (table_rules) {
                    if (!table_rules.delete)
                        throw "delete rules missing";
                    forcedFilter = table_rules.delete.forcedFilter;
                    filterFields = table_rules.delete.filterFields;
                    returningFields = table_rules.delete.returningFields;
                    if (!returningFields)
                        returningFields = utils_1.get(table_rules, "select.fields");
                    if (!returningFields)
                        returningFields = utils_1.get(table_rules, "delete.filterFields");
                    if (!filterFields)
                        throw ` Invalid delete rule for ${this.name}. filterFields missing `;
                    /* Safely test publish rules */
                    if (testRule) {
                        yield this.validateViewRules(null, filterFields, returningFields, forcedFilter, "delete");
                        return true;
                    }
                }
                if (params) {
                    const good_params = ["returning"];
                    const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
                    if (bad_params && bad_params.length)
                        throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
                }
                let queryType = 'none';
                let _query = "DELETE FROM " + this.escapedName;
                _query += (yield this.prepareWhere({
                    filter,
                    forcedFilter,
                    filterFields,
                    localParams,
                    tableRule: table_rules
                }));
                if (returning) {
                    queryType = "any";
                    if (!returningFields) {
                        throw "Returning dissallowed";
                    }
                    _query += yield this.prepareReturning(returning, this.parseFieldFilter(returningFields));
                }
                if (returnQuery)
                    return _query;
                return (this.t || this.db)[queryType](_query).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                // console.trace(e)
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.delete()` };
            }
        });
    }
    ;
    remove(filter, params, param3_unused, tableRules, localParams = null) {
        return this.delete(filter, params, param3_unused, tableRules, localParams);
    }
    upsert(filter, newData, params, table_rules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                /* Do it within a transaction to ensure consisency */
                if (!this.t) {
                    return this.dboBuilder.getTX(dbTX => _upsert(dbTX[this.name]));
                }
                else {
                    return _upsert(this);
                }
                function _upsert(tblH) {
                    return __awaiter(this, void 0, void 0, function* () {
                        return tblH.find(filter, { select: "", limit: 1 }, {}, table_rules, localParams)
                            .then(exists => {
                            if (exists && exists.length) {
                                // console.log(filter, "exists");
                                return tblH.update(filter, newData, params, table_rules, localParams);
                            }
                            else {
                                // console.log(filter, "existnts")
                                return tblH.insert(Object.assign(Object.assign({}, newData), filter), params, null, table_rules, localParams);
                            }
                        });
                    });
                }
                // .catch(existnts => {
                //     console.log(filter, "existnts")
                //     return this.insert({ ...filter, ...newData}, params);
                // });
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.upsert()` };
            }
        });
    }
    ;
    /* External request. Cannot sync from server */
    sync(filter, params, param3_unused, table_rules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!localParams)
                throw "Sync not allowed within the same server code";
            const { socket } = localParams;
            if (!socket)
                throw "INTERNAL ERROR: socket missing";
            if (!table_rules || !table_rules.sync || !table_rules.select)
                throw "INTERNAL ERROR: sync or select rules missing";
            if (this.t)
                throw "Sync not allowed within transactions";
            const ALLOWED_PARAMS = ["select"];
            const invalidParams = Object.keys(params || {}).filter(k => !ALLOWED_PARAMS.includes(k));
            if (invalidParams.length)
                throw "Invalid or dissallowed params found: " + invalidParams.join(", ");
            try {
                let { id_fields, synced_field, allow_delete } = table_rules.sync;
                const syncFields = [...id_fields, synced_field];
                if (!id_fields || !synced_field) {
                    const err = "INTERNAL ERROR: id_fields OR synced_field missing from publish";
                    console.error(err);
                    throw err;
                }
                id_fields = this.parseFieldFilter(id_fields, false);
                let allowedSelect = this.parseFieldFilter(utils_1.get(table_rules, "select.fields"), false);
                if (syncFields.find(f => !allowedSelect.includes(f))) {
                    throw `INTERNAL ERROR: sync field missing from publish.${this.name}.select.fields`;
                }
                let select = this.getAllowedSelectFields(utils_1.get(params || {}, "select") || "*", allowedSelect, false);
                if (!select.length)
                    throw "Empty select not allowed";
                /* Add sync fields if missing */
                syncFields.map(sf => {
                    if (!select.includes(sf))
                        select.push(sf);
                });
                /* Step 1: parse command and params */
                return this.find(filter, { select, limit: 0 }, null, table_rules, localParams)
                    .then((isValid) => __awaiter(this, void 0, void 0, function* () {
                    const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {};
                    const condition = yield this.prepareWhere({ filter, forcedFilter, filterFields, addKeywords: false, localParams, tableRule: table_rules });
                    // let final_filter = getFindFilter(filter, table_rules);
                    return this.pubSubManager.addSync({
                        table_info: this.tableOrViewInfo,
                        condition,
                        id_fields, synced_field, allow_delete,
                        socket,
                        table_rules,
                        filter: Object.assign({}, filter),
                        params: { select }
                    }).then(channelName => ({ channelName, id_fields, synced_field }));
                }));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: parseError(e), msg: `Issue with dbo.${this.name}.sync()` };
            }
            /*
            REPLICATION

                1 Sync proccess (NO DELETES ALLOWED):

                    Client sends:
                        "sync-request"
                        { min_id, max_id, count, max_synced }

                        Server sends:
                            "sync-pull"
                            { from_synced }

                        Client sends:
                            "sync-push"
                            { data } -> WHERE synced >= from_synced

                        Server upserts:
                            WHERE not exists synced = synced AND id = id
                            UNTIL

                        Server sends
                            "sync-push"
                            { data } -> WHERE synced >= from_synced
                */
        });
    }
}
exports.TableHandler = TableHandler;
const Prostgles_2 = require("./Prostgles");
class DboBuilder {
    constructor(prostgles) {
        this.schema = "public";
        this.init = () => __awaiter(this, void 0, void 0, function* () {
            let onSchemaChange;
            if (this.prostgles.watchSchema) {
                onSchemaChange = (event) => {
                    this.prostgles.onSchemaChange(event);
                };
            }
            this.pubSubManager = yield PubSubManager_1.PubSubManager.create({
                dboBuilder: this,
                db: this.db,
                dbo: this.dbo,
                onSchemaChange
            });
            yield this.build();
            return this;
        });
        this.getTX = (dbTX) => {
            return this.db.tx((t) => {
                let txDB = {};
                this.tablesOrViews.map(tov => {
                    if (tov.is_view) {
                        txDB[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager, this, t, this.joinPaths);
                    }
                    else {
                        txDB[tov.name] = new TableHandler(this.db, tov, this.pubSubManager, this, t, this.joinPaths);
                    }
                });
                return dbTX(txDB);
            });
        };
        this.prostgles = prostgles;
        this.db = this.prostgles.db;
        this.schema = this.prostgles.schema || "public";
        this.dbo = {};
        // this.joins = this.prostgles.joins;
    }
    getJoins() {
        return this.joins;
    }
    getJoinPaths() {
        return this.joinPaths;
    }
    parseJoins() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.prostgles.joins) {
                let _joins = yield this.prostgles.joins;
                if (typeof _joins === "string" && _joins === "inferred") {
                    _joins = yield getInferredJoins(this.db, this.prostgles.schema);
                }
                let joins = JSON.parse(JSON.stringify(_joins));
                this.joins = joins;
                // console.log(joins);
                // Validate joins
                try {
                    // 1 find duplicates
                    const dup = joins.find(j => j.tables[0] === j.tables[1] ||
                        joins.find(jj => j.tables.join() !== jj.tables.join() &&
                            j.tables.slice().sort().join() === jj.tables.slice().sort().join()));
                    if (dup) {
                        throw "Duplicate join declaration for table: " + dup.tables[0];
                    }
                    const tovNames = this.tablesOrViews.map(t => t.name);
                    // 2 find incorrect tables
                    const missing = Prostgles_1.flat(joins.map(j => j.tables)).find(t => !tovNames.includes(t));
                    if (missing) {
                        throw "Table not found: " + missing;
                    }
                    // 3 find incorrect fields
                    joins.map(({ tables, on }) => {
                        const t1 = tables[0], t2 = tables[1], f1s = Object.keys(on), f2s = Object.values(on);
                        [[t1, f1s], [t2, f2s]].map(v => {
                            var t = v[0], f = v[1];
                            let tov = this.tablesOrViews.find(_t => _t.name === t);
                            if (!tov)
                                throw "Table not found: " + t;
                            const m1 = f.filter(k => !tov.columns.map(c => c.name).includes(k));
                            if (m1 && m1.length) {
                                throw `Table ${t}(${tov.columns.map(c => c.name).join()}) has no fields named: ${m1.join()}`;
                            }
                        });
                    });
                    // 4 find incorrect/missing join types
                    const expected_types = " \n\n-> Expecting: " + Prostgles_2.JOIN_TYPES.map(t => JSON.stringify(t)).join(` | `);
                    const mt = joins.find(j => !j.type);
                    if (mt)
                        throw "Join type missing for: " + JSON.stringify(mt, null, 2) + expected_types;
                    const it = joins.find(j => !Prostgles_2.JOIN_TYPES.includes(j.type));
                    if (it)
                        throw "Incorrect join type for: " + JSON.stringify(it, null, 2) + expected_types;
                }
                catch (e) {
                    console.error("JOINS VALIDATION ERROR \n-> ", e);
                }
                // Make joins graph
                this.joinGraph = {};
                this.joins.map(({ tables }) => {
                    let _t = tables.slice().sort(), t1 = _t[0], t2 = _t[1];
                    this.joinGraph[t1] = this.joinGraph[t1] || {};
                    this.joinGraph[t1][t2] = 1;
                    this.joinGraph[t2] = this.joinGraph[t2] || {};
                    this.joinGraph[t2][t1] = 1;
                });
                const tables = Prostgles_1.flat(this.joins.map(t => t.tables));
                this.joinPaths = [];
                tables.map(t1 => {
                    tables.map(t2 => {
                        const spath = shortestPath_1.findShortestPath(this.joinGraph, t1, t2);
                        if (spath && spath.distance < Infinity) {
                            if (!this.joinPaths.find(j => j.t1 === t1 && j.t2 === t2)) {
                                this.joinPaths.push({ t1, t2, path: spath.path });
                            }
                            if (!this.joinPaths.find(j => j.t2 === t1 && j.t1 === t2)) {
                                this.joinPaths.push({ t1: t2, t2: t1, path: spath.path.slice().reverse() });
                            }
                        }
                    });
                });
                // console.log(this.joinPaths)
                // console.log(888, this.prostgles.joins);
                // console.log(this.joinGraph, findShortestPath(this.joinGraph, "colors", "drawings"));
            }
            return this.joinPaths;
        });
    }
    buildJoinPaths() {
    }
    build() {
        return __awaiter(this, void 0, void 0, function* () {
            // await this.pubSubManager.init()
            this.tablesOrViews = yield getTablesForSchemaPostgresSQL(this.db); //, this.schema
            // console.log(this.tablesOrViews.map(t => `${t.name} (${t.columns.map(c => c.name).join(", ")})`))
            const common_types = `

import { ViewHandler, TableHandler, JoinMaker } from "prostgles-types";

export type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>)
};

`;
            this.dboDefinition = `export type DBObj = {\n`;
            yield this.parseJoins();
            let joinTableNames = [];
            let allDataDefs = "";
            this.tablesOrViews.map(tov => {
                // console.log("dboInit", tov.name, tov.columns.map(c => c.name))
                const filterKeywords = Object.values(this.prostgles.keywords);
                const $filterCol = tov.columns.find(c => filterKeywords.includes(c.name));
                if ($filterCol) {
                    throw `DboBuilder init error: \n\nTable ${JSON.stringify(tov.name)} column ${JSON.stringify($filterCol.name)} is colliding with Prostgles filtering functionality ($filter keyword)
                Please provide a replacement keyword name using the $filter_keyName init option. 
                Alternatively you can rename the table column\n`;
                }
                const TSTableDataName = snakify(tov.name, true);
                const TSTableHandlerName = JSON.stringify(tov.name);
                if (tov.is_view) {
                    this.dbo[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager, this, null, this.joinPaths);
                    this.dboDefinition += `  ${TSTableHandlerName}: ViewHandler<${TSTableDataName}> \n`;
                }
                else {
                    this.dbo[tov.name] = new TableHandler(this.db, tov, this.pubSubManager, this, null, this.joinPaths);
                    this.dboDefinition += `  ${TSTableHandlerName}: TableHandler<${TSTableDataName}> \n`;
                }
                allDataDefs += `export type ${TSTableDataName} = { \n` +
                    this.dbo[tov.name].tsColumnDefs.map(str => `  ` + str).join("\n") +
                    `\n}\n`;
                // this.dboDefinition += ` ${escapeTSNames(tov.name, false)}: ${(this.dbo[tov.name] as TableHandler).tsDboName};\n`;
                if (this.joinPaths && this.joinPaths.find(jp => [jp.t1, jp.t2].includes(tov.name))) {
                    let table = tov.name;
                    joinTableNames.push(table);
                    this.dbo.innerJoin = this.dbo.innerJoin || {};
                    this.dbo.leftJoin = this.dbo.leftJoin || {};
                    this.dbo.innerJoinOne = this.dbo.innerJoinOne || {};
                    this.dbo.leftJoinOne = this.dbo.leftJoinOne || {};
                    this.dbo.leftJoin[table] = (filter, select, options = {}) => {
                        return makeJoin(true, filter, select, options);
                    };
                    this.dbo.innerJoin[table] = (filter, select, options = {}) => {
                        return makeJoin(false, filter, select, options);
                    };
                    this.dbo.leftJoinOne[table] = (filter, select, options = {}) => {
                        return makeJoin(true, filter, select, Object.assign(Object.assign({}, options), { limit: 1 }));
                    };
                    this.dbo.innerJoinOne[table] = (filter, select, options = {}) => {
                        return makeJoin(false, filter, select, Object.assign(Object.assign({}, options), { limit: 1 }));
                    };
                    function makeJoin(isLeft = true, filter, select, options) {
                        return Object.assign({ [isLeft ? "$leftJoin" : "$innerJoin"]: table, filter,
                            select }, options);
                    }
                }
            });
            let joinBuilderDef = "";
            if (joinTableNames.length) {
                joinBuilderDef += "export type JoinMakerTables = {\n";
                joinTableNames.map(tname => {
                    joinBuilderDef += ` ${JSON.stringify(tname)}: JoinMaker<${snakify(tname, true)}>;\n`;
                });
                joinBuilderDef += "};\n";
                ["leftJoin", "innerJoin", "leftJoinOne", "innerJoinOne"].map(joinType => {
                    this.dboDefinition += `  ${joinType}: JoinMakerTables;\n`;
                });
            }
            if (this.prostgles.transactions) {
                let txKey = "tx";
                if (typeof this.prostgles.transactions === "string")
                    txKey = this.prostgles.transactions;
                this.dboDefinition += ` ${txKey}: (t: TxCB) => Promise<any | void> ;\n`;
                this.dbo[txKey] = (cb) => this.getTX(cb);
            }
            this.dboDefinition += "};\n";
            this.tsTypesDefinition = [
                common_types,
                `/* SCHEMA DEFINITON. Table names have been altered to work with Typescript */`,
                allDataDefs,
                joinBuilderDef,
                `/* DBO Definition. Isomorphic */`,
                this.dboDefinition
            ].join("\n");
            return this.dbo;
            // let dbo = makeDBO(db, allTablesViews, pubSubManager, true);
        });
    }
}
exports.DboBuilder = DboBuilder;
DboBuilder.create = (prostgles) => __awaiter(void 0, void 0, void 0, function* () {
    let res = new DboBuilder(prostgles);
    return yield res.init();
});
// export async function makeDBO(db: DB): Promise<DbHandler> {
//     return await DBO.build(db, "public");
// }
/* UTILS */
/* UTILS */
function getTablesForSchemaPostgresSQL(db, schema = "public") {
    const query = `
    SELECT t.table_schema as schema, t.table_name as name 
    , cc.table_oid as oid
    , json_agg((SELECT x FROM (SELECT cc.column_name as name, cc.data_type, cc.udt_name, cc.element_type, cc.is_pkey, cc.comment, cc.ordinal_position, cc.is_nullable = 'YES' as is_nullable) as x) ORDER BY cc.ordinal_position ) as columns  
    , t.table_type = 'VIEW' as is_view 
    , array_to_json(vr.table_names) as parent_tables
    , obj_description(cc.table_oid::regclass) as comment
    FROM information_schema.tables t  
    INNER join (
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name, e.data_type as element_type
        ,  col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) as comment
        , EXISTS ( 
            SELECT 1    
            from information_schema.table_constraints as tc 
            JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema  
            WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type IN ('PRIMARY KEY') 
        ) as is_pkey
        , c.ordinal_position
        , format('%I.%I', c.table_schema, c.table_name)::regclass::oid AS table_oid
        , c.is_nullable
        FROM information_schema.columns c    
        LEFT JOIN (SELECT * FROM information_schema.element_types )   e  
            ON ((c.table_catalog, c.table_schema, c.table_name, 'TABLE', c.dtd_identifier)  
            = (e.object_catalog, e.object_schema, e.object_name, e.object_type, e.collection_type_identifier)
        )
    ) cc  
    ON t.table_name = cc.table_name  
    AND t.table_schema = cc.table_schema  
    LEFT JOIN ( 
        SELECT cl_r.relname as view_name, array_agg(DISTINCT cl_d.relname) AS table_names 
        FROM pg_rewrite AS r 
        JOIN pg_class AS cl_r ON r.ev_class=cl_r.oid 
        JOIN pg_depend AS d ON r.oid=d.objid 
        JOIN pg_class AS cl_d ON d.refobjid=cl_d.oid 
        WHERE cl_d.relkind IN ('r','v') 
        AND cl_d.relname <> cl_r.relname 
        GROUP BY cl_r.relname 
    ) vr 
    ON t.table_name = vr.view_name 
    WHERE t.table_schema = ${PubSubManager_1.asValue(schema)}
    GROUP BY t.table_schema, t.table_name, t.table_type, vr.table_names , cc.table_oid
    ORDER BY schema, name
    `;
    // console.log(pgp.as.format(query, { schema }), schema);
    return db.any(query, { schema });
}
/**
* Throw error if illegal keys found in object
* @param {Object} obj - Object to be checked
* @param {string[]} allowedKeys - The name of the employee.
*/
function validateObj(obj, allowedKeys) {
    if (obj && Object.keys(obj).length) {
        const invalid_keys = Object.keys(obj).filter(k => !allowedKeys.includes(k));
        if (invalid_keys.length) {
            throw "Invalid/Illegal fields found: " + invalid_keys.join(", ");
        }
    }
    return obj;
}
function isPlainObject(o) {
    return Object(o) === o && Object.getPrototypeOf(o) === Object.prototype;
}
exports.isPlainObject = isPlainObject;
const _PG_strings = ['bpchar', 'char', 'varchar', 'text', 'citext', 'uuid', 'bytea', 'inet', 'time', 'timetz', 'interval', 'name'];
const _PG_numbers = ['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money', 'oid'];
const _PG_json = ['json', 'jsonb'];
const _PG_bool = ['bool'];
const _PG_date = ['timestamp', 'timestamptz'];
exports.TS_PG_Types = {
    "string": _PG_strings,
    "number": _PG_numbers,
    "boolean": _PG_bool,
    "Object": _PG_json,
    "Date": _PG_date,
    "Array<number>": _PG_numbers.map(s => `_${s}`),
    "Array<boolean>": _PG_bool.map(s => `_${s}`),
    "Array<string>": _PG_strings.map(s => `_${s}`),
    "Array<Object>": _PG_json.map(s => `_${s}`),
    "Array<Date>": _PG_date.map(s => `_${s}`),
    "any": [],
};
function postgresToTsType(udt_data_type) {
    return Object.keys(exports.TS_PG_Types).find(k => {
        return exports.TS_PG_Types[k].includes(udt_data_type) || !exports.TS_PG_Types[k].length;
    });
}
function sqlErrCodeToMsg(code) {
    const errs = {
        "00000": "successful_completion",
        "01000": "warning",
        "0100C": "dynamic_result_sets_returned",
        "01008": "implicit_zero_bit_padding",
        "01003": "null_value_eliminated_in_set_function",
        "01007": "privilege_not_granted",
        "01006": "privilege_not_revoked",
        "01004": "string_data_right_truncation",
        "01P01": "deprecated_feature",
        "02000": "no_data",
        "02001": "no_additional_dynamic_result_sets_returned",
        "03000": "sql_statement_not_yet_complete",
        "08000": "connection_exception",
        "08003": "connection_does_not_exist",
        "08006": "connection_failure",
        "08001": "sqlclient_unable_to_establish_sqlconnection",
        "08004": "sqlserver_rejected_establishment_of_sqlconnection",
        "08007": "transaction_resolution_unknown",
        "08P01": "protocol_violation",
        "09000": "triggered_action_exception",
        "0A000": "feature_not_supported",
        "0B000": "invalid_transaction_initiation",
        "0F000": "locator_exception",
        "0F001": "invalid_locator_specification",
        "0L000": "invalid_grantor",
        "0LP01": "invalid_grant_operation",
        "0P000": "invalid_role_specification",
        "0Z000": "diagnostics_exception",
        "0Z002": "stacked_diagnostics_accessed_without_active_handler",
        "20000": "case_not_found",
        "21000": "cardinality_violation",
        "22000": "data_exception",
        "2202E": "array_subscript_error",
        "22021": "character_not_in_repertoire",
        "22008": "datetime_field_overflow",
        "22012": "division_by_zero",
        "22005": "error_in_assignment",
        "2200B": "escape_character_conflict",
        "22022": "indicator_overflow",
        "22015": "interval_field_overflow",
        "2201E": "invalid_argument_for_logarithm",
        "22014": "invalid_argument_for_ntile_function",
        "22016": "invalid_argument_for_nth_value_function",
        "2201F": "invalid_argument_for_power_function",
        "2201G": "invalid_argument_for_width_bucket_function",
        "22018": "invalid_character_value_for_cast",
        "22007": "invalid_datetime_format",
        "22019": "invalid_escape_character",
        "2200D": "invalid_escape_octet",
        "22025": "invalid_escape_sequence",
        "22P06": "nonstandard_use_of_escape_character",
        "22010": "invalid_indicator_parameter_value",
        "22023": "invalid_parameter_value",
        "2201B": "invalid_regular_expression",
        "2201W": "invalid_row_count_in_limit_clause",
        "2201X": "invalid_row_count_in_result_offset_clause",
        "2202H": "invalid_tablesample_argument",
        "2202G": "invalid_tablesample_repeat",
        "22009": "invalid_time_zone_displacement_value",
        "2200C": "invalid_use_of_escape_character",
        "2200G": "most_specific_type_mismatch",
        "22004": "null_value_not_allowed",
        "22002": "null_value_no_indicator_parameter",
        "22003": "numeric_value_out_of_range",
        "2200H": "sequence_generator_limit_exceeded",
        "22026": "string_data_length_mismatch",
        "22001": "string_data_right_truncation",
        "22011": "substring_error",
        "22027": "trim_error",
        "22024": "unterminated_c_string",
        "2200F": "zero_length_character_string",
        "22P01": "floating_point_exception",
        "22P02": "invalid_text_representation",
        "22P03": "invalid_binary_representation",
        "22P04": "bad_copy_file_format",
        "22P05": "untranslatable_character",
        "2200L": "not_an_xml_document",
        "2200M": "invalid_xml_document",
        "2200N": "invalid_xml_content",
        "2200S": "invalid_xml_comment",
        "2200T": "invalid_xml_processing_instruction",
        "23000": "integrity_constraint_violation",
        "23001": "restrict_violation",
        "23502": "not_null_violation",
        "23503": "foreign_key_violation",
        "23505": "unique_violation",
        "23514": "check_violation",
        "23P01": "exclusion_violation",
        "24000": "invalid_cursor_state",
        "25000": "invalid_transaction_state",
        "25001": "active_sql_transaction",
        "25002": "branch_transaction_already_active",
        "25008": "held_cursor_requires_same_isolation_level",
        "25003": "inappropriate_access_mode_for_branch_transaction",
        "25004": "inappropriate_isolation_level_for_branch_transaction",
        "25005": "no_active_sql_transaction_for_branch_transaction",
        "25006": "read_only_sql_transaction",
        "25007": "schema_and_data_statement_mixing_not_supported",
        "25P01": "no_active_sql_transaction",
        "25P02": "in_failed_sql_transaction",
        "25P03": "idle_in_transaction_session_timeout",
        "26000": "invalid_sql_statement_name",
        "27000": "triggered_data_change_violation",
        "28000": "invalid_authorization_specification",
        "28P01": "invalid_password",
        "2B000": "dependent_privilege_descriptors_still_exist",
        "2BP01": "dependent_objects_still_exist",
        "2D000": "invalid_transaction_termination",
        "2F000": "sql_routine_exception",
        "2F005": "function_executed_no_return_statement",
        "2F002": "modifying_sql_data_not_permitted",
        "2F003": "prohibited_sql_statement_attempted",
        "2F004": "reading_sql_data_not_permitted",
        "34000": "invalid_cursor_name",
        "38000": "external_routine_exception",
        "38001": "containing_sql_not_permitted",
        "38002": "modifying_sql_data_not_permitted",
        "38003": "prohibited_sql_statement_attempted",
        "38004": "reading_sql_data_not_permitted",
        "39000": "external_routine_invocation_exception",
        "39001": "invalid_sqlstate_returned",
        "39004": "null_value_not_allowed",
        "39P01": "trigger_protocol_violated",
        "39P02": "srf_protocol_violated",
        "39P03": "event_trigger_protocol_violated",
        "3B000": "savepoint_exception",
        "3B001": "invalid_savepoint_specification",
        "3D000": "invalid_catalog_name",
        "3F000": "invalid_schema_name",
        "40000": "transaction_rollback",
        "40002": "transaction_integrity_constraint_violation",
        "40001": "serialization_failure",
        "40003": "statement_completion_unknown",
        "40P01": "deadlock_detected",
        "42000": "syntax_error_or_access_rule_violation",
        "42601": "syntax_error",
        "42501": "insufficient_privilege",
        "42846": "cannot_coerce",
        "42803": "grouping_error",
        "42P20": "windowing_error",
        "42P19": "invalid_recursion",
        "42830": "invalid_foreign_key",
        "42602": "invalid_name",
        "42622": "name_too_long",
        "42939": "reserved_name",
        "42804": "datatype_mismatch",
        "42P18": "indeterminate_datatype",
        "42P21": "collation_mismatch",
        "42P22": "indeterminate_collation",
        "42809": "wrong_object_type",
        "428C9": "generated_always",
        "42703": "undefined_column",
        "42883": "undefined_function",
        "42P01": "undefined_table",
        "42P02": "undefined_parameter",
        "42704": "undefined_object",
        "42701": "duplicate_column",
        "42P03": "duplicate_cursor",
        "42P04": "duplicate_database",
        "42723": "duplicate_function",
        "42P05": "duplicate_prepared_statement",
        "42P06": "duplicate_schema",
        "42P07": "duplicate_table",
        "42712": "duplicate_alias",
        "42710": "duplicate_object",
        "42702": "ambiguous_column",
        "42725": "ambiguous_function",
        "42P08": "ambiguous_parameter",
        "42P09": "ambiguous_alias",
        "42P10": "invalid_column_reference",
        "42611": "invalid_column_definition",
        "42P11": "invalid_cursor_definition",
        "42P12": "invalid_database_definition",
        "42P13": "invalid_function_definition",
        "42P14": "invalid_prepared_statement_definition",
        "42P15": "invalid_schema_definition",
        "42P16": "invalid_table_definition",
        "42P17": "invalid_object_definition",
        "44000": "with_check_option_violation",
        "53000": "insufficient_resources",
        "53100": "disk_full",
        "53200": "out_of_memory",
        "53300": "too_many_connections",
        "53400": "configuration_limit_exceeded",
        "54000": "program_limit_exceeded",
        "54001": "statement_too_complex",
        "54011": "too_many_columns",
        "54023": "too_many_arguments",
        "55000": "object_not_in_prerequisite_state",
        "55006": "object_in_use",
        "55P02": "cant_change_runtime_param",
        "55P03": "lock_not_available",
        "57000": "operator_intervention",
        "57014": "query_canceled",
        "57P01": "admin_shutdown",
        "57P02": "crash_shutdown",
        "57P03": "cannot_connect_now",
        "57P04": "database_dropped",
        "58000": "system_error",
        "58030": "io_error",
        "58P01": "undefined_file",
        "58P02": "duplicate_file",
        "72000": "snapshot_too_old",
        "F0000": "config_file_error",
        "F0001": "lock_file_exists",
        "HV000": "fdw_error",
        "HV005": "fdw_column_name_not_found",
        "HV002": "fdw_dynamic_parameter_value_needed",
        "HV010": "fdw_function_sequence_error",
        "HV021": "fdw_inconsistent_descriptor_information",
        "HV024": "fdw_invalid_attribute_value",
        "HV007": "fdw_invalid_column_name",
        "HV008": "fdw_invalid_column_number",
        "HV004": "fdw_invalid_data_type",
        "HV006": "fdw_invalid_data_type_descriptors",
        "HV091": "fdw_invalid_descriptor_field_identifier",
        "HV00B": "fdw_invalid_handle",
        "HV00C": "fdw_invalid_option_index",
        "HV00D": "fdw_invalid_option_name",
        "HV090": "fdw_invalid_string_length_or_buffer_length",
        "HV00A": "fdw_invalid_string_format",
        "HV009": "fdw_invalid_use_of_null_pointer",
        "HV014": "fdw_too_many_handles",
        "HV001": "fdw_out_of_memory",
        "HV00P": "fdw_no_schemas",
        "HV00J": "fdw_option_name_not_found",
        "HV00K": "fdw_reply_handle",
        "HV00Q": "fdw_schema_not_found",
        "HV00R": "fdw_table_not_found",
        "HV00L": "fdw_unable_to_create_execution",
        "HV00M": "fdw_unable_to_create_reply",
        "HV00N": "fdw_unable_to_establish_connection",
        "P0000": "plpgsql_error",
        "P0001": "raise_exception",
        "P0002": "no_data_found",
        "P0003": "too_many_rows",
        "P0004": "assert_failure",
        "XX000": "internal_error",
        "XX001": "data_corrupted",
        "XX002": "index_corrupted"
    }, c2 = { "20000": "case_not_found", "21000": "cardinality_violation", "22000": "data_exception", "22001": "string_data_right_truncation", "22002": "null_value_no_indicator_parameter", "22003": "numeric_value_out_of_range", "22004": "null_value_not_allowed", "22005": "error_in_assignment", "22007": "invalid_datetime_format", "22008": "datetime_field_overflow", "22009": "invalid_time_zone_displacement_value", "22010": "invalid_indicator_parameter_value", "22011": "substring_error", "22012": "division_by_zero", "22013": "invalid_preceding_or_following_size", "22014": "invalid_argument_for_ntile_function", "22015": "interval_field_overflow", "22016": "invalid_argument_for_nth_value_function", "22018": "invalid_character_value_for_cast", "22019": "invalid_escape_character", "22021": "character_not_in_repertoire", "22022": "indicator_overflow", "22023": "invalid_parameter_value", "22024": "unterminated_c_string", "22025": "invalid_escape_sequence", "22026": "string_data_length_mismatch", "22027": "trim_error", "22030": "duplicate_json_object_key_value", "22031": "invalid_argument_for_sql_json_datetime_function", "22032": "invalid_json_text", "22033": "invalid_sql_json_subscript", "22034": "more_than_one_sql_json_item", "22035": "no_sql_json_item", "22036": "non_numeric_sql_json_item", "22037": "non_unique_keys_in_a_json_object", "22038": "singleton_sql_json_item_required", "22039": "sql_json_array_not_found", "23000": "integrity_constraint_violation", "23001": "restrict_violation", "23502": "not_null_violation", "23503": "foreign_key_violation", "23505": "unique_violation", "23514": "check_violation", "24000": "invalid_cursor_state", "25000": "invalid_transaction_state", "25001": "active_sql_transaction", "25002": "branch_transaction_already_active", "25003": "inappropriate_access_mode_for_branch_transaction", "25004": "inappropriate_isolation_level_for_branch_transaction", "25005": "no_active_sql_transaction_for_branch_transaction", "25006": "read_only_sql_transaction", "25007": "schema_and_data_statement_mixing_not_supported", "25008": "held_cursor_requires_same_isolation_level", "26000": "invalid_sql_statement_name", "27000": "triggered_data_change_violation", "28000": "invalid_authorization_specification", "34000": "invalid_cursor_name", "38000": "external_routine_exception", "38001": "containing_sql_not_permitted", "38002": "modifying_sql_data_not_permitted", "38003": "prohibited_sql_statement_attempted", "38004": "reading_sql_data_not_permitted", "39000": "external_routine_invocation_exception", "39001": "invalid_sqlstate_returned", "39004": "null_value_not_allowed", "40000": "transaction_rollback", "40001": "serialization_failure", "40002": "transaction_integrity_constraint_violation", "40003": "statement_completion_unknown", "42000": "syntax_error_or_access_rule_violation", "42501": "insufficient_privilege", "42601": "syntax_error", "42602": "invalid_name", "42611": "invalid_column_definition", "42622": "name_too_long", "42701": "duplicate_column", "42702": "ambiguous_column", "42703": "undefined_column", "42704": "undefined_object", "42710": "duplicate_object", "42712": "duplicate_alias", "42723": "duplicate_function", "42725": "ambiguous_function", "42803": "grouping_error", "42804": "datatype_mismatch", "42809": "wrong_object_type", "42830": "invalid_foreign_key", "42846": "cannot_coerce", "42883": "undefined_function", "42939": "reserved_name", "44000": "with_check_option_violation", "53000": "insufficient_resources", "53100": "disk_full", "53200": "out_of_memory", "53300": "too_many_connections", "53400": "configuration_limit_exceeded", "54000": "program_limit_exceeded", "54001": "statement_too_complex", "54011": "too_many_columns", "54023": "too_many_arguments", "55000": "object_not_in_prerequisite_state", "55006": "object_in_use", "57000": "operator_intervention", "57014": "query_canceled", "58000": "system_error", "58030": "io_error", "72000": "snapshot_too_old", "00000": "successful_completion", "01000": "warning", "0100C": "dynamic_result_sets_returned", "01008": "implicit_zero_bit_padding", "01003": "null_value_eliminated_in_set_function", "01007": "privilege_not_granted", "01006": "privilege_not_revoked", "01004": "string_data_right_truncation", "01P01": "deprecated_feature", "02000": "no_data", "02001": "no_additional_dynamic_result_sets_returned", "03000": "sql_statement_not_yet_complete", "08000": "connection_exception", "08003": "connection_does_not_exist", "08006": "connection_failure", "08001": "sqlclient_unable_to_establish_sqlconnection", "08004": "sqlserver_rejected_establishment_of_sqlconnection", "08007": "transaction_resolution_unknown", "08P01": "protocol_violation", "09000": "triggered_action_exception", "0A000": "feature_not_supported", "0B000": "invalid_transaction_initiation", "0F000": "locator_exception", "0F001": "invalid_locator_specification", "0L000": "invalid_grantor", "0LP01": "invalid_grant_operation", "0P000": "invalid_role_specification", "0Z000": "diagnostics_exception", "0Z002": "stacked_diagnostics_accessed_without_active_handler", "2202E": "array_subscript_error", "2200B": "escape_character_conflict", "2201E": "invalid_argument_for_logarithm", "2201F": "invalid_argument_for_power_function", "2201G": "invalid_argument_for_width_bucket_function", "2200D": "invalid_escape_octet", "22P06": "nonstandard_use_of_escape_character", "2201B": "invalid_regular_expression", "2201W": "invalid_row_count_in_limit_clause", "2201X": "invalid_row_count_in_result_offset_clause", "2202H": "invalid_tablesample_argument", "2202G": "invalid_tablesample_repeat", "2200C": "invalid_use_of_escape_character", "2200G": "most_specific_type_mismatch", "2200H": "sequence_generator_limit_exceeded", "2200F": "zero_length_character_string", "22P01": "floating_point_exception", "22P02": "invalid_text_representation", "22P03": "invalid_binary_representation", "22P04": "bad_copy_file_format", "22P05": "untranslatable_character", "2200L": "not_an_xml_document", "2200M": "invalid_xml_document", "2200N": "invalid_xml_content", "2200S": "invalid_xml_comment", "2200T": "invalid_xml_processing_instruction", "2203A": "sql_json_member_not_found", "2203B": "sql_json_number_not_found", "2203C": "sql_json_object_not_found", "2203D": "too_many_json_array_elements", "2203E": "too_many_json_object_members", "2203F": "sql_json_scalar_required", "23P01": "exclusion_violation", "25P01": "no_active_sql_transaction", "25P02": "in_failed_sql_transaction", "25P03": "idle_in_transaction_session_timeout", "28P01": "invalid_password", "2B000": "dependent_privilege_descriptors_still_exist", "2BP01": "dependent_objects_still_exist", "2D000": "invalid_transaction_termination", "2F000": "sql_routine_exception", "2F005": "function_executed_no_return_statement", "2F002": "modifying_sql_data_not_permitted", "2F003": "prohibited_sql_statement_attempted", "2F004": "reading_sql_data_not_permitted", "39P01": "trigger_protocol_violated", "39P02": "srf_protocol_violated", "39P03": "event_trigger_protocol_violated", "3B000": "savepoint_exception", "3B001": "invalid_savepoint_specification", "3D000": "invalid_catalog_name", "3F000": "invalid_schema_name", "40P01": "deadlock_detected", "42P20": "windowing_error", "42P19": "invalid_recursion", "42P18": "indeterminate_datatype", "42P21": "collation_mismatch", "42P22": "indeterminate_collation", "428C9": "generated_always", "42P01": "undefined_table", "42P02": "undefined_parameter", "42P03": "duplicate_cursor", "42P04": "duplicate_database", "42P05": "duplicate_prepared_statement", "42P06": "duplicate_schema", "42P07": "duplicate_table", "42P08": "ambiguous_parameter", "42P09": "ambiguous_alias", "42P10": "invalid_column_reference", "42P11": "invalid_cursor_definition", "42P12": "invalid_database_definition", "42P13": "invalid_function_definition", "42P14": "invalid_prepared_statement_definition", "42P15": "invalid_schema_definition", "42P16": "invalid_table_definition", "42P17": "invalid_object_definition", "55P02": "cant_change_runtime_param", "55P03": "lock_not_available", "55P04": "unsafe_new_enum_value_usage", "57P01": "admin_shutdown", "57P02": "crash_shutdown", "57P03": "cannot_connect_now", "57P04": "database_dropped", "58P01": "undefined_file", "58P02": "duplicate_file", "F0000": "config_file_error", "F0001": "lock_file_exists", "HV000": "fdw_error", "HV005": "fdw_column_name_not_found", "HV002": "fdw_dynamic_parameter_value_needed", "HV010": "fdw_function_sequence_error", "HV021": "fdw_inconsistent_descriptor_information", "HV024": "fdw_invalid_attribute_value", "HV007": "fdw_invalid_column_name", "HV008": "fdw_invalid_column_number", "HV004": "fdw_invalid_data_type", "HV006": "fdw_invalid_data_type_descriptors", "HV091": "fdw_invalid_descriptor_field_identifier", "HV00B": "fdw_invalid_handle", "HV00C": "fdw_invalid_option_index", "HV00D": "fdw_invalid_option_name", "HV090": "fdw_invalid_string_length_or_buffer_length", "HV00A": "fdw_invalid_string_format", "HV009": "fdw_invalid_use_of_null_pointer", "HV014": "fdw_too_many_handles", "HV001": "fdw_out_of_memory", "HV00P": "fdw_no_schemas", "HV00J": "fdw_option_name_not_found", "HV00K": "fdw_reply_handle", "HV00Q": "fdw_schema_not_found", "HV00R": "fdw_table_not_found", "HV00L": "fdw_unable_to_create_execution", "HV00M": "fdw_unable_to_create_reply", "HV00N": "fdw_unable_to_establish_connection", "P0000": "plpgsql_error", "P0001": "raise_exception", "P0002": "no_data_found", "P0003": "too_many_rows", "P0004": "assert_failure", "XX000": "internal_error", "XX001": "data_corrupted", "XX002": "index_corrupted" };
    return c2[code] || errs[code] || code;
    /*
      https://www.postgresql.org/docs/13/errcodes-appendix.html
      JSON.stringify([...THE_table_$0.rows].map(t => [...t.children].map(u => u.innerText)).filter((d, i) => i && d.length > 1).reduce((a, v)=>({ ...a, [v[0]]: v[1] }), {}))
    */
}
function getInferredJoins(db, schema = "public") {
    return __awaiter(this, void 0, void 0, function* () {
        let joins = [];
        let res = yield db.any(`SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY') as foreign_is_unique
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema=` + "${schema}" + ` AND tc.constraint_type = 'FOREIGN KEY' `, { schema });
        res.map((d) => {
            let eIdx = joins.findIndex(j => j.tables.includes(d.table_name) && j.tables.includes(d.foreign_table_name));
            let existing = joins[eIdx];
            if (existing) {
                if (existing.tables[0] === d.table_name) {
                    existing.on = Object.assign(Object.assign({}, existing.on), { [d.column_name]: d.foreign_column_name });
                }
                else {
                    existing.on = Object.assign(Object.assign({}, existing.on), { [d.foreign_column_name]: d.column_name });
                }
                joins[eIdx] = existing;
            }
            else {
                joins.push({
                    tables: [d.table_name, d.foreign_table_name],
                    on: {
                        [d.column_name]: d.foreign_column_name
                    },
                    type: "many-many"
                });
            }
        });
        // console.log(joins);
        return joins;
    });
}
//# sourceMappingURL=DboBuilder.js.map
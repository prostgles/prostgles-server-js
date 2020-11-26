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
exports.DboBuilder = exports.TableHandler = exports.ViewHandler = void 0;
const Bluebird = require("bluebird");
const pgPromise = require("pg-promise");
const utils_1 = require("./utils");
const Prostgles_1 = require("./Prostgles");
const PubSubManager_1 = require("./PubSubManager");
let pgp = pgPromise({
    promiseLib: Bluebird
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});
const asName = (str) => {
    return pgp.as.format("$1:name", [str]);
};
function replaceNonAlphaNumeric(string) {
    return string.replace(/[\W_]+/g, "_");
}
function capitalizeFirstLetter(string) {
    return replaceNonAlphaNumeric(string).charAt(0).toUpperCase() + string.slice(1);
}
const shortestPath_1 = require("./shortestPath");
function makeErr(err, localParams) {
    return Promise.reject(Object.assign(Object.assign(Object.assign({}, ((!localParams || !localParams.socket) ? err : {})), PubSubManager_1.filterObj(err, ["column", "code", "table", "constraint"])), { code_info: sqlErrCodeToMsg(err.code) }));
}
class ViewHandler {
    constructor(db, tableOrViewInfo, pubSubManager, dboBuilder, t, joinPaths) {
        this.tsDataDef = "";
        this.tsDataName = "";
        this.tsDboName = "";
        this.is_view = true;
        this.filterDef = "";
        if (!db || !tableOrViewInfo)
            throw "";
        this.db = db;
        this.t = t;
        this.joinPaths = joinPaths;
        this.tableOrViewInfo = tableOrViewInfo;
        this.name = tableOrViewInfo.name;
        this.columns = tableOrViewInfo.columns;
        this.column_names = tableOrViewInfo.columns.map(c => c.name);
        this.pubSubManager = pubSubManager;
        this.dboBuilder = dboBuilder;
        this.joins = this.dboBuilder.joins;
        this.columnSet = new pgp.helpers.ColumnSet(this.columns.map(({ name, data_type }) => (Object.assign({ name }, (["json", "jsonb"].includes(data_type) ? { mod: ":json" } : {})))), { table: this.name });
        this.tsDataName = capitalizeFirstLetter(this.name);
        this.tsDataDef = `export type ${this.tsDataName} = {\n`;
        this.columns.map(({ name, udt_name }) => {
            this.tsDataDef += `     ${replaceNonAlphaNumeric(name)}?: ${postgresToTsType(udt_name)};\n`;
        });
        this.tsDataDef += "};";
        this.tsDataDef += "\n";
        this.tsDataDef += `export type ${this.tsDataName}_Filter = ${this.tsDataName} | object | { $and: (${this.tsDataName} | object)[] } | { $or: (${this.tsDataName} | object)[] } `;
        this.filterDef = ` ${this.tsDataName}_Filter `;
        const filterDef = this.filterDef;
        this.tsDboDefs = [
            `   find: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<${this.tsDataName}[] | any[]>;`,
            `   findOne: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<${this.tsDataName} | any>;`,
            `   subscribe: (filter: ${filterDef}, params: SelectParams, onData: (items: ${this.tsDataName}[]) => any) => Promise<{ unsubscribe: () => any }>;`,
            `   subscribeOne: (filter: ${filterDef}, params: SelectParams, onData: (item: ${this.tsDataName}) => any) => Promise<{ unsubscribe: () => any }>;`,
            `   count: (filter?: ${filterDef}) => Promise<number>;`
        ];
        this.makeDef();
    }
    makeDef() {
        this.tsDboName = `DBO_${this.name}`;
        this.tsDboDef = `export type ${this.tsDboName} = {\n ${this.tsDboDefs.join("\n")} \n};\n`;
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
    getJoins(source, target) {
        let result = [];
        if (!this.joinPaths)
            throw "Joins dissallowed";
        /* Find the join path between tables */
        let jp = this.joinPaths.find(j => j.t1 === source && j.t2 === target);
        if (!jp)
            throw `Joining ${source} <-> ${target} dissallowed or missing`;
        /* Make the join chain info excluding root table */
        result = jp.path.slice(1).map((t2, i, arr) => {
            const t1 = i === 0 ? source : arr[i - 1];
            if (!this.joins)
                this.joins = JSON.parse(JSON.stringify(this.dboBuilder.joins));
            /* Get join options */
            const jo = this.joins.find(j => j.tables.includes(t1) && j.tables.includes(t2));
            if (!jo)
                throw "INTERNAL ERROR -> could not find join relationship";
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
    buildJoinQuery(q) {
        return __awaiter(this, void 0, void 0, function* () {
            const makeQuery3 = (q, isJoined = false) => {
                const PREF = `prostgles_prefix_to_avoid_collisions`, joins = q.joins || [], aggs = q.aggs || [];
                const joinTables = (q1, q2) => {
                    const paths = this.getJoins(q1.table, q2.table);
                    return `${paths.map(({ table, on }, i) => {
                        const prevTable = i === 0 ? q1.table : paths[i - 1].table;
                        let iQ = asName(table);
                        /* If target table then add filters, options, etc */
                        if (i === paths.length - 1) {
                            iQ = "" +
                                "   (\n" +
                                `       SELECT *,\n` +
                                `       row_number() over() as ${asName(`${table}_${PREF}_rowid_sorted`)},\n` +
                                `       row_to_json((select x from (SELECT ${(q2.select.concat((q2.joins || []).map(j => j.table))).join(", ")}) as x)) AS ${asName(`${q2.table}_${PREF}_json`)} \n` +
                                `       FROM (\n` +
                                `           ${makeQuery3(q2, true)}\n` +
                                `       ) ${asName(q2.table)}        -- [target table]\n` +
                                `   ) ${asName(q2.table)}\n`;
                        }
                        return "" +
                            `   ${q2.isLeftJoin ? "LEFT" : "INNER"} JOIN ${iQ}\n` +
                            `   ON ${on.map(([c1, c2]) => `${asName(prevTable)}.${asName(c1)} = ${asName(table)}.${asName(c2)}`).join("\n AND ")}\n`;
                    }).join("")}`;
                };
                /* Leaf query */
                if (!joins.length) {
                    let select = (isJoined ? q.allFields : q.select).join(", "), groupBy = "";
                    if (q.aggs && q.aggs.length) {
                        q.select = q.select.filter(s => s && s.trim().length);
                        select = q.select.concat(q.aggs).join(", ");
                        if (q.select.length) {
                            groupBy = `GROUP BY ${q.select.join(", ")}\n`;
                        }
                    }
                    let res = "" +
                        `SELECT ${select} \n` +
                        `FROM ${asName(q.table)}\n`;
                    if (q.where)
                        res += `${q.where}\n`;
                    if (groupBy)
                        res += `${groupBy}\n`;
                    if (q.orderBy)
                        res += `${q.orderBy}\n`;
                    if (!isJoined)
                        res += `LIMIT ${q.limit} \nOFFSET ${q.offset || 0}\n`;
                    return res;
                }
                else {
                    // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
                    if (q.aggs && q.aggs.length && joins.find(j => j.aggs && j.aggs.length))
                        throw "Cannot join two aggregates";
                }
                return `
            -- root final
            SELECT
              ${(isJoined ? q.allFields : q.select).concat(aggs ? aggs : []).filter(s => s).concat(joins.map(j => j.limit === 1 ?
                    `         json_agg(${asName(`${j.table}_${PREF}_json`)}::jsonb ORDER BY ${asName(`${j.table}_${PREF}_rowid_sorted`)})   FILTER (WHERE ${asName(`${j.table}_${PREF}_limit`)} <= ${j.limit} AND ${asName(`${j.table}_${PREF}_dupes_rowid`)} = 1 AND ${asName(`${j.table}_${PREF}_json`)} IS NOT NULL)->0  AS ${asName(j.table)}` :
                    `COALESCE(json_agg(${asName(`${j.table}_${PREF}_json`)}::jsonb ORDER BY ${asName(`${j.table}_${PREF}_rowid_sorted`)})   FILTER (WHERE ${asName(`${j.table}_${PREF}_limit`)} <= ${j.limit} AND ${asName(`${j.table}_${PREF}_dupes_rowid`)} = 1 AND ${asName(`${j.table}_${PREF}_json`)} IS NOT NULL), '[]')  AS ${asName(j.table)}`)).join(", ")}
            FROM (
                SELECT *,
                ${joins.map(j => `row_number() over(partition by ${asName(`${j.table}_${PREF}_dupes_rowid`)}, ctid order by ${asName(`${j.table}_${PREF}_rowid_sorted`)}) AS ${j.table}_${PREF}_limit`).join(", ")}
                FROM (
                    SELECT 
                     -- [source full sellect + ctid to group by]
                    ${q.allFields.concat(["ctid"]).map(field => `${asName(q.table)}.${asName(field)}`).concat(joins.map(j => asName(j.table) + "." + asName(`${j.table}_${PREF}_json`) + ", " + asName(j.table) + "." + asName(`${j.table}_${PREF}_rowid_sorted`)).concat(
                // ${j.joins && j.joins.length? " ORDER BY  " : ""}
                joins.map(j => `row_number() over(partition by ${asName(`${j.table}_${PREF}_rowid_sorted`)}, ${asName(q.table)}.ctid ) AS ${asName(`${j.table}_${PREF}_dupes_rowid`)}`)).join("\n, "))}
                    FROM (
                        SELECT *, row_number() over() as ctid
                        FROM ${asName(q.table)}

                        -- [source filter]
                        ${q.where}
                        

                    ) ${asName(q.table)}
                    ${joins.map(j => joinTables(q, j)).join("\n")}
                ) t
            ) t            
            GROUP BY ${(aggs && aggs.length ? [] : ["ctid"]).concat(isJoined ? q.allFields : q.select).filter(s => s).join(", ")}\n` +
                    `-- [source orderBy]   \n` +
                    `   ${q.orderBy}\n` +
                    `-- [source limit] \n` +
                    (isJoined ? "" : `LIMIT ${q.limit || 0}\nOFFSET ${q.offset || 0}\n`);
                // WHY NOT THIS?
                //     return `WITH _posts AS (
                //         SELECT *, row_to_json((select x from (select id, title) as x)) as posts
                //         FROM posts
                // ), _comments AS (
                //         SELECT comments.ctid, comments.id, comments.post_id, comments.user_id, row_to_json((select x from (select _posts.id, json_agg(_posts.posts) as posts) as x)) as posts
                //         FROM comments
                //         LEFT JOIN _posts
                //         ON comments.post_id = _posts.id
                //         WHERE comments.id IS NOT NULL
                //         GROUP BY comments.ctid, comments.id, comments.post_id, comments.user_id, _posts.id
                //         ORDER BY comments.ctid
                // ), _users AS (
                //         SELECT users.id, users.username, COALESCE( json_agg((SELECT x FROM (SELECT _comments.id, _comments.posts) AS x)) FILTER (WHERE _comments.ctid IS NOT NULL), '[]') as comments
                //         FROM users
                //         LEFT JOIN _comments
                //         ON users.id = _comments.user_id
                //         GROUP BY users.id, users.username
                //         LIMIT 15
                // )
            };
            return makeQuery3(q);
        });
    }
    getAggs(select) {
        const aggParsers = [
            { name: "$max", get: () => " MAX(${field:name}) as ${alias:name} " },
            { name: "$min", get: () => " MIN(${field:name}) as ${alias:name} " },
            { name: "$avg", get: () => " AVG(${field:name}) as ${alias:name} " },
            { name: "$sum", get: () => " SUM(${field:name}) as ${alias:name} " },
            { name: "$count", get: () => " COUNT(${field:name}) as ${alias:name} " },
            { name: "$countDistinct", get: () => " COUNT(DISTINCT ${field:name}) as ${alias:name} " },
        ];
        let keys = Object.keys(select);
        let nonAliased = keys.filter(key => typeof select[key] === "string")
            .map(field => ({ field, alias: field, parser: aggParsers.find(a => a.name === (select[field])) }))
            .filter((f) => f.parser)
            .map(({ field, parser, alias }) => ({ field, alias, query: pgp.as.format(parser.get(), { field, alias }) }));
        let aliased = keys.filter(key => isPlainObject(select[key]) && Object.values(select[key]).find(v => Array.isArray(v)))
            .map(alias => ({ alias, parser: aggParsers.find(a => a.name === (Object.keys(select[alias])[0])) }))
            .filter((f) => f.parser)
            .map((a) => {
            let arr = select[a.alias][a.parser.name];
            if (!arr || !arr.length || arr.find(v => typeof v !== "string"))
                throw "\nInvalid agg function call -> " + JSON.stringify(select[a.alias]) + "\nExpecting a string value";
            a.field = select[a.alias][a.parser.name][0];
            return a;
        })
            .map(({ field, parser, alias }) => ({ field, alias, query: pgp.as.format(parser.get(), { field, alias }) }));
        let res = nonAliased.concat(aliased);
        // console.log(res);
        return res;
    }
    buildQueryTree(filter, selectParams, param3_unused = null, tableRules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            this.checkFilter(filter);
            const { select } = selectParams || {};
            let mainSelect;
            let joins, _Aggs, aggAliases = [], aggs, joinQueries = [];
            // console.log("add checks for when to REINDEX TABLE CONCURRENTLY ... \nand also if join columns are missing indexes\nand also if running out of disk space!! (in nodejs)")
            if (isPlainObject(select)) {
                if (Object.values(select).find(v => (v === 1 || v === true)) &&
                    Object.values(select).find(v => (v === 0 || v === false)))
                    throw "\nCannot include and exclude fields at the same time";
                _Aggs = this.getAggs(PubSubManager_1.filterObj(select, Object.keys(select).filter(key => select[key] !== "*"))) || [];
                let aggFields = Array.from(new Set(_Aggs.map(a => a.field)));
                aggAliases = _Aggs.map(a => a.alias);
                aggs = _Aggs.map(a => a.query);
                if (aggs.length) {
                    /* Validate fields from aggs */
                    yield this.prepareValidatedQuery({}, { select: aggFields }, param3_unused, tableRules, localParams);
                }
                joins = Object.keys(select).filter(key => !aggAliases.includes(key) &&
                    (select[key] === "*" || isPlainObject(select[key])));
                if (joins && joins.length) {
                    if (!this.joinPaths)
                        throw "Joins not allowed";
                    for (let i = 0; i < joins.length; i++) {
                        let jKey = joins[i], jParams = select[jKey], jTable = jKey, isLeftJoin = true, jSelectAlias = jTable, jSelect = jParams, jFilter = {}, jLimit = undefined, jOffset = undefined, jOrder = undefined;
                        if (isPlainObject(jParams)) {
                            /* Has params */
                            const joinKeys = Object.keys(jParams).filter(key => ["$innerJoin", "$leftJoin"].includes(key));
                            if (joinKeys.length) {
                                if (joinKeys.length > 1)
                                    throw "cannot use $innerJoin and $leftJoin at the same time on same table";
                                jTable = jParams[joinKeys[0]];
                                jSelect = jParams.select || "*";
                                jFilter = jParams.filter || {};
                                jLimit = jParams.limit;
                                jOffset = jParams.offset;
                                jOrder = jParams.orderBy;
                                isLeftJoin = joinKeys[0] === "$leftJoin";
                            }
                        }
                        // const joinTable = joins[i];
                        if (!this.dboBuilder.dbo[jTable])
                            throw `Joined table ${jTable} is disallowed or inexistent`;
                        let joinTableRules = undefined, isLocal = true;
                        if (localParams && localParams.socket) {
                            isLocal = false;
                            joinTableRules = yield this.dboBuilder.publishParser.getValidatedRequestRule({ tableName: jTable, command: "find", socket: localParams.socket });
                        }
                        if (isLocal || joinTableRules) {
                            const joinQuery = yield this.dboBuilder.dbo[jTable].buildQueryTree(jFilter, { select: jSelect, limit: jLimit, offset: jOffset, orderBy: jOrder }, param3_unused, joinTableRules, localParams);
                            joinQuery.isLeftJoin = isLeftJoin;
                            joinQueries.push(joinQuery);
                        }
                    }
                }
                mainSelect = PubSubManager_1.filterObj(select, Object.keys(select).filter(key => !(aggAliases.concat(joins).includes(key))));
                /* Allow empty select */
                if (Object.keys(mainSelect).length < 1)
                    mainSelect = "";
                /* Select star already selects all fields */
                if (Object.keys(select).includes("*")) {
                    if (Object.keys(select).find(key => key !== "*" && [true, false, 1, 0].includes(select[key])))
                        throw "\nCannot use all ('*') together with other fields ";
                    mainSelect = "*";
                }
            }
            let q = yield this.prepareValidatedQuery(filter, Object.assign(Object.assign({}, selectParams), { select: mainSelect }), param3_unused, tableRules, localParams, aggAliases);
            q.joins = joinQueries;
            q.aggs = aggs;
            return q;
        });
    }
    checkFilter(filter) {
        if (filter === null || filter && !isPojoObject(filter))
            throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
    }
    prepareValidatedQuery(filter, selectParams, param3_unused = null, tableRules, localParams, validatedAggAliases) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.checkFilter(filter);
                const { select = "*", limit = null, offset = null, orderBy = null, expectOne = false } = selectParams || {};
                let fields, filterFields, forcedFilter, maxLimit;
                const { testRule = false, tableAlias } = localParams || {};
                if (tableRules) {
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
                    if (testRule) {
                        if (maxLimit && !Number.isInteger(maxLimit))
                            throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;
                        yield this.validateViewRules(fields, filterFields, null, forcedFilter, "select");
                        return undefined;
                    }
                }
                // console.log(this.parseFieldFilter(select));
                // let columnSet = this.prepareSelect(select, fields, null, tableAlias);
                // console.log(this.prepareSelect(select, fields, null , tableAlias))
                // let _query = pgp.as.format(" SELECT ${select:raw} FROM ${_psqlWS_tableName:name} ${tableAlias:name} ", { select: columnSet, _psqlWS_tableName: this.name, tableAlias });
                // console.log(_query)
                /* TO FINISH */
                // if(select_rules.validate){
                // }
                return {
                    isLeftJoin: true,
                    table: this.name,
                    allFields: this.column_names,
                    orderBy: [this.prepareSort(orderBy, fields, tableAlias, null, validatedAggAliases)],
                    select: this.prepareSelect(select, fields, null, tableAlias).split(","),
                    where: yield this.prepareWhere(filter, forcedFilter, filterFields, null, tableAlias),
                    limit: this.prepareLimitQuery(limit, maxLimit),
                    offset: this.prepareOffsetQuery(offset)
                };
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.find()` };
            }
        });
    }
    find(filter, selectParams, param3_unused = null, tableRules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                filter = filter || {};
                const { expectOne = false } = selectParams || {};
                const { testRule = false } = localParams || {};
                // const statement = await this.prepareValidatedQuery(filter, selectParams, param3_unused, tableRules, localParams),
                //     _query = statement.query;
                if (testRule) {
                    yield this.prepareValidatedQuery(filter, selectParams, param3_unused, tableRules, localParams);
                    return undefined;
                }
                const q = yield this.buildQueryTree(filter, selectParams, param3_unused, tableRules, localParams), _query = yield this.buildJoinQuery(q);
                // console.log(_query);
                if (testRule)
                    return [];
                if (selectParams) {
                    const good_params = ["select", "orderBy", "offset", "limit", "expectOne"];
                    const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
                    if (bad_params && bad_params.length)
                        throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
                }
                /* Apply publish validation */
                // if(tableRules && tableRules.select && tableRules.select.validate){
                //     const forcedFilter = tableRules.select.forcedFilter || {};
                //     /* Filters have been validated up to this point */
                //     await tableRules.select.validate({ filter: { ...filter, ...forcedFilter }, params: selectParams });
                // }
                // console.log(_query);
                if (expectOne)
                    return (this.t || this.db).oneOrNone(_query).catch(err => makeErr(err, localParams));
                else
                    return (this.t || this.db).any(_query).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.find()` };
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
            throw { err: e, msg: `Issue with dbo.${this.name}.findOne()` };
        }
    }
    count(filter, param2_unused, param3_unused, table_rules, localParams = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            filter = filter || {};
            try {
                return yield this.find(filter, { select: "", limit: 0 }, null, table_rules, localParams)
                    .then((allowed) => __awaiter(this, void 0, void 0, function* () {
                    const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {};
                    let query = "SELECT COUNT(*) FROM ${_psqlWS_tableName:name} " + (yield this.prepareWhere(filter, forcedFilter, filterFields, false));
                    return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ count }) => +count);
                }));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.count()` };
            }
        });
    }
    subscribe(filter, params, localFunc, table_rules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.t)
                    throw "subscribe not allowed within transactions";
                if (!localParams && !localFunc)
                    throw " missing data. provide -> localFunc | localParams { socket } ";
                const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {}, condition = yield this.prepareWhere(filter, forcedFilter, filterFields, true);
                if (!localFunc) {
                    return yield this.find(filter, Object.assign(Object.assign({}, params), { limit: 0 }), null, table_rules, localParams)
                        .then(isValid => {
                        const { socket = null, subOne = false } = localParams;
                        return this.pubSubManager.addSub({
                            table_info: this.tableOrViewInfo,
                            socket,
                            table_rules,
                            condition,
                            func: localFunc,
                            filter: Object.assign({}, filter),
                            params: Object.assign({}, params),
                            channel_name: null,
                            socket_id: socket.id,
                            table_name: this.name,
                            last_throttled: 0,
                            subOne
                        }).then(channelName => ({ channelName }));
                    });
                }
                else {
                    const { subOne = false } = localParams || {};
                    this.pubSubManager.addSub({
                        table_info: this.tableOrViewInfo,
                        socket: null,
                        table_rules,
                        condition,
                        func: localFunc,
                        filter: Object.assign({}, filter),
                        params: Object.assign({}, params),
                        channel_name: null,
                        socket_id: null,
                        table_name: this.name,
                        last_throttled: 0,
                        subOne
                    }).then(channelName => ({ channelName }));
                    const unsubscribe = () => {
                        this.pubSubManager.removeLocalSub(this.name, condition, localFunc);
                    };
                    return Object.freeze({ unsubscribe });
                }
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.subscribe()` };
            }
        });
    }
    subscribeOne(filter, params, localFunc, table_rules, localParams) {
        return this.subscribe(filter, params, localFunc, table_rules, Object.assign(Object.assign({}, (localParams || {})), { subOne: true }));
    }
    prepareColumnSet(selectParams = "*", allowed_cols, allow_empty = true, onlyNames = true) {
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
        try {
            let colSet = new pgp.helpers.ColumnSet(col_names);
            return onlyNames ? colSet.names : colSet;
        }
        catch (e) {
            throw e;
        }
    }
    prepareSelect(selectParams = "*", allowed_cols, allow_empty = true, tableAlias) {
        if (tableAlias) {
            let cs = this.prepareColumnSet(selectParams, allowed_cols, true, false);
            return cs.columns.map(col => pgp.as.format("${tableAlias:name}.${name:name}", { tableAlias, name: col.name })).join(", ");
        }
        else {
            return this.prepareColumnSet(selectParams, allowed_cols, true, true);
        }
    }
    getFinalFilterObj(filter, forcedFilter) {
        let _filter = Object.assign({}, filter);
        if (!isPlainObject(_filter))
            throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);
        if (forcedFilter) {
            _filter = {
                $and: [forcedFilter, _filter].filter(f => f)
            };
        }
        return _filter;
    }
    prepareWhere(filter, forcedFilter, filterFields, excludeWhere = false, tableAlias) {
        return __awaiter(this, void 0, void 0, function* () {
            const parseFilter = (f, parentFilter = null) => __awaiter(this, void 0, void 0, function* () {
                let result = "";
                let keys = Object.keys(f);
                if (!keys.length)
                    return result;
                if ((keys.includes("$and") || keys.includes("$or"))) {
                    if (keys.length > 1)
                        throw "\n$and/$or filter must contain only one array property. e.g.: { $and: [...] } OR { $or: [...] } ";
                    if (parentFilter && Object.keys(parentFilter).includes(""))
                        throw "$and/$or filter can only be placed at the root or within another $and/$or filter";
                }
                const { $and, $or } = f, group = $and || $or;
                if (group && group.length) {
                    const operand = $and ? " AND " : " OR ";
                    let conditions = (yield Promise.all(group.map((gf) => __awaiter(this, void 0, void 0, function* () { return yield parseFilter(gf, group); })))).filter(c => c);
                    if (conditions && conditions.length) {
                        if (conditions.length === 1)
                            return conditions.join(operand);
                        else
                            return ` ( ${conditions.sort().join(operand)} ) `;
                    }
                }
                else if (!group) {
                    result = yield this.getCondition(Object.assign({}, f), this.parseFieldFilter(filterFields), tableAlias);
                }
                return result;
            });
            if (!isPlainObject(filter))
                throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);
            let _filter = Object.assign({}, filter);
            if (forcedFilter) {
                _filter = {
                    $and: [forcedFilter, _filter].filter(f => f)
                };
            }
            // let keys = Object.keys(filter);
            // if(!keys.length) return result;
            let cond = yield parseFilter(_filter, null);
            if (cond) {
                if (excludeWhere)
                    return cond;
                else
                    return " WHERE " + cond;
            }
            return "";
        });
    }
    prepareExistCondition(filter, localParams, notJoined = false) {
        return __awaiter(this, void 0, void 0, function* () {
            let res = "";
            const t1 = this.name;
            return (yield Promise.all(Object.keys(filter).map((t2) => __awaiter(this, void 0, void 0, function* () {
                const f2 = filter[t2];
                if (!this.dboBuilder.dbo[t2])
                    throw "Invalid or dissallowed table: " + t2;
                /* Nested $exists not allowed */
                if (f2 && Object.keys(f2).includes("$exists")) {
                    throw "Nested exists dissallowed";
                }
                const makeTableChain = (paths, depth = 0, finalFilter = "") => {
                    const join = paths[depth], table = join.table;
                    const prevTable = depth === 0 ? join.source : paths[depth - 1].table;
                    let cond = `${join.on.map(([c1, c2]) => `${asName(prevTable)}.${asName(c1)} = ${asName(table)}.${asName(c2)}`).join("\n AND ")}`;
                    // console.log(join, cond);
                    let j = `SELECT 1 \n` +
                        `FROM ${asName(table)} \n` +
                        `WHERE ${cond} \n`; //
                    if (depth === paths.length - 1 && finalFilter) {
                        j += `AND ${finalFilter} \n`;
                    }
                    const indent = (a, b) => a;
                    if (depth < paths.length - 1) {
                        j += `AND ${makeTableChain(paths, depth + 1, finalFilter)} \n`;
                    }
                    j = indent(j, depth + 1);
                    let res = `EXISTS ( \n` +
                        j +
                        `) \n`;
                    return indent(res, depth);
                };
                let t2Rules = undefined, forcedFilter, filterFields, tableAlias;
                if (localParams && localParams.socket && this.dboBuilder.publishParser) {
                    t2Rules = yield this.dboBuilder.publishParser.getValidatedRequestRule({ tableName: t2, command: "find", socket: localParams.socket });
                    if (!t2Rules || !t2Rules.select)
                        throw "Dissallowed";
                    ({ forcedFilter, filterFields } = t2Rules.select);
                }
                let finalWhere;
                try {
                    finalWhere = yield this.dboBuilder.dbo[t2].prepareWhere(f2, forcedFilter, filterFields, true, tableAlias);
                }
                catch (err) {
                    throw "Issue with preparing $exists query for table " + t2 + "\n->" + JSON.stringify(err);
                }
                // console.log(f2, finalWhere);
                if (notJoined) {
                    res = ` EXISTS (SELECT 1 \nFROM ${asName(t2)} \n${finalWhere}) `;
                }
                else {
                    res = makeTableChain(this.getJoins(t1, t2), 0, finalWhere);
                }
                return res;
            })))).join(" AND \n");
        });
    }
    /* NEW API !!! :) */
    getCondition(filter, allowed_colnames, tableAlias, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            let prefix = "";
            const getRawFieldName = (field) => {
                if (tableAlias)
                    return pgp.as.format("$1:name.$2:name", [tableAlias, field]);
                else
                    return pgp.as.format("$1:name", [field]);
            };
            const parseDataType = (key, col = null) => {
                const _col = col || this.columns.find(({ name }) => name === key);
                if (_col && _col.data_type === "ARRAY") {
                    return " ARRAY[${data:csv}] ";
                }
                return " ${data} ";
            }, conditionParsers = [
                // { aliases: ["$exists"],                         get: (key, val, col) =>  },                
                { aliases: ["$nin"], get: (key, val, col) => "${key:raw} NOT IN (${data:csv}) " },
                { aliases: ["$in"], get: (key, val, col) => "${key:raw} IN (${data:csv}) " },
                { aliases: ["$tsQuery"], get: (key, val, col) => {
                        if (col.data_type === "tsvector") {
                            return pgp.as.format("${key:raw} @@ to_tsquery(${data:csv}) ", { key: getRawFieldName(key), data: val, prefix });
                        }
                        else {
                            return pgp.as.format(" to_tsvector(${key:raw}::text) @@ to_tsquery(${data:csv}) ", { key, data: val, prefix });
                        }
                    } },
                { aliases: ["@@"], get: (key, val, col) => {
                        if (col && val && val.to_tsquery && Array.isArray(val.to_tsquery)) {
                            if (col.data_type === "tsvector") {
                                return pgp.as.format("${key:raw} @@ to_tsquery(${data:csv}) ", { key: getRawFieldName(key), data: val.to_tsquery, prefix });
                            }
                            else {
                                return pgp.as.format(" to_tsvector(${key:raw}::text) @@ to_tsquery(${data:csv}) ", { key, data: val.to_tsquery, prefix });
                            }
                        }
                        else
                            throw `expecting { field_name: { "@@": { to_tsquery: [ ...params ] } } } `;
                    } },
                { aliases: ["@>", "$contains"], get: (key, val, col) => "${key:raw} @> " + parseDataType(key, col) },
                { aliases: ["<@", "$containedBy"], get: (key, val, col) => "${key:raw} <@ " + parseDataType(key, col) },
                { aliases: ["&&", "$overlaps"], get: (key, val, col) => "${key:raw} && " + parseDataType(key, col) },
                { aliases: ["=", "$eq", "$equal"], get: (key, val, col) => "${key:raw} =  " + parseDataType(key, col) },
                { aliases: [">", "$gt", "$greater"], get: (key, val, col) => "${key:raw} >  " + parseDataType(key, col) },
                { aliases: [">=", "$gte", "$greaterOrEqual"], get: (key, val, col) => "${key:raw} >= " + parseDataType(key, col) },
                { aliases: ["<", "$lt", "$less"], get: (key, val, col) => "${key:raw} <  " + parseDataType(key, col) },
                { aliases: ["<=", "$lte", "$lessOrEqual"], get: (key, val, col) => "${key:raw} <= " + parseDataType(key, col) },
                { aliases: ["$ilike"], get: (key, val, col) => "${key:raw}::text ILIKE ${data}::text " },
                { aliases: ["$like"], get: (key, val, col) => "${key:raw}::text LIKE ${data}::text " },
                { aliases: ["$notIlike"], get: (key, val, col) => "${key:raw}::text NOT ILIKE ${data}::text " },
                { aliases: ["$notLike"], get: (key, val, col) => "${key:raw}::text NOT LIKE ${data}::text " },
                { aliases: ["<>", "$ne", "$not"], get: (key, val, col) => "${key:raw} " + (val === null ? " IS NOT NULL " : (" <> " + parseDataType(key, col))) },
                { aliases: ["$isNull", "$null"], get: (key, val, col) => "${key:raw} " + `  IS ${!val ? " NOT " : ""} NULL ` }
            ];
            let data = Object.assign({}, filter);
            /* Exists join filter */
            const EXISTS_KEYS = ["$exists", "$joinsTo"];
            let filterKeys = Object.keys(data).filter(k => !EXISTS_KEYS.includes(k));
            const existsKeys = Object.keys(data).filter(k => EXISTS_KEYS.includes(k));
            let existsCond = "";
            if (existsKeys.length) {
                existsCond = (yield Promise.all(existsKeys.map((k) => __awaiter(this, void 0, void 0, function* () { return yield this.prepareExistCondition(data[k], localParams, k === "$exists"); })))).join(" AND ");
            }
            if (allowed_colnames) {
                const invalidColumn = filterKeys
                    .find(fName => !allowed_colnames.includes(fName));
                if (invalidColumn) {
                    throw `Table: ${this.name} -> disallowed/inexistent columns in filter: ${invalidColumn}`;
                }
            }
            let templates = Prostgles_1.flat(filterKeys
                .map(fKey => {
                let d = data[fKey], col = this.columns.find(({ name }) => name === fKey);
                if (d === null) {
                    return pgp.as.format("${key:raw} IS NULL ", { key: getRawFieldName(fKey), prefix });
                }
                if (isPlainObject(d)) {
                    if (Object.keys(d).length) {
                        return Object.keys(d).map(operand_key => {
                            const op = conditionParsers.find(o => operand_key && o.aliases.includes(operand_key));
                            if (!op) {
                                throw "Unrecognised operand: " + operand_key;
                            }
                            let _d = d[operand_key];
                            if (col.element_type && !Array.isArray(_d))
                                _d = [_d];
                            return pgp.as.format(op.get(fKey, _d, col), { key: getRawFieldName(fKey), data: _d, prefix });
                        });
                        // if(Object.keys(d).length){
                        // } else throw `\n Unrecognised statement for field ->   ${fKey}: ` + JSON.stringify(d);
                    }
                }
                return pgp.as.format("${key:raw} = " + parseDataType(fKey), { key: getRawFieldName(fKey), data: data[fKey], prefix });
            }));
            if (existsCond)
                templates.push(existsCond);
            templates = templates.sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
                .join(" AND \n");
            // console.log(templates)
            return templates; //pgp.as.format(template, data);
            /*
                SHOULD CHECK DATA TYPES TO AVOID "No operator matches the given data type" error
                console.log(table.columns)
            */
        });
    }
    /* This relates only to SELECT */
    prepareSort(orderBy, allowed_cols, tableAlias, excludeOrder = false, validatedAggAliases) {
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
        let bad_param = _ob.find(({ key }) => !(validatedAggAliases || []).includes(key) &&
            (!column_names.includes(key) ||
                (allowedFields.length && !allowedFields.includes(key))));
        if (!bad_param) {
            return (excludeOrder ? "" : " ORDER BY ") + (_ob.map(({ key, asc }) => `${tableAlias ? pgp.as.format("$1:name.", tableAlias) : ""}${pgp.as.format("$1:name", key)} ${asc ? " ASC " : " DESC "}`).join(", "));
        }
        else {
            throw "Unrecognised orderBy fields or params: " + bad_param.key;
        }
    }
    /* This relates only to SELECT */
    prepareLimitQuery(limit = 100, maxLimit) {
        const DEFAULT_LIMIT = 100, MAX_LIMIT = 1000;
        let _limit = [limit, DEFAULT_LIMIT].find(Number.isInteger);
        if (!Number.isInteger(_limit)) {
            throw "limit must be an integer";
        }
        if (Number.isInteger(maxLimit)) {
            _limit = Math.min(_limit, maxLimit);
        }
        else {
            _limit = Math.min(_limit, MAX_LIMIT);
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
    /**
    * Filter string array
    * @param {FieldFilter} fieldParams - key filter param. e.g.: "*" OR ["key1", "key2"] OR []
    * @param {boolean} allow_empty - allow empty select
    */
    parseFieldFilter(fieldParams = "*", allow_empty = true) {
        const all_fields = this.column_names.slice(0);
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
        this.tsDboDefs = this.tsDboDefs.concat([
            `   update: (filter: ${this.filterDef}, newData: ${this.tsDataName}, params?: UpdateParams) => Promise<void | ${this.tsDataName}>;`,
            `   upsert: (filter: ${this.filterDef}, newData: ${this.tsDataName}, params?: UpdateParams) => Promise<void | ${this.tsDataName}>;`,
            `   insert: (data: (${this.tsDataName} | ${this.tsDataName}[]), params?: InsertParams) => Promise<void | ${this.tsDataName}>;`,
            `   delete: (filter: ${this.filterDef}, params?: DeleteParams) => Promise<void | ${this.tsDataName}>;`,
        ]);
        this.makeDef();
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
    update(filter, newData, params, tableRules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { testRule = false } = localParams || {};
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
                    if (!fields)
                        throw ` invalid update rule for ${this.name}. fields missing `;
                    /* Safely test publish rules */
                    if (testRule) {
                        yield this.validateViewRules(fields, filterFields, returningFields, forcedFilter, "update");
                        if (forcedData) {
                            try {
                                const { data, columnSet } = this.validateNewData({ row: forcedData, forcedData: null, allowedFields: "*", tableRules, fixIssues: false });
                                let query = pgp.helpers.update(data, columnSet) + " WHERE FALSE ";
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
                const { data, columnSet } = this.validateNewData({ row: newData, forcedData, allowedFields: _fields, tableRules, fixIssues });
                let nData = Object.assign({}, data);
                if (tableRules && tableRules.update && tableRules.update.validate) {
                    nData = yield tableRules.update.validate(nData);
                }
                let query = pgp.helpers.update(nData, columnSet);
                query += yield this.prepareWhere(filter, forcedFilter, filterFields);
                if (onConflictDoNothing)
                    query += " ON CONFLICT DO NOTHING ";
                let qType = "none";
                if (returning) {
                    qType = multi ? "any" : "one";
                    query += " RETURNING " + this.prepareSelect(returning, returningFields);
                }
                if (this.t) {
                    return this.t[qType](query).catch(err => makeErr(err, localParams));
                }
                return this.db.tx(t => t[qType](query)).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.update()` };
            }
        });
    }
    ;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }) {
        const synced_field = utils_1.get(tableRules || {}, "sync.synced_field");
        if (synced_field && !row[synced_field]) {
            row[synced_field] = Date.now();
        }
        let data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
        const dataKeys = Object.keys(data);
        if (!data || !dataKeys.length) {
            // throw "missing/invalid data provided";
        }
        let cs = new pgp.helpers.ColumnSet(this.columnSet.columns.filter(c => dataKeys.includes(c.name)), { table: this.name });
        return { data, columnSet: cs };
    }
    insert(data, param2, param3_unused, tableRules, localParams = null) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { returning, onConflictDoNothing, fixIssues = false } = param2 || {};
                const { testRule = false } = localParams || {};
                let returningFields, forcedData, validate, fields;
                if (tableRules) {
                    if (!tableRules.insert)
                        throw "insert rules missing for " + this.name;
                    returningFields = tableRules.insert.returningFields;
                    forcedData = tableRules.insert.forcedData;
                    fields = tableRules.insert.fields;
                    validate = tableRules.insert.validate;
                    if (!fields)
                        throw ` invalid insert rule for ${this.name}. fields missing `;
                    /* Safely test publish rules */
                    if (testRule) {
                        yield this.validateViewRules(fields, null, returningFields, null, "insert");
                        if (forcedData) {
                            const keys = Object.keys(forcedData);
                            if (keys.length) {
                                try {
                                    const values = pgp.helpers.values(forcedData), colNames = this.prepareSelect(keys, this.column_names);
                                    yield this.db.any("EXPLAIN INSERT INTO ${name:name} (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { name: this.name, colNames, values });
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
                let returningSelect = returning ? (" RETURNING " + this.prepareSelect(returning, returningFields, false)) : "";
                const makeQuery = (row, isOne = false) => __awaiter(this, void 0, void 0, function* () {
                    if (!isPojoObject(row))
                        throw "\ninvalid insert data provided -> " + JSON.stringify(row);
                    const { data, columnSet } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
                    let _data = Object.assign({}, data);
                    if (validate) {
                        _data = yield validate(row);
                    }
                    let insertQ = "";
                    if (!Object.keys(_data).length)
                        insertQ = `INSERT INTO ${asName(this.name)} DEFAULT VALUES `;
                    else
                        insertQ = pgp.helpers.insert(_data, columnSet);
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
                    query = pgp.helpers.concat(queries);
                    if (returning)
                        queryType = "many";
                }
                else {
                    query = yield makeQuery(data, true);
                    if (returning)
                        queryType = "one";
                }
                // console.log(query);
                if (this.t)
                    return this.t[queryType](query).catch(err => makeErr(err, localParams));
                return this.db.tx(t => t[queryType](query)).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.insert()` };
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
                let forcedFilter = null, filterFields = null, returningFields = null;
                const { testRule = false } = localParams || {};
                if (table_rules) {
                    if (!table_rules.delete)
                        throw "delete rules missing";
                    forcedFilter = table_rules.delete.forcedFilter;
                    filterFields = table_rules.delete.filterFields;
                    returningFields = table_rules.delete.returningFields;
                    if (!filterFields)
                        throw ` invalid delete rule for ${this.name}. filterFields missing `;
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
                let _query = pgp.as.format("DELETE FROM $1:name", [this.name]);
                _query += yield this.prepareWhere(filter, forcedFilter, filterFields);
                if (returning) {
                    queryType = "any";
                    _query += " RETURNING " + this.prepareSelect(returning, returningFields);
                }
                return (this.t || this.db)[queryType](_query, { _psqlWS_tableName: this.name }).catch(err => makeErr(err, localParams));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.delete()` };
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
                return this.find(filter, { select: "", limit: 1 }, {}, table_rules, localParams)
                    .then(exists => {
                    if (exists && exists.length) {
                        // console.log(filter, "exists");
                        return this.update(filter, newData, params, table_rules, localParams);
                    }
                    else {
                        // console.log(filter, "existnts")
                        return this.insert(Object.assign(Object.assign({}, newData), filter), params, null, table_rules, localParams);
                    }
                });
                // .catch(existnts => {
                //     console.log(filter, "existnts")
                //     return this.insert({ ...filter, ...newData}, params);
                // });
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.upsert()` };
            }
        });
    }
    ;
    /* External request. Cannot sync from server */
    sync(filter, params, param3_unused, table_rules, localParams) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.t)
                throw "Sync not allowed within transactions";
            try {
                const { socket } = localParams || {};
                if (!socket)
                    throw "INTERNAL ERROR: socket missing";
                if (!table_rules || !table_rules.sync || !table_rules.select)
                    throw "INTERNAL ERROR: sync or select rules missing";
                let { id_fields, synced_field, allow_delete } = table_rules.sync;
                if (!id_fields || !synced_field) {
                    const err = "INTERNAL ERROR: id_fields OR synced_field missing from publish";
                    console.error(err);
                    throw err;
                }
                id_fields = this.parseFieldFilter(id_fields, false);
                /* Step 1: parse command and params */
                return this.find(filter, { select: [...id_fields, synced_field], limit: 0 }, null, table_rules, localParams)
                    .then((isValid) => __awaiter(this, void 0, void 0, function* () {
                    const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {};
                    const condition = yield this.prepareWhere(filter, forcedFilter, filterFields, true);
                    // let final_filter = getFindFilter(filter, table_rules);
                    return this.pubSubManager.addSync({
                        table_info: this.tableOrViewInfo,
                        condition,
                        id_fields, synced_field, allow_delete,
                        socket,
                        table_rules,
                        filter: Object.assign({}, filter),
                        params: Object.assign({}, params)
                    }).then(channelName => ({ channelName, id_fields, synced_field }));
                }));
            }
            catch (e) {
                if (localParams && localParams.testRule)
                    throw e;
                throw { err: e, msg: `Issue with dbo.${this.name}.sync()` };
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
        this.prostgles = prostgles;
        this.db = this.prostgles.db;
        this.schema = this.prostgles.schema || "public";
        this.dbo = {};
        // this.joins = this.prostgles.joins;
        this.pubSubManager = new PubSubManager_1.PubSubManager(this.db, this.dbo);
    }
    parseJoins() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.prostgles.joins) {
                let joins = yield this.prostgles.joins;
                joins = JSON.parse(JSON.stringify(joins));
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
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this.tablesOrViews = yield getTablesForSchemaPostgresSQL(this.db, this.schema);
            let allDataDefs = "";
            let allDboDefs = "";
            const common_types = `
export type Filter = object | {} | undefined;
export type GroupFilter = { $and: Filter } | { $or: Filter };
export type FieldFilter = object | string[] | "*" | "";
export type OrderBy = { key: string, asc: boolean }[] | { [key: string]: boolean }[] | string | string[];
        
export type SelectParams = {
    select?: FieldFilter;
    limit?: number;
    offset?: number;
    orderBy?: OrderBy;
    expectOne?: boolean;
}
export type UpdateParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
    multi?: boolean;
}
export type InsertParams = {
    returning?: FieldFilter;
    onConflictDoNothing?: boolean;
    fixIssues?: boolean;
}
export type DeleteParams = {
    returning?: FieldFilter;
};
export type TxCB = {
    (t: DBObj): (any | void | Promise<(any | void)>)
};
`;
            this.dboDefinition = `export type DBObj = {\n`;
            yield this.parseJoins();
            this.tablesOrViews.map(tov => {
                if (tov.is_view) {
                    this.dbo[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager, this, null, this.joinPaths);
                }
                else {
                    this.dbo[tov.name] = new TableHandler(this.db, tov, this.pubSubManager, this, null, this.joinPaths);
                }
                allDataDefs += this.dbo[tov.name].tsDataDef + "\n";
                allDboDefs += this.dbo[tov.name].tsDboDef;
                this.dboDefinition += ` ${tov.name}: ${this.dbo[tov.name].tsDboName};\n`;
            });
            if (this.prostgles.transactions) {
                let txKey = "tx";
                if (typeof this.prostgles.transactions === "string")
                    txKey = this.prostgles.transactions;
                this.dboDefinition += ` ${txKey}: (t: TxCB) => Promise<any | void> ;\n`;
                this.dbo[txKey] = (cb) => {
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
                        return cb(txDB);
                    });
                };
            }
            this.dboDefinition += "};\n";
            this.tsTypesDefinition = [common_types, allDataDefs, allDboDefs, this.dboDefinition].join("\n");
            return this.dbo;
            // let dbo = makeDBO(db, allTablesViews, pubSubManager, true);
        });
    }
}
exports.DboBuilder = DboBuilder;
// export async function makeDBO(db: DB): Promise<DbHandler> {
//     return await DBO.build(db, "public");
// }
/* UTILS */
/* UTILS */
function getTablesForSchemaPostgresSQL(db, schema) {
    const query = " \
    SELECT t.table_schema as schema, t.table_name as name,json_agg((SELECT x FROM (SELECT c.column_name as name, c.data_type, c.udt_name, c.element_type) as x)) as columns  \
    , CASE WHEN t.table_type = 'VIEW' THEN true ELSE false END as is_view \
    , array_to_json(vr.table_names) as parent_tables \
    FROM information_schema.tables t  \
    INNER join (  \
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name, e.data_type as element_type  \
        FROM information_schema.columns c    \
        LEFT JOIN (SELECT * FROM information_schema.element_types )   e  \
             ON ((c.table_catalog, c.table_schema, c.table_name, 'TABLE', c.dtd_identifier)  \
              = (e.object_catalog, e.object_schema, e.object_name, e.object_type, e.collection_type_identifier))  \
    ) c  \
    ON t.table_name = c.table_name  \
    AND t.table_schema = c.table_schema  \
    LEFT JOIN ( \
        SELECT cl_r.relname as view_name, array_agg(DISTINCT cl_d.relname) AS table_names \
        FROM pg_rewrite AS r \
        JOIN pg_class AS cl_r ON r.ev_class=cl_r.oid \
        JOIN pg_depend AS d ON r.oid=d.objid \
        JOIN pg_class AS cl_d ON d.refobjid=cl_d.oid \
        WHERE cl_d.relkind IN ('r','v') \
        AND cl_d.relname <> cl_r.relname \
        GROUP BY cl_r.relname \
    ) vr \
    ON t.table_name = vr.view_name \
    where t.table_schema = ${schema} AND t.table_name <> 'spatial_ref_sys'  \
    GROUP BY t.table_schema, t.table_name, t.table_type, vr.table_names";
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
function postgresToTsType(data_type, elem_data_type) {
    switch (data_type) {
        case 'bpchar':
        case 'char':
        case 'varchar':
        case 'text':
        case 'citext':
        case 'uuid':
        case 'bytea':
        case 'inet':
        case 'time':
        case 'timetz':
        case 'interval':
        case 'name':
            return 'string';
        case 'int2':
        case 'int4':
        case 'int8':
        case 'float4':
        case 'float8':
        case 'numeric':
        case 'money':
        case 'oid':
            return 'number';
        case 'bool':
            return 'boolean';
        case 'json':
        case 'jsonb':
            return 'Object';
        case 'date':
        case 'timestamp':
        case 'timestamptz':
            return 'Date';
        case '_int2':
        case '_int4':
        case '_int8':
        case '_float4':
        case '_float8':
        case '_numeric':
        case '_money':
            return 'Array<number>';
        case '_bool':
            return 'Array<number>';
        case '_varchar':
        case '_text':
        case '_citext':
        case '_uuid':
        case '_bytea':
            return 'Array<string>';
        case '_json':
        case '_jsonb':
            return 'Array<Object>';
        case '_timestamptz':
            return 'Array<Date>';
        default:
            return 'any';
    }
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
/**
 * Indents the given string
 * @param {string} str  The string to be indented.
 * @param {number} numOfIndents  The amount of indentations to place at the
 *     beginning of each line of the string.
 * @param {number=} opt_spacesPerIndent  Optional.  If specified, this should be
 *     the number of spaces to be used for each tab that would ordinarily be
 *     used to indent the text.  These amount of spaces will also be used to
 *     replace any tab characters that already exist within the string.
 * @return {string}  The new string with each line beginning with the desired
 *     amount of indentation.
 */
function indent(str, numOfIndents, opt_spacesPerIndent = 0) {
    str = str.replace(/^(?=.)/gm, new Array(numOfIndents + 1).join('\t'));
    opt_spacesPerIndent = opt_spacesPerIndent + 1 || 0;
    numOfIndents = new Array(opt_spacesPerIndent).join(' '); // re-use
    return opt_spacesPerIndent
        ? str.replace(/^\t+/g, function (tabs) {
            return tabs.replace(/./g, numOfIndents);
        })
        : str;
}
//# sourceMappingURL=DboBuilder.js.map
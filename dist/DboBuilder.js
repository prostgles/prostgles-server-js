"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DboBuilder = exports.TableHandler = exports.ViewHandler = void 0;
const Bluebird = require("bluebird");
const pgPromise = require("pg-promise");
const utils_1 = require("./utils");
const PubSubManager_1 = require("./PubSubManager");
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
const shortestPath_1 = require("./shortestPath");
class ViewHandler {
    constructor(db, tableOrViewInfo, pubSubManager, dboBuilder) {
        this.tsDataDef = "";
        this.tsDataName = "";
        this.tsDboName = "";
        this.tsFieldFilter = "";
        this.tsFieldFilterName = "";
        if (!db || !tableOrViewInfo)
            throw "";
        this.db = db;
        this.tableOrViewInfo = tableOrViewInfo;
        this.name = tableOrViewInfo.name;
        this.columns = tableOrViewInfo.columns;
        this.column_names = tableOrViewInfo.columns.map(c => c.name);
        this.pubSubManager = pubSubManager;
        this.dboBuilder = dboBuilder;
        this.joins = this.dboBuilder.joins;
        this.joinPaths = this.dboBuilder.joinPaths;
        this.columnSet = new pgp.helpers.ColumnSet(this.columns.map(({ name, data_type }) => ({
            name,
            ...(["json", "jsonb"].includes(data_type) ? { mod: ":json" } : {})
        })), { table: this.name });
        this.tsDataName = capitalizeFirstLetter(this.name);
        this.tsFieldFilterName = "FieldFilter_" + this.name;
        this.tsDataDef = `type ${this.tsDataName} = {\n`;
        this.columns.map(({ name, udt_name }) => {
            this.tsDataDef += `     ${name}?: ${postgresToTsType(udt_name)};\n`;
        });
        this.tsDataDef += "};";
        // this.tsFieldFilter = `type ${this.tsFieldFilterName} = {} | ${this.column_names.map(d => " { [" + JSON.stringify(d) + "]: boolean } ").join(" | ")} `
        this.tsDboDefs = [
            `   find: (filter?: object, selectParams?: SelectParams , param3_unused?:any) => Promise<${this.tsDataName}[]>;`,
            `   findOne: (filter?: object, selectParams?: SelectParams , param3_unused?:any) => Promise<${this.tsDataName}>;`,
            `   subscribe: (filter: object, params: SelectParams, onData: (items: ${this.tsDataName}[]) => any) => { unsubscribe: () => any };`,
            `   count: (filter?: object) => Promise<number>;`
        ];
        this.makeDef();
    }
    makeDef() {
        this.tsDboName = `DBO_${this.name}`;
        this.tsDboDef = `type ${this.tsDboName} = {\n ${this.tsDboDefs.join("\n")} \n};\n`;
    }
    getFullDef() {
        return [];
    }
    async validateViewRules(fields, filterFields, returningFields, forcedFilter, rule) {
        /* Safely test publish rules */
        if (fields) {
            try {
                this.parseFieldFilter(fields);
            }
            catch (e) {
                throw ` issue with publish.${this.name}.${rule}.fields: \nVALUE: ` + JSON.stringify(fields, null, 2) + "\nERROR: " + e;
            }
        }
        if (filterFields) {
            try {
                this.parseFieldFilter(filterFields);
            }
            catch (e) {
                throw ` issue with publish.${this.name}.${rule}.filterFields: \nVALUE: ` + JSON.stringify(filterFields, null, 2) + "\nERROR: " + e;
            }
        }
        if (returningFields) {
            try {
                this.parseFieldFilter(returningFields);
            }
            catch (e) {
                throw ` issue with publish.${this.name}.${rule}.returningFields: \nVALUE: ` + JSON.stringify(returningFields, null, 2) + "\nERROR: " + e;
            }
        }
        if (forcedFilter) {
            try {
                await this.find(forcedFilter, { limit: 0 });
            }
            catch (e) {
                throw ` issue with publish.${this.name}.${rule}.forcedFilter: \nVALUE: ` + JSON.stringify(forcedFilter, null, 2) + "\nERROR: " + e;
            }
        }
        return true;
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
    async buildJoinQuery(q) {
        if (this.dboBuilder.prostgles.joins && !this.dboBuilder.joinPaths)
            await this.dboBuilder.parseJoins();
        this.joinPaths = this.dboBuilder.joinPaths;
        const getJoins = (source, target) => {
            let result = [];
            /* Find the join path between tables */
            let jp = this.joinPaths.find(j => j.t1 === source && j.t2 === target);
            if (!jp)
                throw `Could not find a join from ${source} to ${target}`;
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
                    table: t2,
                    on
                };
            });
            return result;
        }, makeQuery3 = (q, isJoined = false) => {
            const PREF = `prostgles_prefix_to_avoid_collisions`, joins = q.joins || [], aggs = q.aggs || [];
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
                return `` +
                    `   SELECT ${select} \n ` +
                    `   FROM ${q.table}\n` +
                    `   ${q.where}\n` +
                    `   ${groupBy}\n` +
                    `   ${q.orderBy}\n` +
                    (isJoined ? "" : `LIMIT ${q.limit}\nOFFSET ${q.offset || 0}`);
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
                `         json_agg(${j.table}_${PREF}_json::jsonb ORDER BY ${j.table}_${PREF}_rowid_sorted)   FILTER (WHERE ${j.table}_${PREF}_limit <= ${j.limit} AND ${j.table}_${PREF}_dupes_rowid = 1 AND ${j.table}_${PREF}_json IS NOT NULL)->0  AS ${j.table}` :
                `COALESCE(json_agg(${j.table}_${PREF}_json::jsonb ORDER BY ${j.table}_${PREF}_rowid_sorted)   FILTER (WHERE ${j.table}_${PREF}_limit <= ${j.limit} AND ${j.table}_${PREF}_dupes_rowid = 1 AND ${j.table}_${PREF}_json IS NOT NULL), '[]')  AS ${j.table}`)).join(", ")}
            FROM (
                SELECT *,
                ${joins.map(j => `row_number() over(partition by ${j.table}_${PREF}_dupes_rowid, ctid order by ${j.table}_${PREF}_rowid_sorted) AS ${j.table}_${PREF}_limit`).join(", ")}
                FROM (
                    SELECT 
                     -- [source full sellect + ctid to group by]
                    ${q.allFields.concat(["ctid"]).map(field => `${q.table}.${field}`).concat(joins.map(j => `${j.table}.${j.table}_${PREF}_json, ${j.table}.${j.table}_${PREF}_rowid_sorted`)).concat(
            // ${j.joins && j.joins.length? " ORDER BY  " : ""}
            joins.map(j => `row_number() over(partition by ${j.table}_${PREF}_rowid_sorted, ${q.table}.ctid ) AS ${j.table}_${PREF}_dupes_rowid`)).join("\n, ")}
                    FROM (
                        SELECT *, row_number() over() as ctid
                        FROM ${q.table}

                        -- [source filter]
                        ${q.where}
                        

                    ) ${q.table}
                    ${joins.map(j => joinTables(q, j)).join("\n")}
                ) t
            ) t            
            GROUP BY ${(aggs && aggs.length ? [] : ["ctid"]).concat(isJoined ? q.allFields : q.select).filter(s => s).join(", ")}\n` +
                `-- [source orderBy]   \n` +
                `   ${q.orderBy}\n` +
                `-- [source limit] \n` +
                (isJoined ? "" : `LIMIT ${q.limit || 0}\nOFFSET ${q.offset || 0}\n`);
            function joinTables(q1, q2) {
                const paths = getJoins(q1.table, q2.table);
                return `${paths.map(({ table, on }, i) => {
                    const prevTable = i === 0 ? q1.table : paths[i - 1].table;
                    let iQ = table;
                    /* If target table then add filters, options, etc */
                    if (i === paths.length - 1) {
                        iQ = "" +
                            "   (\n" +
                            `       SELECT *,\n` +
                            `       row_number() over() as ${table}_${PREF}_rowid_sorted,\n` +
                            `       row_to_json((select x from (SELECT ${(q2.select.concat((q2.joins || []).map(j => j.table))).join(", ")}) as x)) AS ${q2.table}_${PREF}_json\n` +
                            `       FROM (\n` +
                            `           ${makeQuery3(q2, true)}\n` +
                            `       ) ${q2.table}        -- [target table]\n` +
                            `   ) ${q2.table}\n`;
                    }
                    return "" +
                        `   ${q2.isLeftJoin ? "LEFT" : "INNER"} JOIN ${iQ}\n` +
                        `   ON ${on.map(([c1, c2]) => `${prevTable}.${c1} = ${table}.${c2}`).join("\n AND ")}\n`;
                }).join("")}`;
            }
            makeQuery3;
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
        return nonAliased.concat(aliased);
    }
    async buildQueryTree(filter, selectParams, param3_unused = null, tableRules, localParams) {
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
            let aggFields = _Aggs.map(a => a.field);
            aggAliases = _Aggs.map(a => a.alias);
            aggs = _Aggs.map(a => a.query);
            if (aggs.length) {
                /* Validate fields from aggs */
                await this.prepareValidatedQuery({}, { select: aggFields }, param3_unused, tableRules, localParams);
            }
            joins = Object.keys(select).filter(key => !aggAliases.includes(key) && (select[key] === "*" || isPlainObject(select[key])));
            if (joins && joins.length) {
                if (!this.dboBuilder.joinPaths)
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
                        joinTableRules = await this.dboBuilder.publishParser.getValidatedRequestRule({ tableName: jTable, command: "find", socket: localParams.socket });
                    }
                    if (isLocal || joinTableRules) {
                        const joinQuery = await this.dboBuilder.dbo[jTable].buildQueryTree(jFilter, { select: jSelect, limit: jLimit, offset: jOffset, orderBy: jOrder }, param3_unused, joinTableRules, localParams);
                        joinQuery.isLeftJoin = isLeftJoin;
                        joinQueries.push(joinQuery);
                    }
                }
            }
            mainSelect = PubSubManager_1.filterObj(select, Object.keys(select).filter(key => !(aggAliases.concat(joins).includes(key))));
            if (Object.keys(mainSelect).length < 1)
                mainSelect = "";
            if (Object.keys(select).includes("*")) {
                if (Object.values(select).find(v => [true, false, 1, 0].includes(v)))
                    throw "\nCannot use all ('*') together with other fields ";
                mainSelect = "*";
            }
        }
        let q = await this.prepareValidatedQuery(filter, { ...selectParams, select: mainSelect }, param3_unused, tableRules, localParams, aggAliases);
        q.joins = joinQueries;
        q.aggs = aggs;
        return q;
    }
    checkFilter(filter) {
        if (filter === null || filter && !isPojoObject(filter))
            throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
    }
    async prepareValidatedQuery(filter, selectParams, param3_unused = null, tableRules, localParams, validatedAggAliases) {
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
                    await this.validateViewRules(fields, filterFields, null, forcedFilter, "select");
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
                where: this.prepareWhere(filter, forcedFilter, filterFields, null, tableAlias),
                limit: this.prepareLimitQuery(limit, maxLimit),
                offset: this.prepareOffsetQuery(offset)
            };
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw ` Issue with dbo.${this.name}.find: \n    -> ` + e;
        }
    }
    async find(filter, selectParams, param3_unused = null, tableRules, localParams) {
        try {
            filter = filter || {};
            const { expectOne = false } = selectParams || {};
            const { testRule = false } = localParams || {};
            // const statement = await this.prepareValidatedQuery(filter, selectParams, param3_unused, tableRules, localParams),
            //     _query = statement.query;
            if (testRule) {
                await this.prepareValidatedQuery(filter, selectParams, param3_unused, tableRules, localParams);
                return undefined;
            }
            const q = await this.buildQueryTree(filter, selectParams, param3_unused, tableRules, localParams), _query = await this.buildJoinQuery(q);
            // console.log(_query);
            if (testRule)
                return [];
            if (expectOne)
                return this.db.oneOrNone(_query);
            else
                return this.db.any(_query);
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.find:\n    -> ` + e;
        }
    }
    findOne(filter, selectParams, param3_unused, table_rules, localParams) {
        try {
            const expectOne = true;
            const { select = "*", orderBy = null } = selectParams || {};
            return this.find(filter, { select, orderBy, limit: 1, expectOne }, null, table_rules, localParams);
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.findOne:\n     -> ` + e;
        }
    }
    count(filter, param2_unused, param3_unused, table_rules, localParams = {}) {
        filter = filter || {};
        try {
            return this.find(filter, { select: "", limit: 0 }, null, table_rules, localParams)
                .then(allowed => {
                const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {};
                let query = "SELECT COUNT(*) FROM ${_psqlWS_tableName:raw} " + this.prepareWhere(filter, forcedFilter, filterFields, false);
                return this.db.one(query, { _psqlWS_tableName: this.name }).then(({ count }) => +count);
            });
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.count:\n     -> ` + e;
        }
    }
    subscribe(filter, params, localFunc, table_rules, localParams) {
        try {
            if (!localParams && !localFunc)
                throw " missing data. provide -> localFunc | localParams { socket } ";
            const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {}, condition = this.prepareWhere(filter, forcedFilter, filterFields, true);
            if (!localFunc) {
                return this.find(filter, { ...params, limit: 0 }, null, table_rules, localParams)
                    .then(isValid => {
                    const { socket = null } = localParams;
                    return this.pubSubManager.addSub({
                        table_info: this.tableOrViewInfo,
                        socket,
                        table_rules,
                        condition,
                        func: localFunc,
                        filter: { ...filter },
                        params: { ...params },
                        channel_name: null,
                        socket_id: socket.id,
                        table_name: this.name,
                        last_throttled: 0
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
                    filter: { ...filter },
                    params: { ...params },
                    channel_name: null,
                    socket_id: null,
                    table_name: this.name,
                    last_throttled: 0
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
            throw `Issue with dbo.${this.name}.subscribe:\n ->      ` + e;
        }
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
    prepareWhere(filter, forcedFilter, filterFields, excludeWhere = false, tableAlias) {
        const parseFilter = (f, parentFilter = null) => {
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
                let conditions = group.map(gf => parseFilter(gf, group)).filter(c => c);
                if (conditions && conditions.length) {
                    if (conditions.length === 1)
                        return conditions.join(operand);
                    else
                        return ` ( ${conditions.sort().join(operand)} ) `;
                }
            }
            else if (!group) {
                result = this.getCondition({ ...f }, this.parseFieldFilter(filterFields), tableAlias);
            }
            return result;
        };
        if (!isPlainObject(filter))
            throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);
        let result = "";
        let _filter = { ...filter };
        if (forcedFilter) {
            _filter = {
                $and: [forcedFilter, _filter].filter(f => f)
            };
        }
        // let keys = Object.keys(filter);
        // if(!keys.length) return result;
        let cond = parseFilter(_filter, null);
        if (cond) {
            if (excludeWhere)
                return cond;
            else
                return " WHERE " + cond;
        }
        return "";
    }
    /* NEW API !!! :) */
    getCondition(filter, allowed_colnames, tableAlias) {
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
            { aliases: ["@>"], get: (key, val, col) => "${key:raw} @> " + parseDataType(key, col) },
            { aliases: ["<@"], get: (key, val, col) => "${key:raw} <@ " + parseDataType(key, col) },
            { aliases: ["&&"], get: (key, val, col) => "${key:raw} && " + parseDataType(key, col) },
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
        let data = { ...filter };
        if (allowed_colnames) {
            const invalidColumn = Object.keys(data)
                .find(fName => !allowed_colnames.includes(fName));
            if (invalidColumn) {
                throw 'invalid columns in filter: ' + invalidColumn;
            }
        }
        let template = Object.keys(data)
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
                        return pgp.as.format(op.get(fKey, d[operand_key], col), { key: getRawFieldName(fKey), data: d[operand_key], prefix });
                    });
                    // if(Object.keys(d).length){
                    // } else throw `\n Unrecognised statement for field ->   ${fKey}: ` + JSON.stringify(d);
                }
            }
            return pgp.as.format("${key:raw} = " + parseDataType(fKey), { key: getRawFieldName(fKey), data: data[fKey], prefix });
        }).flat()
            .sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
            .join(" AND ");
        return template; //pgp.as.format(template, data);
        /*
            SHOULD CHECK DATA TYPES TO AVOID "No operator matches the given data type" error
            console.log(table.columns)
        */
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
        let _obj = { ...obj };
        if (allowed_cols) {
            _allowed_cols = this.parseFieldFilter(allowed_cols, false);
        }
        let final_filter = { ..._obj }, filter_keys = Object.keys(final_filter);
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
            final_filter = { ...final_filter, ...forcedData };
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
                        return all_fields.filter(col => allowed.includes(col));
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
                throw "\nUnrecognised or illegal fields: " + bad_keys.join();
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
    constructor(db, tableOrViewInfo, pubSubManager, dboBuilder) {
        super(db, tableOrViewInfo, pubSubManager, dboBuilder);
        this.tsDboDefs = this.tsDboDefs.concat([
            `   update: (filter: object, newData: ${this.tsDataName}, params?: UpdateParams) => Promise<void | ${this.tsDataName}>;`,
            `   upsert: (filter: object, newData: ${this.tsDataName}, params?: UpdateParams) => Promise<void | ${this.tsDataName}>;`,
            `   insert: (data: (${this.tsDataName} | ${this.tsDataName}[]), params?: InsertParams) => Promise<void | ${this.tsDataName}>;`,
            `   delete: (filter: object, params?: DeleteParams) => Promise<void | ${this.tsDataName}>;`,
        ]);
        this.makeDef();
        this.remove = this.delete;
        this.io_stats = {
            since: Date.now(),
            queries: 0,
            throttle_queries_per_sec: 500,
            batching: null
        };
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
    async update(filter, newData, params, tableRules, localParams = null) {
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
                    await this.validateViewRules(fields, filterFields, returningFields, forcedFilter, "update");
                    if (forcedData) {
                        try {
                            const { data, columnSet } = this.validateNewData({ row: forcedData, forcedData: null, allowedFields: "*", tableRules, fixIssues: false });
                            let query = pgp.helpers.update(data, columnSet) + " WHERE FALSE ";
                            await this.db.any("EXPLAIN " + query);
                        }
                        catch (e) {
                            throw " issue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                        }
                    }
                    return true;
                }
            }
            let { returning, multi = true, onConflictDoNothing = false, fixIssues = false } = params || {};
            /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
            let _fields = this.parseFieldFilter(fields);
            if (forcedFilter) {
                let _forcedFilterKeys = Object.keys(forcedFilter);
                _fields = _fields.filter(fkey => !_forcedFilterKeys.includes(fkey));
            }
            const { data, columnSet } = this.validateNewData({ row: newData, forcedData, allowedFields: _fields, tableRules, fixIssues });
            let query = pgp.helpers.update(data, columnSet);
            query += this.prepareWhere(filter, forcedFilter, filterFields);
            if (onConflictDoNothing)
                query += " ON CONFLICT DO NOTHING ";
            let qType = "none";
            if (returning) {
                qType = multi ? "any" : "one";
                query += " RETURNING " + this.prepareSelect(returning, returningFields);
            }
            return this.db.tx(t => t[qType](query));
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.update:\n    -> ` + e;
        }
    }
    ;
    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }) {
        const synced_field = utils_1.get(tableRules || {}, "sync.synced_field");
        if (synced_field && !row[synced_field]) {
            row[synced_field] = Date.now();
        }
        let data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
        const dataKeys = Object.keys(data);
        if (!dataKeys.length)
            throw "missing/invalid data provided";
        let cs = new pgp.helpers.ColumnSet(this.columnSet.columns.filter(c => dataKeys.includes(c.name)), { table: this.name });
        return { data, columnSet: cs };
    }
    async insert(data, param2, param3_unused, tableRules, localParams = null) {
        try {
            const { returning, onConflictDoNothing, fixIssues = false } = param2 || {};
            const { testRule = false } = localParams || {};
            let returningFields, forcedData, fields;
            if (tableRules) {
                if (!tableRules.insert)
                    throw "insert rules missing for " + this.name;
                returningFields = tableRules.insert.returningFields;
                forcedData = tableRules.insert.forcedData;
                fields = tableRules.insert.fields;
                if (!fields)
                    throw ` invalid insert rule for ${this.name}. fields missing `;
                /* Safely test publish rules */
                if (testRule) {
                    await this.validateViewRules(fields, null, returningFields, null, "insert");
                    if (forcedData) {
                        const keys = Object.keys(forcedData);
                        if (keys.length) {
                            try {
                                const values = pgp.helpers.values(forcedData), colNames = this.prepareSelect(keys, this.column_names);
                                await this.db.any("EXPLAIN INSERT INTO ${name:raw} (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { name: this.name, colNames, values });
                            }
                            catch (e) {
                                throw "\nissue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                            }
                        }
                    }
                    return true;
                }
            }
            if (!data)
                throw "Provide data in param1";
            const makeQuery = (row) => {
                if (!isPojoObject(row))
                    throw "\ninvalid insert data provided -> " + JSON.stringify(row);
                const { data, columnSet } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
                return pgp.helpers.insert(data, columnSet);
            };
            let conflict_query = "";
            if (typeof onConflictDoNothing === "boolean" && onConflictDoNothing) {
                conflict_query = " ON CONFLICT DO NOTHING ";
            }
            let query = "";
            if (Array.isArray(data)) {
                // if(returning) throw "Sorry but [returning] is dissalowed for multi insert";
                let queries = data.map(p => {
                    return makeQuery(p) + conflict_query;
                });
                query = pgp.helpers.concat(queries);
            }
            else {
                query = makeQuery(data);
            }
            let queryType = "none";
            if (returning) {
                query += " RETURNING " + this.prepareSelect(returning, returningFields, false);
                queryType = "one";
            }
            return this.db.tx(t => t[queryType](query));
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.insert:\n    -> ` + e;
        }
    }
    ;
    async delete(filter, params, param3_unused, table_rules, localParams = null) {
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
                    await this.validateViewRules(null, filterFields, returningFields, forcedFilter, "delete");
                    return true;
                }
            }
            let queryType = 'none';
            let _query = pgp.as.format("DELETE FROM ${_psqlWS_tableName:raw} ", { _psqlWS_tableName: this.name });
            _query += this.prepareWhere(filter, forcedFilter, filterFields);
            if (returning) {
                queryType = "any";
                _query += " RETURNING " + this.prepareSelect(returning, returningFields);
            }
            return this.db[queryType](_query, { _psqlWS_tableName: this.name });
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.delete:\n    -> ` + e;
        }
    }
    ;
    remove(filter, params, param3_unused, tableRules, localParams = null) {
        return this.delete(filter, params, param3_unused, tableRules, localParams);
    }
    async upsert(filter, newData, params, table_rules, localParams = null) {
        try {
            return this.find(filter, { select: "", limit: 1 }, {}, table_rules, localParams)
                .then(exists => {
                if (exists && exists.length) {
                    // console.log(filter, "exists");
                    return this.update(filter, newData, params, table_rules, localParams);
                }
                else {
                    // console.log(filter, "existnts")
                    return this.insert({ ...newData, ...filter }, params, null, table_rules, localParams);
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
            throw `Issue with dbo.${this.name}.upsert:\n    -> ` + e;
        }
    }
    ;
    /* External request. Cannot sync from server */
    async sync(filter, params, param3_unused, table_rules, localParams) {
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
                .then(isValid => {
                const { filterFields, forcedFilter } = utils_1.get(table_rules, "select") || {};
                // let final_filter = getFindFilter(filter, table_rules);
                return this.pubSubManager.addSync({
                    table_info: this.tableOrViewInfo,
                    condition: this.prepareWhere(filter, forcedFilter, filterFields, true),
                    id_fields, synced_field, allow_delete,
                    socket,
                    table_rules,
                    filter: { ...filter },
                    params: { ...params }
                }).then(channelName => ({ channelName, id_fields, synced_field }));
            });
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw `Issue with dbo.${this.name}.sync:\n     -> ` + e;
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
    }
}
exports.TableHandler = TableHandler;
const Prostgles_1 = require("./Prostgles");
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
    async parseJoins() {
        if (this.prostgles.joins) {
            let joins = await this.prostgles.joins;
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
                // 2 find incorrect tables
                const missing = joins.map(j => j.tables).flat().find(t => !this.dbo[t]);
                if (missing) {
                    throw "Table not found: " + missing;
                }
                // 3 find incorrect fields
                joins.map(({ tables, on }) => {
                    const t1 = tables[0], t2 = tables[1], f1s = Object.keys(on), f2s = Object.values(on);
                    [[t1, f1s], [t2, f2s]].map(v => {
                        var t = v[0], f = v[1];
                        if (!this.dbo[t])
                            throw "Table not found: " + t;
                        const m1 = f.filter(k => !this.dbo[t].column_names.includes(k));
                        if (m1 && m1.length) {
                            throw `Table ${t}(${this.dbo[t].column_names.join()}) has no fields named: ${m1.join()}`;
                        }
                    });
                });
                // 4 find incorrect/missing join types
                const expected_types = " \n\n-> Expecting: " + Prostgles_1.JOIN_TYPES.map(t => JSON.stringify(t)).join(` | `);
                const mt = joins.find(j => !j.type);
                if (mt)
                    throw "Join type missing for: " + JSON.stringify(mt, null, 2) + expected_types;
                const it = joins.find(j => !Prostgles_1.JOIN_TYPES.includes(j.type));
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
            const tables = this.joins.map(t => t.tables).flat();
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
            // console.log(this.dbo.pixels.column_names)
        }
        return this.joinPaths;
    }
    buildJoinPaths() {
    }
    async init() {
        this.tablesOrViews = await getTablesForSchemaPostgresSQL(this.db, this.schema);
        let allDataDefs = "";
        let allDboDefs = "";
        const common_types = `/* This file was generated by Prostgles 
* ${(new Date).toUTCString()} 
*/

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
`;
        this.dboDefinition = `export type DBObj = {\n`;
        this.tablesOrViews.map(tov => {
            if (tov.is_view) {
                this.dbo[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager, this);
            }
            else {
                this.dbo[tov.name] = new TableHandler(this.db, tov, this.pubSubManager, this);
            }
            allDataDefs += this.dbo[tov.name].tsDataDef + "\n";
            allDboDefs += this.dbo[tov.name].tsDboDef;
            this.dboDefinition += ` ${tov.name}: ${this.dbo[tov.name].tsDboName};\n`;
        });
        await this.parseJoins();
        this.dboDefinition += "};\n";
        this.tsTypesDefinition = [common_types, allDataDefs, allDboDefs, this.dboDefinition].join("\n");
        return this.dbo;
        // let dbo = makeDBO(db, allTablesViews, pubSubManager, true);
    }
}
exports.DboBuilder = DboBuilder;
let pgp = pgPromise({
    promiseLib: Bluebird
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});
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
//# sourceMappingURL=DboBuilder.js.map
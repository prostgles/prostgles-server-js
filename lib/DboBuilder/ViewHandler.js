"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewHandler = void 0;
const makeSelectQuery_1 = require("../DboBuilder/QueryBuilder/makeSelectQuery");
const runSQL_1 = require("../DboBuilder/runSQL");
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager");
const QueryBuilder_1 = require("./QueryBuilder/QueryBuilder");
const Functions_1 = require("./QueryBuilder/Functions");
const Filtering_1 = require("../Filtering");
const getColumns_1 = require("./getColumns");
const FILTER_FUNCS = Functions_1.FUNCTIONS.filter(f => f.canBeUsedForFilter);
class ColSet {
    constructor(columns, tableName) {
        this.opts = { columns, tableName, colNames: columns.map(c => c.name) };
    }
    async getRow(data, allowedCols, dbTx, validate) {
        const badCol = allowedCols.find(c => !this.opts.colNames.includes(c));
        if (!allowedCols || badCol) {
            throw "Missing or unexpected columns: " + badCol;
        }
        if ((0, prostgles_types_1.isEmpty)(data))
            throw "No data";
        let row = (0, prostgles_types_1.pickKeys)(data, allowedCols);
        if (validate) {
            row = await validate(row, dbTx);
        }
        const rowKeys = Object.keys(row);
        return rowKeys.map(key => {
            const col = this.opts.columns.find(c => c.name === key);
            if (!col)
                throw "Unexpected missing col name";
            /**
             * Add conversion functions for PostGIS data
             */
            let escapedVal = "";
            if (["geometry", "geography"].includes(col.udt_name) && row[key] && (0, DboBuilder_1.isPlainObject)(row[key])) {
                const basicFunc = (args) => {
                    return args.map(arg => (0, PubSubManager_1.asValue)(arg)).join(", ");
                };
                const convertionFuncs = [
                    ...[
                        "ST_GeomFromText",
                        "ST_Point",
                        "ST_MakePoint",
                        "ST_MakePointM",
                        "ST_PointFromText",
                        "ST_GeomFromEWKT",
                        "ST_GeomFromGeoJSON"
                    ].map(name => ({
                        name,
                        getQuery: () => `${name}(${basicFunc(funcArgs)})`
                    })),
                    {
                        name: "to_timestamp",
                        getQuery: (args) => `to_timestamp(${(0, PubSubManager_1.asValue)(args[0])}::BIGINT/1000.0)::timestamp`
                    }
                ];
                const dataKeys = Object.keys(row[key]);
                const funcName = dataKeys[0];
                const func = convertionFuncs.find(f => f.name === funcName);
                const funcArgs = row[key]?.[funcName];
                if (dataKeys.length !== 1 || !func || !Array.isArray(funcArgs)) {
                    throw `Expecting only one function key (${convertionFuncs.join(", ")}) \nwith an array of arguments \n within column (${key}) data but got: ${JSON.stringify(row[key])} \nExample: { geo_col: { ST_GeomFromText: ["POINT(-71.064544 42.28787)", 4326] } }`;
                }
                escapedVal = func.getQuery(funcArgs);
            }
            else {
                /** Prevent pg-promise formatting jsonb */
                const colIsJSON = ["json", "jsonb"].includes(col.data_type);
                escapedVal = DboBuilder_1.pgp.as.format(colIsJSON ? "$1:json" : "$1", [row[key]]);
            }
            /**
             * Cast to type to avoid array errors (they do not cast automatically)
             */
            escapedVal += `::${col.udt_name}`;
            return {
                escapedCol: (0, prostgles_types_1.asName)(key),
                escapedVal,
            };
        });
    }
    async getInsertQuery(data, allowedCols, dbTx, validate) {
        const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async (d) => {
            const rowParts = await this.getRow(d, allowedCols, dbTx, validate);
            const select = rowParts.map(r => r.escapedCol).join(", "), values = rowParts.map(r => r.escapedVal).join(", ");
            return `INSERT INTO ${(0, prostgles_types_1.asName)(this.opts.tableName)} (${select}) VALUES (${values})`;
        }))).join(";\n") + " ";
        return res;
    }
    async getUpdateQuery(data, allowedCols, dbTx, validate) {
        const res = (await Promise.all((Array.isArray(data) ? data : [data]).map(async (d) => {
            const rowParts = await this.getRow(d, allowedCols, dbTx, validate);
            return `UPDATE ${(0, prostgles_types_1.asName)(this.opts.tableName)} SET ` + rowParts.map(r => `${r.escapedCol} = ${r.escapedVal} `).join(",\n");
        }))).join(";\n") + " ";
        return res;
    }
}
class ViewHandler {
    constructor(db, tableOrViewInfo, dboBuilder, t, dbTX, joinPaths) {
        this.tsColumnDefs = [];
        this.is_view = true;
        this.filterDef = "";
        // pubSubManager: PubSubManager;
        this.is_media = false;
        // TODO: fix renamed table trigger problem
        this.getColumns = getColumns_1.getColumns.bind(this);
        if (!db || !tableOrViewInfo)
            throw "";
        this.db = db;
        this.t = t;
        this.dbTX = dbTX;
        this.joinPaths = joinPaths;
        this.tableOrViewInfo = tableOrViewInfo;
        this.name = tableOrViewInfo.name;
        this.escapedName = (0, prostgles_types_1.asName)(this.name);
        this.columns = tableOrViewInfo.columns;
        /* cols are sorted by name to reduce .d.ts schema rewrites */
        this.columnsForTypes = tableOrViewInfo.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
        this.column_names = tableOrViewInfo.columns.map(c => c.name);
        // this.pubSubManager = pubSubManager;
        this.dboBuilder = dboBuilder;
        this.joins = this.dboBuilder.joins ?? [];
        // fix this
        // and also make hot schema reload over ws 
        this.colSet = new ColSet(this.columns, this.name);
        const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;
        // this.tsDataName = snakify(this.name, true);
        // if(this.tsDataName === "T") this.tsDataName = this.tsDataName + "_";
        // this.tsDataDef = `export type ${this.tsDataName} = {\n`;
        this.columnsForTypes.map(({ name, udt_name, is_nullable }) => {
            this.tsColumnDefs.push(`${(0, DboBuilder_1.escapeTSNames)(name)}?: ${(0, DboBuilder_1.postgresToTsType)(udt_name)} ${is_nullable ? " | null " : ""};`);
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
                .map(f => (tableAlias ? ((0, prostgles_types_1.asName)(tableAlias) + ".") : "") + (0, prostgles_types_1.asName)(f))
                .map(f => `md5(coalesce(${f}::text, 'dd'))`)
                .join(" || ") +
            `)` + (alias ? ` as ${(0, prostgles_types_1.asName)(alias)}` : "");
    }
    async validateViewRules(args) {
        const { fields, filterFields, returningFields, forcedFilter, dynamicFields, rule, } = args;
        /* Safely test publish rules */
        if (fields) {
            try {
                const _fields = this.parseFieldFilter(fields);
                if (this.is_media && rule === "insert" && !_fields.includes("id")) {
                    throw "Must allow id insert for media table";
                }
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
                await this.find(forcedFilter, { limit: 0 });
            }
            catch (e) {
                throw ` issue with publish.${this.name}.${rule}.forcedFilter: \nVALUE: ` + JSON.stringify(forcedFilter, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
            }
        }
        if (dynamicFields) {
            for await (const dfieldRule of dynamicFields) {
                try {
                    const { fields, filter } = dfieldRule;
                    this.parseFieldFilter(fields);
                    await this.find(filter, { limit: 0 });
                }
                catch (e) {
                    throw ` issue with publish.${this.name}.${rule}.dynamicFields: \nVALUE: ` + JSON.stringify(dfieldRule, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
                }
            }
        }
        return true;
    }
    getShortestJoin(table1, table2, startAlias, isInner = false) {
        // let searchedTables = [], result; 
        // while (!result && searchedTables.length <= this.joins.length * 2){
        // }
        const getJoinCondition = (on, leftTable, rightTable) => {
            return on.map(cond => Object.keys(cond).map(lKey => `${leftTable}.${lKey} = ${rightTable}.${cond[lKey]}`).join("\nAND ")).join(" OR ");
        };
        let toOne = true, query = this.joins.map(({ tables, on, type }, i) => {
            if (type.split("-")[1] === "many") {
                toOne = false;
            }
            const tl = `tl${startAlias + i}`, tr = `tr${startAlias + i}`;
            return `FROM ${tables[0]} ${tl} ${isInner ? "INNER" : "LEFT"} JOIN ${tables[1]} ${tr} ON ${getJoinCondition(on, tl, tr)}`;
        }).join("\n");
        return { query, toOne: false };
    }
    getJoins(source, target, path, checkTableConfig) {
        let paths = [];
        if (!this.joinPaths)
            throw `${source} - ${target} Join info missing or dissallowed`;
        if (path && !path.length)
            throw `Empty join path ( $path ) specified for ${source} <-> ${target}`;
        /* Find the join path between tables */
        if (checkTableConfig) {
            const tableConfigJoinInfo = this.dboBuilder?.prostgles?.tableConfigurator?.getJoinInfo(source, target);
            if (tableConfigJoinInfo)
                return tableConfigJoinInfo;
        }
        let jp;
        if (!path) {
            jp = this.joinPaths.find(j => j.t1 === source && j.t2 === target);
        }
        else {
            jp = {
                t1: source,
                t2: target,
                path
            };
        }
        /* Self join */
        if (source === target) {
            const tableHandler = this.dboBuilder.tablesOrViews?.find(t => t.name === source);
            if (!tableHandler)
                throw `Table not found for joining ${source}`;
            const fcols = tableHandler.columns.filter(c => c.references?.some(({ ftable }) => ftable === this.name));
            if (fcols.length) {
                throw "Self referencing not supported yet";
                // return {
                //     paths: [{
                //         source,
                //         target,
                //         table: target,
                //         on: fcols.map(fc => fc.references!.some(({ fcols }) => fcols.map(fcol => [fc.name,  fcol])))
                //     }],
                //     expectOne: false
                // }
            }
        }
        if (!jp || !this.joinPaths.find(j => path ? j.path.join() === path.join() : j.t1 === source && j.t2 === target)) {
            throw `Joining ${source} <-...-> ${target} dissallowed or missing`;
        }
        /* Make the join chain info excluding root table */
        paths = (path || jp.path).slice(1).map((t2, i, arr) => {
            const t1 = i === 0 ? source : arr[i - 1];
            this.joins ?? (this.joins = this.dboBuilder.joins);
            /* Get join options */
            const jo = this.joins.find(j => j.tables.includes(t1) && j.tables.includes(t2));
            if (!jo)
                throw `Joining ${t1} <-> ${t2} dissallowed or missing`;
            ;
            let on = [];
            jo.on.map(cond => {
                let condArr = [];
                Object.keys(cond).map(leftKey => {
                    const rightKey = cond[leftKey];
                    /* Left table is joining on keys */
                    if (jo.tables[0] === t1) {
                        condArr.push([leftKey, rightKey]);
                        /* Left table is joining on values */
                    }
                    else {
                        condArr.push([rightKey, leftKey]);
                    }
                });
                on.push(condArr);
            });
            return {
                source,
                target,
                table: t2,
                on
            };
        });
        let expectOne = false;
        // paths.map(({ source, target, on }, i) => {
        // if(expectOne && on.length === 1){
        //     const sourceCol = on[0][1];
        //     const targetCol = on[0][0];
        //     const sCol = this.dboBuilder.dbo[source].columns.find(c => c.name === sourceCol)
        //     const tCol = this.dboBuilder.dbo[target].columns.find(c => c.name === targetCol)
        //     console.log({ sourceCol, targetCol, sCol, source, tCol, target, on})
        //     expectOne = sCol.is_pkey && tCol.is_pkey
        // }
        // })
        return {
            paths,
            expectOne
        };
    }
    checkFilter(filter) {
        if (filter === null || filter && !(0, prostgles_types_1.isObject)(filter))
            throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
    }
    async getInfo(lang, param2, param3, tableRules, localParams) {
        const p = this.getValidatedRules(tableRules, localParams);
        if (!p.getInfo)
            throw "Not allowed";
        let has_media = undefined;
        const mediaTable = this.dboBuilder.prostgles?.opts?.fileTable?.tableName;
        if (!this.is_media && mediaTable) {
            const joinConf = this.dboBuilder.prostgles?.opts?.fileTable?.referencedTables?.[this.name];
            if (joinConf) {
                has_media = typeof joinConf === "string" ? joinConf : "one";
            }
            else {
                const jp = this.dboBuilder.joinPaths.find(jp => jp.t1 === this.name && jp.t2 === mediaTable);
                if (jp && jp.path.length <= 3) {
                    if (jp.path.length <= 2) {
                        has_media = "one";
                    }
                    else {
                        await Promise.all(jp.path.map(async (tableName) => {
                            const pkeyFcols = this?.dboBuilder?.dbo?.[tableName]?.columns?.filter(c => c.is_pkey).map(c => c.name);
                            const cols = this?.dboBuilder?.dbo?.[tableName]?.columns?.filter(c => c?.references?.some(({ ftable }) => jp.path.includes(ftable)));
                            if (cols && cols.length && has_media !== "many") {
                                if (cols.some(c => !pkeyFcols?.includes(c.name))) {
                                    has_media = "many";
                                }
                                else {
                                    has_media = "one";
                                }
                            }
                        }));
                    }
                }
            }
        }
        return {
            oid: this.tableOrViewInfo.oid,
            comment: this.tableOrViewInfo.comment,
            info: this.dboBuilder.prostgles?.tableConfigurator?.getTableInfo({ tableName: this.name, lang }),
            is_media: this.is_media,
            is_view: this.is_view,
            has_media,
            media_table_name: mediaTable,
            dynamicRules: {
                update: Boolean(tableRules?.update?.dynamicFields?.length)
            }
        };
    }
    getValidatedRules(tableRules, localParams) {
        if (localParams?.socket && !tableRules) {
            throw "INTERNAL ERROR: Unexpected case -> localParams && !tableRules";
        }
        /* Computed fields are allowed only if select is allowed */
        const allColumns = this.column_names.slice(0).map(fieldName => ({
            type: "column",
            name: fieldName,
            getQuery: ({ tableAlias }) => (0, QueryBuilder_1.asNameAlias)(fieldName, tableAlias),
            selected: false
        })).concat(Functions_1.COMPUTED_FIELDS.map(c => ({
            type: c.type,
            name: c.name,
            getQuery: ({ tableAlias, allowedFields }) => c.getQuery({
                allowedFields,
                ctidField: undefined,
                allColumns: this.columns,
                /* CTID not available in AFTER trigger */
                // ctidField: this.is_view? undefined : "ctid",
                tableAlias
            }),
            selected: false
        })));
        if (tableRules) {
            if ((0, prostgles_types_1.isEmpty)(tableRules))
                throw "INTERNAL ERROR: Unexpected case -> Empty table rules for " + this.name;
            const throwFieldsErr = (command, fieldType = "fields") => {
                throw `Invalid publish.${this.name}.${command} rule -> ${fieldType} setting is missing.\nPlease specify allowed ${fieldType} in this format: "*" | { col_name: false } | { col1: true, col2: true }`;
            }, getFirstSpecified = (...fieldParams) => {
                const firstValid = fieldParams.find(fp => fp !== undefined);
                return this.parseFieldFilter(firstValid);
            };
            let res = {
                allColumns,
                getColumns: tableRules?.getColumns ?? true,
                getInfo: tableRules?.getColumns ?? true,
            };
            /* SELECT */
            if (tableRules.select) {
                if (!tableRules.select.fields)
                    return throwFieldsErr("select");
                let maxLimit = null;
                if (tableRules.select.maxLimit !== undefined && tableRules.select.maxLimit !== maxLimit) {
                    const ml = tableRules.select.maxLimit;
                    if (ml !== null && (!Number.isInteger(ml) || ml < 0))
                        throw ` Invalid publish.${this.name}.select.maxLimit -> expecting   a positive integer OR null    but got ` + ml;
                    maxLimit = ml;
                }
                const fields = this.parseFieldFilter(tableRules.select.fields);
                res.select = {
                    fields,
                    orderByFields: tableRules.select.orderByFields ? this.parseFieldFilter(tableRules.select.orderByFields) : fields,
                    forcedFilter: { ...tableRules.select.forcedFilter },
                    filterFields: this.parseFieldFilter(tableRules.select.filterFields),
                    maxLimit
                };
            }
            /* UPDATE */
            if (tableRules.update) {
                if (!tableRules.update.fields)
                    return throwFieldsErr("update");
                res.update = {
                    fields: this.parseFieldFilter(tableRules.update.fields),
                    forcedData: { ...tableRules.update.forcedData },
                    forcedFilter: { ...tableRules.update.forcedFilter },
                    returningFields: getFirstSpecified(tableRules.update?.returningFields, tableRules?.select?.fields, tableRules.update.fields),
                    filterFields: this.parseFieldFilter(tableRules.update.filterFields)
                };
            }
            /* INSERT */
            if (tableRules.insert) {
                if (!tableRules.insert.fields)
                    return throwFieldsErr("insert");
                res.insert = {
                    fields: this.parseFieldFilter(tableRules.insert.fields),
                    forcedData: { ...tableRules.insert.forcedData },
                    returningFields: getFirstSpecified(tableRules.insert.returningFields, tableRules?.select?.fields, tableRules.insert.fields)
                };
            }
            /* DELETE */
            if (tableRules.delete) {
                if (!tableRules.delete.filterFields)
                    return throwFieldsErr("delete", "filterFields");
                res.delete = {
                    forcedFilter: { ...tableRules.delete.forcedFilter },
                    filterFields: this.parseFieldFilter(tableRules.delete.filterFields),
                    returningFields: getFirstSpecified(tableRules.delete.returningFields, tableRules?.select?.fields, tableRules.delete.filterFields)
                };
            }
            if (!tableRules.select && !tableRules.update && !tableRules.delete && !tableRules.insert) {
                if ([null, false].includes(tableRules.getInfo))
                    res.getInfo = false;
                if ([null, false].includes(tableRules.getColumns))
                    res.getColumns = false;
            }
            return res;
        }
        else {
            const all_cols = this.column_names.slice(0);
            return {
                allColumns,
                getColumns: true,
                getInfo: true,
                select: {
                    fields: all_cols,
                    filterFields: all_cols,
                    orderByFields: all_cols,
                    forcedFilter: {},
                    maxLimit: null,
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
    async find(filter, selectParams, param3_unused, tableRules, localParams) {
        try {
            filter = filter || {};
            const allowedReturnTypes = ["row", "value", "values", "statement"];
            const { returnType } = selectParams || {};
            if (returnType && !allowedReturnTypes.includes(returnType)) {
                throw `returnType (${returnType}) can only be ${allowedReturnTypes.join(" OR ")}`;
            }
            const { testRule = false, returnQuery = false } = localParams || {};
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
                let fields, filterFields, forcedFilter, maxLimit;
                if (!tableRules.select)
                    throw "select rules missing for " + this.name;
                fields = tableRules.select.fields;
                forcedFilter = tableRules.select.forcedFilter;
                filterFields = tableRules.select.filterFields;
                maxLimit = tableRules.select.maxLimit;
                if (tableRules.select !== "*" && typeof tableRules.select !== "boolean" && !(0, DboBuilder_1.isPlainObject)(tableRules.select))
                    throw `\nINVALID publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`;
                if (!fields)
                    throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;
                if (maxLimit && !Number.isInteger(maxLimit))
                    throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;
            }
            let q = await (0, QueryBuilder_1.getNewQuery)(this, filter, selectParams, param3_unused, tableRules, localParams, this.columns), _query = (0, makeSelectQuery_1.makeSelectQuery)(this, q, undefined, undefined, selectParams);
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
            if (returnQuery)
                return _query;
            if (returnType === "statement") {
                if (!(await (0, runSQL_1.canRunSQL)(this.dboBuilder.prostgles, localParams))) {
                    throw `Not allowed:  {returnType: "statement"} requires sql privileges `;
                }
                return _query;
            }
            if (["row", "value"].includes(returnType)) {
                return (this.t || this.db).oneOrNone(_query).then(data => {
                    return (data && returnType === "value") ? Object.values(data)[0] : data;
                }).catch(err => (0, DboBuilder_1.makeErr)(err, localParams, this));
            }
            else {
                return (this.t || this.db).any(_query).then(data => {
                    if (returnType === "values") {
                        return data.map(d => Object.values(d)[0]);
                    }
                    return data;
                }).catch(err => (0, DboBuilder_1.makeErr)(err, localParams, this));
            }
        }
        catch (e) {
            // console.trace(e)
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.find()`);
            // throw { err: parseError(e), msg: `Issue with dbo.${this.name}.find()`, args: { filter, selectParams} };
        }
    }
    findOne(filter, selectParams, param3_unused, table_rules, localParams) {
        try {
            const { select = "*", orderBy, offset = 0 } = selectParams || {};
            if (selectParams) {
                const good_params = ["select", "orderBy", "offset"];
                const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
                if (bad_params && bad_params.length)
                    throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }
            return this.find(filter, { select, orderBy, limit: 1, offset, returnType: "row" }, undefined, table_rules, localParams);
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `Issue with dbo.${this.name}.findOne()`);
        }
    }
    async subscribe(filter, params = {}, localFunc, table_rules, localParams) {
        try {
            // if (this.is_view) throw "Cannot subscribe to a view";
            if (this.t)
                throw "subscribe not allowed within transactions";
            if (!localParams && !localFunc)
                throw " missing data. provide -> localFunc | localParams { socket } ";
            if (localParams && localParams.socket && localFunc) {
                console.error({ localParams, localFunc });
                throw " Cannot have localFunc AND socket ";
            }
            const { filterFields, forcedFilter } = table_rules?.select || {}, filterOpts = await this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: undefined, localParams, tableRule: table_rules }), condition = filterOpts.where, throttle = params?.throttle || 0, selectParams = (0, PubSubManager_1.omitKeys)(params || {}, ["throttle"]);
            /** app_triggers condition field has an index which limits it's value */
            const filterSize = JSON.stringify(filter || {}).length;
            if (filterSize * 4 > 2704) {
                throw "filter too big. Might exceed the btree version 4 maximum 2704. Use a primary key or a $rowhash filter instead";
            }
            if (!localFunc) {
                if (!this.dboBuilder.prostgles.isSuperUser)
                    throw "Subscribe not possible. Must be superuser to add triggers 1856";
                return await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams)
                    .then(async (isValid) => {
                    let relatedTableSubscriptions = undefined;
                    if (this.is_view) {
                        const viewName = this.name;
                        const viewNameEscaped = this.escapedName;
                        /** Get list of used columns and their parent tables */
                        let { def } = (await this.db.oneOrNone("SELECT pg_get_viewdef(${viewName}) as def", { viewName }));
                        def = def.trim();
                        if (def.endsWith(";")) {
                            def = def.slice(0, -1);
                        }
                        if (!def || typeof def !== "string")
                            (0, DboBuilder_1.makeErr)("Could get view definition");
                        const { fields } = await this.dboBuilder.dbo.sql(`SELECT * FROM ( \n ${def} \n ) prostgles_subscribe_view_definition LIMIT 0`, {});
                        const tableColumns = fields.filter(f => f.tableName && f.columnName);
                        /** Create exists filters for each table */
                        const tableIds = Array.from(new Set(tableColumns.map(tc => tc.tableID.toString())));
                        relatedTableSubscriptions = tableIds.map(tableID => {
                            const table = this.dboBuilder.USER_TABLES?.find(t => t.relid === +tableID);
                            let tableCols = tableColumns.filter(tc => tc.tableID.toString() === tableID);
                            /** If table has primary keys and they are all in this view then use only primary keys */
                            if (table?.pkey_columns?.every(pkey => tableCols.some(c => c.columnName === pkey))) {
                                tableCols = tableCols.filter(c => table?.pkey_columns?.includes(c.columnName));
                            }
                            else {
                                /** Exclude non comparable data types */
                                tableCols = tableCols.filter(c => !["json", "xml"].includes(c.udt_name));
                            }
                            const { tableName, tableSchema } = tableCols[0];
                            const tableNameEscaped = [table.schemaname, table.relname].map(v => JSON.stringify(v)).join(".");
                            if (!tableCols.length) {
                                return {
                                    tableName: tableName,
                                    tableNameEscaped: this.escapedName,
                                    condition: "TRUE"
                                };
                            }
                            // const tableNameEscaped = [tableSchema!, tableName!].map(v => asName(v)).join(".");
                            const relatedTableSubscription = {
                                tableName: tableName,
                                tableNameEscaped,
                                condition: `EXISTS (
                    SELECT 1
                    FROM ${viewNameEscaped}
                    WHERE ${tableCols.map(c => `${tableNameEscaped}.${JSON.stringify(c.columnName)} = ${viewNameEscaped}.${JSON.stringify(c.name)}`).join(" AND \n")}
                    AND ${condition || "TRUE"}
                  )`
                            };
                            return relatedTableSubscription;
                        });
                        /** Get list of remaining used inner tables */
                        const allUsedTables = await this.db.any("SELECT distinct table_name, table_schema FROM information_schema.view_column_usage WHERE view_name = ${viewName}", { viewName });
                        /** Remaining tables will have listeners on all records (condition = "TRUE") */
                        const remainingInnerTables = allUsedTables.filter(at => !tableColumns.some(dc => dc.tableName === at.table_name && dc.tableSchema === at.table_schema));
                        relatedTableSubscriptions = [
                            ...relatedTableSubscriptions,
                            ...remainingInnerTables.map(t => ({
                                tableName: t.table_name,
                                tableNameEscaped: [t.table_name, t.table_schema].map(v => JSON.stringify(v)).join("."),
                                condition: ""
                            }))
                        ];
                        if (!relatedTableSubscriptions.length) {
                            throw "Could not subscribe to this view: no related tables found";
                        }
                    }
                    const { socket } = localParams ?? {};
                    const pubSubManager = await this.dboBuilder.getPubSubManager();
                    return pubSubManager.addSub({
                        table_info: this.tableOrViewInfo,
                        socket,
                        table_rules,
                        table_name: this.name,
                        condition: condition,
                        relatedTableSubscriptions,
                        func: undefined,
                        filter: { ...filter },
                        params: { ...selectParams },
                        socket_id: socket?.id,
                        throttle,
                        last_throttled: 0,
                    }).then(channelName => ({ channelName }));
                });
            }
            else {
                const pubSubManager = await this.dboBuilder.getPubSubManager();
                pubSubManager.addSub({
                    table_info: this.tableOrViewInfo,
                    socket: undefined,
                    table_rules,
                    condition,
                    func: localFunc,
                    filter: { ...filter },
                    params: { ...selectParams },
                    socket_id: undefined,
                    table_name: this.name,
                    throttle,
                    last_throttled: 0,
                }).then(channelName => ({ channelName }));
                const unsubscribe = async () => {
                    const pubSubManager = await this.dboBuilder.getPubSubManager();
                    pubSubManager.removeLocalSub(this.name, condition, localFunc);
                };
                let res = Object.freeze({ unsubscribe });
                return res;
            }
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.subscribe()`);
        }
    }
    subscribeOne(filter, params = {}, localFunc, table_rules, localParams) {
        let func = localParams ? undefined : (rows) => localFunc(rows[0]);
        return this.subscribe(filter, { ...params, limit: 2 }, func, table_rules, localParams);
    }
    async count(filter, param2_unused, param3_unused, table_rules, localParams) {
        filter = filter || {};
        try {
            return await this.find(filter, { select: "", limit: 0 }, undefined, table_rules, localParams)
                .then(async (allowed) => {
                const { filterFields, forcedFilter } = table_rules?.select || {};
                const where = (await this.prepareWhere({ filter, forcedFilter, filterFields, addKeywords: true, localParams, tableRule: table_rules })).where;
                let query = "SELECT COUNT(*) FROM " + this.escapedName + " " + where;
                return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ count }) => +count);
            });
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.count()`);
        }
    }
    async size(filter, selectParams, param3_unused, table_rules, localParams) {
        filter = filter || {};
        try {
            return await this.find(filter, { ...selectParams, limit: 2 }, undefined, table_rules, localParams)
                .then(async (_allowed) => {
                // let rules: TableRule = table_rules || {};
                // rules.select.maxLimit = Number.MAX_SAFE_INTEGER;
                // rules.select.fields = rules.select.fields || "*";
                const q = await this.find(filter, { ...selectParams, limit: selectParams?.limit ?? Number.MAX_SAFE_INTEGER }, undefined, table_rules, { ...localParams, returnQuery: true });
                const query = `
                      SELECT sum(pg_column_size((prgl_size_query.*))) as size 
                      FROM (
                          ${q}
                      ) prgl_size_query
                  `;
                return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ size }) => size || '0');
            });
        }
        catch (e) {
            if (localParams && localParams.testRule)
                throw e;
            throw (0, DboBuilder_1.parseError)(e, `dbo.${this.name}.size()`);
        }
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
        /** Ensure order is maintained */
        if (selectParams && Array.isArray(selectParams) && typeof selectParams[0] === "string") {
            col_names = col_names.sort((a, b) => selectParams.indexOf(a) - selectParams.indexOf(b));
        }
        try {
            let colSet = new DboBuilder_1.pgp.helpers.ColumnSet(col_names);
            return onlyNames ? colSet.names : colSet;
        }
        catch (e) {
            throw e;
        }
    }
    prepareSelect(selectParams = "*", allowed_cols, allow_empty = true, tableAlias) {
        if (tableAlias) {
            let cs = this.prepareColumnSet(selectParams, allowed_cols, true, false);
            return cs.columns.map(col => `${this.escapedName}.${(0, prostgles_types_1.asName)(col.name)}`).join(", ");
        }
        else {
            return this.prepareColumnSet(selectParams, allowed_cols, true, true);
        }
    }
    async prepareHaving(params) {
        return "";
    }
    /**
     * Parses group or simple filter
     */
    async prepareWhere(params) {
        const { filter, select, forcedFilter, filterFields: ff, addKeywords = true, tableAlias, localParams, tableRule } = params;
        const { $and: $and_key, $or: $or_key } = this.dboBuilder.prostgles.keywords;
        let filterFields = ff;
        /* Local update allow all. TODO -> FIX THIS */
        if (!ff && !tableRule)
            filterFields = "*";
        const parseFullFilter = async (f, parentFilter = null, isForcedFilterBypass) => {
            if (!f)
                throw "Invalid/missing group filter provided";
            let result = "";
            let keys = (0, prostgles_types_1.getKeys)(f);
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
                let conditions = (await Promise.all(group.map(async (gf) => await parseFullFilter(gf, group, isForcedFilterBypass)))).filter(c => c);
                if (conditions && conditions.length) {
                    if (conditions.length === 1)
                        return conditions.join(operand);
                    else
                        return ` ( ${conditions.sort().join(operand)} ) `;
                }
            }
            else if (!group) {
                /** forcedFilters do not get checked against publish and are treated as server-side requests */
                result = await this.getCondition({
                    filter: { ...f },
                    select,
                    allowed_colnames: isForcedFilterBypass ? this.column_names.slice(0) : this.parseFieldFilter(filterFields),
                    tableAlias,
                    localParams: isForcedFilterBypass ? undefined : localParams,
                    tableRules: isForcedFilterBypass ? undefined : tableRule
                });
            }
            return result;
        };
        if (!(0, DboBuilder_1.isPlainObject)(filter))
            throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);
        /* A forced filter condition will not check if the existsJoined filter tables have been published */
        const forcedFilterCond = forcedFilter ? await parseFullFilter(forcedFilter, null, true) : undefined;
        const filterCond = await parseFullFilter(filter, null, false);
        let cond = [
            forcedFilterCond, filterCond
        ].filter(c => c).join(" AND ");
        const finalFilter = forcedFilter ? {
            [$and_key]: [forcedFilter, filter].filter(prostgles_types_1.isDefined)
        } : { ...filter };
        if (cond && addKeywords)
            cond = "WHERE " + cond;
        return { where: cond || "", filter: finalFilter };
    }
    async prepareExistCondition(eConfig, localParams) {
        let res = "";
        const thisTable = this.name;
        const isNotExists = ["$notExists", "$notExistsJoined"].includes(eConfig.existType);
        let { f2, tables, isJoined } = eConfig;
        let t2 = tables[tables.length - 1];
        tables.forEach(t => {
            if (!this.dboBuilder.dbo[t])
                throw { stack: ["prepareExistCondition()"], message: `Invalid or dissallowed table: ${t}` };
        });
        /* Nested $exists not allowed */
        if (f2 && Object.keys(f2).find(fk => DboBuilder_1.EXISTS_KEYS.includes(fk))) {
            throw { stack: ["prepareExistCondition()"], message: "Nested exists dissallowed" };
        }
        const makeTableChain = (finalFilter) => {
            let joinPaths = [];
            let expectOne = true;
            tables.map((t2, depth) => {
                let t1 = depth ? tables[depth - 1] : thisTable;
                let exactPaths = [t1, t2];
                if (!depth && eConfig.shortestJoin)
                    exactPaths = undefined;
                const jinf = this.getJoins(t1, t2, exactPaths, true);
                expectOne = Boolean(expectOne && jinf.expectOne);
                joinPaths = joinPaths.concat(jinf.paths);
            });
            let r = makeJoin({ paths: joinPaths, expectOne }, 0);
            return r;
            function makeJoin(joinInfo, ji) {
                const { paths } = joinInfo;
                const jp = paths[ji];
                // let prevTable = ji? paths[ji - 1].table : jp.source;
                let table = paths[ji].table;
                let tableAlias = (0, prostgles_types_1.asName)(ji < paths.length - 1 ? `jd${ji}` : table);
                let prevTableAlias = (0, prostgles_types_1.asName)(ji ? `jd${ji - 1}` : thisTable);
                let cond = `${jp.on.map(c => {
                    return c.map(([c1, c2]) => `${prevTableAlias}.${(0, prostgles_types_1.asName)(c1)} = ${tableAlias}.${(0, prostgles_types_1.asName)(c2)}`).join(" AND ");
                }).join("\n OR ")}`;
                let j = `SELECT 1 \n` +
                    `FROM ${(0, prostgles_types_1.asName)(table)} ${tableAlias} \n` +
                    `WHERE ${cond} \n`; //
                if (ji === paths.length - 1 &&
                    finalFilter) {
                    j += `AND ${finalFilter} \n`;
                }
                const indent = (a, b) => a;
                if (ji < paths.length - 1) {
                    j += `AND ${makeJoin(joinInfo, ji + 1)} \n`;
                }
                j = indent(j, ji + 1);
                let res = `${isNotExists ? " NOT " : " "} EXISTS ( \n` +
                    j +
                    `) \n`;
                return indent(res, ji);
            }
        };
        let finalWhere = "";
        let t2Rules = undefined, forcedFilter, filterFields, tableAlias;
        /* Check if allowed to view data - forcedFilters will bypass this check through isForcedFilterBypass */
        if (localParams?.isRemoteRequest && (!localParams?.socket && !localParams?.httpReq))
            throw "Unexpected: localParams isRemoteRequest and missing socket/httpReq: ";
        if (localParams && (localParams.socket || localParams.httpReq) && this.dboBuilder.publishParser) {
            t2Rules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: t2, command: "find", localParams });
            if (!t2Rules || !t2Rules.select)
                throw "Dissallowed";
            ({ forcedFilter, filterFields } = t2Rules.select);
        }
        try {
            finalWhere = (await this.dboBuilder.dbo[t2].prepareWhere({
                filter: f2,
                forcedFilter,
                filterFields,
                addKeywords: false,
                tableAlias,
                localParams,
                tableRule: t2Rules
            })).where;
        }
        catch (err) {
            // console.trace(err)
            throw err;
        }
        if (!isJoined) {
            res = `${isNotExists ? " NOT " : " "} EXISTS (SELECT 1 \nFROM ${(0, prostgles_types_1.asName)(t2)} \n${finalWhere ? `WHERE ${finalWhere}` : ""}) `;
        }
        else {
            res = makeTableChain(finalWhere);
        }
        return res;
    }
    /**
     * parses a single filter
     * @example
     *  { fff: 2 } => "fff" = 2
     *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
     */
    async getCondition(params) {
        const { filter, select, allowed_colnames, tableAlias, localParams, tableRules } = params;
        let data = { ...filter };
        /* Exists join filter */
        const ERR = "Invalid exists filter. \nExpecting somethibng like: { $exists: { tableName.tableName2: Filter } } | { $exists: { \"**.tableName3\": Filter } }\n";
        const SP_WILDCARD = "**";
        let existsKeys = Object.keys(data)
            .filter(k => DboBuilder_1.EXISTS_KEYS.includes(k) && Object.keys(data[k] || {}).length)
            .map(key => {
            const isJoined = DboBuilder_1.EXISTS_KEYS.slice(-2).includes(key);
            let firstKey = Object.keys(data[key])[0], tables = firstKey.split("."), f2 = data[key][firstKey], shortestJoin = false;
            if (!isJoined) {
                if (tables.length !== 1)
                    throw "Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }";
            }
            else {
                /* First part can be the ** param meaning shortest join. Will be overriden by anything in tableConfig */
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
        let funcConds = [];
        const funcFilterkeys = FILTER_FUNCS.filter(f => {
            return f.name in data;
        });
        funcFilterkeys.map(f => {
            const funcArgs = data[f.name];
            if (!Array.isArray(funcArgs))
                throw `A function filter must contain an array. E.g: { $funcFilterName: ["col1"] } \n but got: ${JSON.stringify((0, prostgles_types_1.pickKeys)(data, [f.name]))} `;
            const fields = this.parseFieldFilter(f.getFields(funcArgs), true, allowed_colnames);
            const dissallowedCols = fields.filter(fname => !allowed_colnames.includes(fname));
            if (dissallowedCols.length) {
                throw `Invalid/disallowed columns found in function filter: ${dissallowedCols}`;
            }
            funcConds.push(f.getQuery({ args: funcArgs, allColumns: this.columns, allowedFields: allowed_colnames, tableAlias }));
        });
        let existsCond = "";
        if (existsKeys.length) {
            existsCond = (await Promise.all(existsKeys.map(async (k) => await this.prepareExistCondition(k, localParams)))).join(" AND ");
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
                    allColumns: this.columns,
                    /* CTID not available in AFTER trigger */
                    // ctidField: this.is_view? undefined : "ctid"
                    ctidField: undefined,
                }) + ` = ${DboBuilder_1.pgp.as.format("$1", [data[key]])}`);
                delete data[key];
            }
        });
        let allowedSelect = [];
        /* Select aliases take precedence over col names. This is to ensure filters work correctly and even on computed cols*/
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
        /* Add remaining allowed fields */
        allowedSelect = allowedSelect.concat(p.allColumns.filter(c => allowed_colnames.includes(c.name) &&
            !allowedSelect.find(s => s.alias === c.name)).map(f => ({
            type: f.type,
            alias: f.name,
            getQuery: (tableAlias) => f.getQuery({
                tableAlias,
                allColumns: this.columns,
                allowedFields: allowed_colnames
            }),
            selected: false,
            getFields: () => [f.name],
            column_udt_type: f.type === "column" ? this.columns.find(c => c.name === f.name)?.udt_name : undefined
        })));
        /* Parse complex filters
            { $filter: [{ $func: [...] }, "=", value | { $func: [..] }] }
        */
        const complexFilters = [];
        const complexFilterKey = "$filter";
        const allowedComparators = [">", "<", "=", "<=", ">=", "<>", "!="];
        if (complexFilterKey in data) {
            const getFuncQuery = (funcData) => {
                const { funcName, args } = (0, QueryBuilder_1.parseFunctionObject)(funcData);
                const funcDef = (0, Functions_1.parseFunction)({ func: funcName, args, functions: Functions_1.FUNCTIONS, allowedFields: allowed_colnames });
                return funcDef.getQuery({ args, tableAlias, allColumns: this.columns, allowedFields: allowed_colnames });
            };
            const complexFilter = data[complexFilterKey];
            if (!Array.isArray(complexFilter))
                throw `Invalid $filter. Must contain an array of at least element but got: ${JSON.stringify(complexFilter)} `;
            const leftFilter = complexFilter[0];
            const comparator = complexFilter[1];
            const rightFilterOrValue = complexFilter[2];
            const leftVal = getFuncQuery(leftFilter);
            let result = leftVal;
            if (comparator) {
                if (!allowedComparators.includes(comparator))
                    throw `Invalid $filter. comparator ${JSON.stringify(comparator)} is not valid. Expecting one of: ${allowedComparators}`;
                if (!rightFilterOrValue)
                    throw "Invalid $filter. Expecting a value or function after the comparator";
                const rightVal = (0, prostgles_types_1.isObject)(rightFilterOrValue) ? getFuncQuery(rightFilterOrValue) : (0, PubSubManager_1.asValue)(rightFilterOrValue);
                if (leftVal === rightVal)
                    throw "Invalid $filter. Cannot compare two identical function signatures: " + JSON.stringify(leftFilter);
                result += ` ${comparator} ${rightVal}`;
            }
            complexFilters.push(result);
        }
        /* Parse join filters
            { $joinFilter: { $ST_DWithin: [table.col, foreignTable.col, distance] }
            will make an exists filter
        */
        let filterKeys = Object.keys(data).filter(k => k !== complexFilterKey && !funcFilterkeys.find(ek => ek.name === k) && !computedFields.find(cf => cf.name === k) && !existsKeys.find(ek => ek.key === k));
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
        const f = (0, prostgles_types_1.pickKeys)(data, filterKeys);
        const q = (0, Filtering_1.parseFilterItem)({
            filter: f,
            tableAlias,
            pgp: DboBuilder_1.pgp,
            select: allowedSelect
        });
        let templates = [q].filter(q => q);
        if (existsCond)
            templates.push(existsCond);
        templates = templates.concat(funcConds);
        templates = templates.concat(computedColConditions);
        templates = templates.concat(complexFilters);
        /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
        return templates.sort()
            .join(" AND \n");
    }
    /* This relates only to SELECT */
    prepareSortItems(orderBy, allowed_cols, tableAlias, select) {
        const throwErr = () => {
            throw "\nInvalid orderBy option -> " + JSON.stringify(orderBy) +
                "Expecting: \
                      { key2: false, key1: true } \
                      { key1: 1, key2: -1 } \
                      [{ key1: true }, { key2: false }] \
                      [{ key: 'colName', asc: true, nulls: 'first', nullEmpty: true }]";
        }, parseOrderObj = (orderBy, expectOne = false) => {
            if (!(0, DboBuilder_1.isPlainObject)(orderBy))
                return throwErr();
            const keys = Object.keys(orderBy);
            if (keys.length && keys.find(k => ["key", "asc", "nulls", "nullEmpty"].includes(k))) {
                const { key, asc, nulls, nullEmpty = false } = orderBy;
                if (!["string"].includes(typeof key) ||
                    !["boolean"].includes(typeof asc) ||
                    !["first", "last", undefined, null].includes(nulls) ||
                    !["boolean"].includes(typeof nullEmpty)) {
                    throw `Invalid orderBy option (${JSON.stringify(orderBy, null, 2)}) \n 
                          Expecting { key: string, asc?: boolean, nulls?: 'first' | 'last' | null | undefined, nullEmpty?: boolean } `;
                }
                return [{ key, asc, nulls, nullEmpty }];
            }
            if (expectOne && keys.length > 1) {
                throw "\nInvalid orderBy " + JSON.stringify(orderBy) +
                    "\nEach orderBy array element cannot have more than one key";
            }
            /* { key2: true, key1: false } */
            if (!Object.values(orderBy).find(v => ![true, false].includes(v))) {
                return keys.map(key => ({ key, asc: Boolean(orderBy[key]) }));
                /* { key2: -1, key1: 1 } */
            }
            else if (!Object.values(orderBy).find(v => ![-1, 1].includes(v))) {
                return keys.map(key => ({ key, asc: orderBy[key] === 1 }));
                /* { key2: "asc", key1: "desc" } */
            }
            else if (!Object.values(orderBy).find(v => !["asc", "desc"].includes(v))) {
                return keys.map(key => ({ key, asc: orderBy[key] === "asc" }));
            }
            else
                return throwErr();
        };
        if (!orderBy)
            return [];
        let _ob = [];
        if ((0, DboBuilder_1.isPlainObject)(orderBy)) {
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
            else if (_orderBy.find(v => (0, DboBuilder_1.isPlainObject)(v) && Object.keys(v).length)) {
                _ob = _orderBy.map(v => parseOrderObj(v, true)[0]);
            }
            else
                return throwErr();
        }
        else
            return throwErr();
        if (!_ob || !_ob.length)
            return [];
        const validatedAggAliases = select.filter(s => s.type !== "joinedColumn" &&
            (!s.fields.length || s.fields.every(f => allowed_cols.includes(f)))).map(s => s.alias);
        let bad_param = _ob.find(({ key }) => !(validatedAggAliases || []).includes(key) &&
            !allowed_cols.includes(key));
        if (!bad_param) {
            const selectedAliases = select.filter(s => s.selected).map(s => s.alias);
            // return (excludeOrder? "" : " ORDER BY ") + (_ob.map(({ key, asc, nulls, nullEmpty = false }) => {
            return _ob.map(({ key, asc, nulls, nullEmpty = false }) => {
                /* Order by column index when possible to bypass name collision when ordering by a computed column.
                    (Postgres will sort by existing columns wheundefined possible)
                */
                const orderType = asc ? " ASC " : " DESC ";
                const index = selectedAliases.indexOf(key) + 1;
                const nullOrder = nulls ? ` NULLS ${nulls === "first" ? " FIRST " : " LAST "}` : "";
                let colKey = (index > 0 && !nullEmpty) ? index : [tableAlias, key].filter(prostgles_types_1.isDefined).map(prostgles_types_1.asName).join(".");
                if (nullEmpty) {
                    colKey = `nullif(trim(${colKey}::text), '')`;
                }
                const res = `${colKey} ${orderType} ${nullOrder}`;
                if (typeof colKey === "number") {
                    return {
                        asc,
                        fieldPosition: colKey
                    };
                }
                return {
                    fieldQuery: colKey,
                    asc,
                };
            });
        }
        else {
            throw "Invalid/disallowed orderBy fields or params: " + bad_param.key;
        }
    }
    /* This relates only to SELECT */
    prepareLimitQuery(limit = 1000, p) {
        if (limit !== undefined && limit !== null && !Number.isInteger(limit)) {
            throw "Unexpected LIMIT. Must be null or an integer";
        }
        let _limit = limit;
        // if(_limit === undefined && p.select.maxLimit === null){
        //     _limit = 1000;
        /* If no limit then set as the lesser of (100, maxLimit) */
        // } else 
        if (_limit !== null && !Number.isInteger(_limit) && p.select.maxLimit !== null) {
            _limit = [100, p.select.maxLimit].filter(Number.isInteger).sort((a, b) => a - b)[0];
        }
        else {
            /* If a limit higher than maxLimit specified throw error */
            if (Number.isInteger(p.select.maxLimit) && _limit > p.select.maxLimit) {
                throw `Unexpected LIMIT ${_limit}. Must be less than the published maxLimit: ` + p.select.maxLimit;
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
    parseFieldFilter(fieldParams = "*", allow_empty = true, allowed_cols) {
        return ViewHandler._parseFieldFilter(fieldParams, allow_empty, allowed_cols || this.column_names.slice(0));
    }
    /**
    * Filter string array
    * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
    * @param {boolean} allow_empty - allow empty select. defaults to true
    */
    static _parseFieldFilter(fieldParams = "*", allow_empty = true, all_cols) {
        if (!all_cols)
            throw "all_cols missing";
        const all_fields = all_cols; // || this.column_names.slice(0);
        let colNames = [], initialParams = JSON.stringify(fieldParams);
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
            else if ((0, DboBuilder_1.isPlainObject)(fieldParams)) {
                if (!(0, prostgles_types_1.getKeys)(fieldParams).length) {
                    return []; //all_fields.slice(0) as typeof all_fields;
                }
                let keys = (0, prostgles_types_1.getKeys)(fieldParams);
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
/**
* Throw error if illegal keys found in object
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCondition = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const Functions_1 = require("./QueryBuilder/Functions");
const QueryBuilder_1 = require("./QueryBuilder/QueryBuilder");
const Filtering_1 = require("../Filtering");
const FILTER_FUNCS = Functions_1.FUNCTIONS.filter(f => f.canBeUsedForFilter);
/**
 * parses a single filter
 * @example
 *  { fff: 2 } => "fff" = 2
 *  { fff: { $ilike: 'abc' } } => "fff" ilike 'abc'
 */
async function getCondition(params) {
    const { filter: rawFilter, select, allowed_colnames, tableAlias, localParams, tableRules } = params;
    const filter = { ...rawFilter };
    /* Exists join filter */
    const ERR = "Invalid exists filter. \nExpecting somethibng like: \n | { $exists: { tableName.tableName2: Filter } } \n  | { $exists: { \"**.tableName3\": Filter } }\n | { path: string[]; filter: AnyObject }";
    const SP_WILDCARD = "**";
    const exists = (0, prostgles_types_1.getKeys)(filter)
        .filter(k => prostgles_types_1.EXISTS_KEYS.includes(k) && Object.keys(filter[k] ?? {}).length)
        .map(key => {
        const isJoined = key.toLowerCase().includes("join");
        const filterValue = filter[key];
        /**
         * type ExistsJoined =
         *   | { "table1.table2": { column: filterValue }  }
         *   | { path: string[]; filter: AnyObject }
         */
        const dataKeys = Object.keys(filterValue);
        const isDetailed = dataKeys.length === 2 && dataKeys.every(key => ["path", "filter"].includes(key));
        const firstKey = dataKeys[0];
        /**
         * Prevent some errors with table names that contain "."
         */
        const firstKeyIsATable = !!this.dboBuilder.dbo[firstKey];
        let tables = isDetailed ? filterValue.path : (firstKeyIsATable ? [firstKey] : firstKey.split("."));
        const f2 = isDetailed ? filterValue.filter : filterValue[firstKey];
        let shortestJoin = false;
        if (!isJoined) {
            if (tables.length !== 1)
                throw "Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }";
        }
        else {
            /* First part can be the ** param meaning shortest join. Will be overriden by anything in tableConfig */
            if (!tables.length) {
                throw ERR + "\nBut got: " + filterValue;
            }
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
    const funcConds = [];
    const funcFilter = FILTER_FUNCS.filter(f => f.name in filter);
    funcFilter.map(f => {
        const funcArgs = filter[f.name];
        if (!Array.isArray(funcArgs)) {
            throw `A function filter must contain an array. E.g: { $funcFilterName: ["col1"] } \n but got: ${JSON.stringify((0, prostgles_types_1.pickKeys)(filter, [f.name]))} `;
        }
        const fields = this.parseFieldFilter(f.getFields(funcArgs), true, allowed_colnames);
        const dissallowedCols = fields.filter(fname => !allowed_colnames.includes(fname));
        if (dissallowedCols.length) {
            throw `Invalid/disallowed columns found in function filter: ${dissallowedCols}`;
        }
        funcConds.push(f.getQuery({ args: funcArgs, allColumns: this.columns, allowedFields: allowed_colnames, tableAlias }));
    });
    let existsCond = "";
    if (exists.length) {
        existsCond = (await Promise.all(exists.map(async (k) => await this.prepareExistCondition(k, localParams)))).join(" AND ");
    }
    /* Computed field queries */
    const p = this.getValidatedRules(tableRules, localParams);
    const computedFields = p.allColumns.filter(c => c.type === "computed");
    const computedColConditions = [];
    Object.keys(filter || {}).map(key => {
        const compCol = computedFields.find(cf => cf.name === key);
        if (compCol) {
            computedColConditions.push(compCol.getQuery({
                tableAlias,
                allowedFields: p.select.fields,
                allColumns: this.columns,
                /* CTID not available in AFTER trigger */
                // ctidField: this.is_view? undefined : "ctid"
                ctidField: undefined,
            }) + ` = ${DboBuilder_1.pgp.as.format("$1", [filter[key]])}`);
            delete filter[key];
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
      {
        $filter: [
          { $func: [...] },
          "=",
          value | { $func: [..] }
        ]
      }
    */
    const complexFilters = [];
    const complexFilterKey = "$filter";
    const allowedComparators = [">", "<", "=", "<=", ">=", "<>", "!="];
    if (complexFilterKey in filter) {
        /**
         * { $funcName: [arg1, arg2] }
         * { $column: "column_name" }
         */
        const getFuncQuery = (funcData) => {
            if ((0, prostgles_types_1.isObject)(funcData) && "$column" in funcData) {
                const column = funcData["$column"];
                if (typeof column !== "string") {
                    throw `expecting: \n  { $column: "column_name" } received:\n ${JSON.stringify(funcData)}`;
                }
                if (!allowed_colnames.includes(column)) {
                    throw `Dissallowed or Invalid column ${column}. Allowed columns: ${allowed_colnames}`;
                }
                return (0, QueryBuilder_1.asNameAlias)(column, tableAlias);
            }
            const { funcName, args } = (0, QueryBuilder_1.parseFunctionObject)(funcData);
            const funcDef = (0, Functions_1.parseFunction)({ func: funcName, args, functions: Functions_1.FUNCTIONS, allowedFields: allowed_colnames });
            return funcDef.getQuery({ args, tableAlias, allColumns: this.columns, allowedFields: allowed_colnames });
        };
        const complexFilter = filter[complexFilterKey];
        if (!Array.isArray(complexFilter)) {
            throw `Invalid $filter. Must contain an array of at least element but got: ${JSON.stringify(complexFilter)} `;
        }
        const [leftFilter, comparator, rightFilterOrValue] = complexFilter;
        const leftVal = getFuncQuery(leftFilter);
        let result = leftVal;
        if (comparator) {
            if (!allowedComparators.includes(comparator)) {
                throw `Invalid $filter. comparator ${JSON.stringify(comparator)} is not valid. Expecting one of: ${allowedComparators}`;
            }
            if (!rightFilterOrValue) {
                throw "Invalid $filter. Expecting a value or function after the comparator";
            }
            const rightVal = (0, prostgles_types_1.isObject)(rightFilterOrValue) ? getFuncQuery(rightFilterOrValue) : (0, PubSubManager_1.asValue)(rightFilterOrValue);
            if (leftVal === rightVal) {
                throw "Invalid $filter. Cannot compare two identical function signatures: " + JSON.stringify(leftFilter);
            }
            result += ` ${comparator} ${rightVal}`;
        }
        complexFilters.push(result);
    }
    /* Parse join filters
        { $joinFilter: { $ST_DWithin: [table.col, foreignTable.col, distance] }
        will make an exists filter
    */
    const filterKeys = Object.keys(filter).filter(k => k !== complexFilterKey && !funcFilter.find(ek => ek.name === k) && !computedFields.find(cf => cf.name === k) && !exists.find(ek => ek.key === k));
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
    const f = (0, prostgles_types_1.pickKeys)(filter, filterKeys);
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
    return {
        exists,
        condition: templates.sort().join(" AND \n")
    };
}
exports.getCondition = getCondition;

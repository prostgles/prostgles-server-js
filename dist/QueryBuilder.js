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
exports.pParseFilter = exports.EXISTS_KEYS = exports.FilterBuilder = exports.makeQuery = exports.getNewQuery = exports.SelectItemBuilder = exports.COMPUTED_FIELDS = exports.FUNCTIONS = exports.asNameAlias = void 0;
const DboBuilder_1 = require("./DboBuilder");
const Prostgles_1 = require("./Prostgles");
const prostgles_types_1 = require("prostgles-types");
const utils_1 = require("./utils");
exports.asNameAlias = (field, tableAlias) => {
    let result = prostgles_types_1.asName(field);
    if (tableAlias)
        return prostgles_types_1.asName(tableAlias) + "." + result;
    return result;
};
/**
* Each function expects a column at the very least
*/
exports.FUNCTIONS = [
    // Hashing
    {
        name: "$md5_multi",
        type: "function",
        singleColArg: false,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("md5(" + args.map(fname => "COALESCE( " + exports.asNameAlias(fname, tableAlias) + "::text, '' )").join(" || ") + ")");
            return q;
        }
    },
    {
        name: "$md5_multi_agg",
        type: "aggregation",
        singleColArg: false,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("md5(string_agg(" + args.map(fname => "COALESCE( " + exports.asNameAlias(fname, tableAlias) + "::text, '' )").join(" || ") + ", ','))");
            return q;
        }
    },
    {
        name: "$sha256_multi",
        type: "function",
        singleColArg: false,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha256((" + args.map(fname => "COALESCE( " + exports.asNameAlias(fname, tableAlias) + ", '' )").join(" || ") + ")::text::bytea), 'hex')");
            return q;
        }
    },
    {
        name: "$sha256_multi_agg",
        type: "aggregation",
        singleColArg: false,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha256(string_agg(" + args.map(fname => "COALESCE( " + exports.asNameAlias(fname, tableAlias) + ", '' )").join(" || ") + ", ',')::text::bytea), 'hex')");
            return q;
        }
    },
    {
        name: "$sha512_multi",
        type: "function",
        singleColArg: false,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha512((" + args.map(fname => "COALESCE( " + exports.asNameAlias(fname, tableAlias) + ", '' )").join(" || ") + ")::text::bytea), 'hex')");
            return q;
        }
    },
    {
        name: "$sha512_multi_agg",
        type: "aggregation",
        singleColArg: false,
        getFields: (args) => args,
        getQuery: ({ allowedFields, args, tableAlias }) => {
            const q = DboBuilder_1.pgp.as.format("encode(sha512(string_agg(" + args.map(fname => "COALESCE( " + exports.asNameAlias(fname, tableAlias) + ", '' )").join(" || ") + ", ',')::text::bytea), 'hex')");
            return q;
        }
    },
    /* Full text search */
    {
        name: "$ts_headline",
        type: "function",
        singleColArg: false,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            let qVal = args[1], qType = "to_tsquery";
            const searchTypes = ["websearch_to_tsquery", "to_tsquery"];
            if (DboBuilder_1.isPlainObject(args[1])) {
                const keys = Object.keys(args[1]);
                qType = keys[0];
                if (keys.length !== 1 || !searchTypes.includes(qType))
                    throw "Expecting a an object with a single key named one of: " + searchTypes.join(", ");
                qVal = args[1][qType];
            }
            else {
                qVal = DboBuilder_1.pgp.as.format(qType + "($1)", [qVal]);
            }
            const res = DboBuilder_1.pgp.as.format("ts_headline(" + prostgles_types_1.asName(args[0]) + "::text, $1:raw)", [qVal]);
            return res;
        }
    },
    {
        name: "$ST_AsGeoJSON",
        type: "function",
        singleColArg: false,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("ST_AsGeoJSON(" + prostgles_types_1.asName(args[0]) + ")::json");
        }
    },
    {
        name: "$left",
        type: "function",
        singleColArg: false,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("LEFT(" + prostgles_types_1.asName(args[0]) + ", $1)", [args[1]]);
        }
    },
    {
        name: "$to_char",
        type: "function",
        singleColArg: false,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            if (args.length === 3) {
                return DboBuilder_1.pgp.as.format("to_char(" + prostgles_types_1.asName(args[0]) + ", $2, $3)", [args[0], args[1], args[2]]);
            }
            return DboBuilder_1.pgp.as.format("to_char(" + prostgles_types_1.asName(args[0]) + ", $2)", [args[0], args[1]]);
        }
    },
    /* Date funcs date_part */
    ...["date_trunc", "date_part"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        singleColArg: false,
        getFields: (args) => [args[1]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format(funcName + "($1, " + prostgles_types_1.asName(args[1]) + ")", [args[0], args[1]]);
        }
    })),
    /* Handy date funcs */
    ...[
        ["date", "YYYY-MM-DD"],
        ["datetime", "YYYY-MM-DD HH24:MI"],
        ["timedate", "HH24:MI YYYY-MM-DD"],
        ["time", "HH24:MI"],
        ["time12", "HH:MI"],
        ["timeAM", "HH:MI AM"],
        ["dy", "dy"],
        ["Dy", "Dy"],
        ["day", "day"],
        ["Day", "Day"],
        ["DayNo", "DD"],
        ["DD", "DD"],
        ["dowUS", "D"],
        ["D", "D"],
        ["dow", "ID"],
        ["ID", "ID"],
        ["MonthNo", "MM"],
        ["MM", "MM"],
        ["mon", "mon"],
        ["Mon", "Mon"],
        ["month", "month"],
        ["Month", "Month"],
        ["year", "yyyy"],
        ["yyyy", "yyyy"],
        ["yy", "yy"],
        ["yr", "yy"],
    ].map(([funcName, txt]) => ({
        name: "$" + funcName,
        type: "function",
        singleColArg: true,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return DboBuilder_1.pgp.as.format("trim(to_char(" + prostgles_types_1.asName(args[0]) + ", $2))", [args[0], txt]);
        }
    })),
    /* Basic 1 arg col funcs */
    ...["upper", "lower", "length", "reverse", "trim", "initcap", "round", "ceil", "floor", "sign", "age"].map(funcName => ({
        name: "$" + funcName,
        type: "function",
        singleColArg: true,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return funcName + "(" + prostgles_types_1.asName(args[0]) + ")";
        }
    })),
    /* Aggs */
    ...["max", "min", "count", "avg", "json_agg", "string_agg", "array_agg", "sum"].map(aggName => ({
        name: "$" + aggName,
        type: "aggregation",
        singleColArg: true,
        getFields: (args) => [args[0]],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return aggName + "(" + prostgles_types_1.asName(args[0]) + ")";
        }
    })),
    /* More aggs */
    {
        name: "$countAll",
        type: "aggregation",
        singleColArg: false,
        getFields: (args) => [],
        getQuery: ({ allowedFields, args, tableAlias }) => {
            return "COUNT(*)";
        }
    },
];
/* The difference between a function and computed field is that the computed field does not require any arguments */
exports.COMPUTED_FIELDS = [
    {
        name: "$rowhash",
        type: "computed",
        getQuery: ({ allowedFields, tableAlias, ctidField }) => {
            return "md5(" +
                allowedFields
                    .concat(ctidField ? [ctidField] : [])
                    .sort()
                    .map(f => exports.asNameAlias(f, tableAlias))
                    .map(f => `md5(coalesce(${f}::text, 'dd'))`)
                    .join(" || ") +
                `)`;
        }
    }
];
class SelectItemBuilder {
    constructor(params) {
        this.select = [];
        this.checkField = (f) => {
            if (!this.allowedFieldsIncludingComputed.includes(f))
                throw "Field " + f + " is invalid or dissallowed";
            return f;
        };
        this.addItem = (item) => {
            item.getFields().map(this.checkField);
            if (this.select.find(s => s.alias === item.alias))
                throw `Cannot specify duplicate columns ( ${item.alias} ). Perhaps you're using "*" with column names?`;
            this.select.push(item);
        };
        this.addFunctionByName = (funcName, args, alias) => {
            const funcDef = this.functions.find(f => f.name === funcName);
            if (!funcDef)
                throw "Function " + funcName + " does not exist or is not allowed ";
            this.addFunction(funcDef, args, alias);
        };
        this.addFunction = (funcDef, args, alias) => {
            this.addItem({
                type: funcDef.type,
                alias,
                getFields: () => funcDef.getFields(args),
                getQuery: (tableAlias) => funcDef.getQuery({ allowedFields: this.allowedFields, args, tableAlias, ctidField: this.isView ? undefined : "ctid" }),
                selected: true
            });
        };
        this.addColumn = (fieldName, selected) => {
            /* Check if computed col */
            if (selected) {
                const compCol = exports.COMPUTED_FIELDS.find(cf => cf.name === fieldName);
                if (compCol && !this.select.find(s => s.alias === fieldName)) {
                    const cf = Object.assign(Object.assign({}, compCol), { type: "computed", singleColArg: false, getFields: (args) => [] });
                    this.addFunction(cf, [], compCol.name);
                    return;
                }
            }
            let alias = selected ? fieldName : ("not_selected_" + fieldName);
            this.addItem({
                type: "column",
                alias,
                getQuery: () => prostgles_types_1.asName(fieldName),
                getFields: () => [fieldName],
                selected
            });
        };
        this.parseUserSelect = (userSelect, joinParse) => __awaiter(this, void 0, void 0, function* () {
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
            else if (DboBuilder_1.isPlainObject(userSelect) && !prostgles_types_1.isEmpty(userSelect)) {
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
                    yield Promise.all(selectKeys.map((key) => __awaiter(this, void 0, void 0, function* () {
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
                        else if (typeof val === "string" || DboBuilder_1.isPlainObject(val)) {
                            /* Function
                                { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id
                            */
                            if ((typeof val === "string" && val !== "*") ||
                                DboBuilder_1.isPlainObject(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0]) // !isPlainObject(Object.values(val)[0])
                            ) {
                                // if(!Array.isArray(Object.values(val)[0])){
                                //   throw `Could not parse selected item: ${JSON.stringify(val)}\nFunction arguments must be in an array`;
                                // }
                                let funcName, args;
                                if (typeof val === "string") {
                                    /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
                                    try {
                                        this.checkField(key);
                                    }
                                    catch (err) {
                                        throwErr(`Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. Use correct column name or full function notation, e.g.: -> { key: { $func_name: ["column_name"] } } `);
                                    }
                                    funcName = val;
                                    args = [key];
                                }
                                else {
                                    const callKeys = Object.keys(val);
                                    if (callKeys.length !== 1 || !Array.isArray(val[callKeys[0]]))
                                        throw "\nIssue with select. \nUnexpected function definition. \nExpecting { field_name: func_name } OR { result_key: { func_name: [arg1, arg2 ...] } } \nBut got -> " + JSON.stringify({ [key]: val });
                                    funcName = callKeys[0];
                                    args = val[callKeys[0]];
                                }
                                this.addFunctionByName(funcName, args, key);
                                /* Join */
                            }
                            else {
                                if (!joinParse)
                                    throw "Joins dissalowed";
                                yield joinParse(key, val, throwErr);
                            }
                        }
                        else
                            throwErr();
                    })));
                }
            }
            else
                throw "Unexpected select -> " + JSON.stringify(userSelect);
        });
        this.allFields = params.allFields;
        this.allowedFields = params.allowedFields;
        this.computedFields = params.computedFields;
        this.isView = params.isView;
        this.functions = params.functions;
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
function getNewQuery(_this, filter, selectParams, param3_unused = null, tableRules, localParams) {
    return __awaiter(this, void 0, void 0, function* () {
        if (utils_1.get(localParams, "socket") && !utils_1.get(tableRules, "select.fields")) {
            throw `INTERNAL ERROR: publish.${_this.name}.select.fields rule missing`;
        }
        // const all_columns: SelectItem[] = _this.column_names.slice(0).map(fieldName => ({
        //   type: "column",
        //   alias: fieldName,
        //   getQuery: () => asName(fieldName),
        //   getFields: () => [fieldName],
        //   selected: false
        // } as SelectItem))
        // .concat(COMPUTED_FIELDS.map(c => ({
        //   type: c.type,
        //   alias: c.name,
        //   getQuery: () => c.getQuery(),
        //   getFields: c.getFields,
        //   selected: false
        // })))
        // let select: SelectItem[] = [],
        let joinQueries = [];
        // const all_colnames = _this.column_names.slice(0).concat(COMPUTED_FIELDS.map(c => c.name));
        selectParams = selectParams || {};
        const { select: userSelect = "*" } = selectParams, 
        // allCols = _this.column_names.slice(0),
        // allFieldsIncludingComputed = allCols.concat(COMPUTED_FIELDS.map(c => c.name)),
        allowedFields = _this.parseFieldFilter(utils_1.get(tableRules, "select.fields")) || _this.column_names.slice(0), 
        // allowedFieldsIncludingComputed = _this.parseFieldFilter(get(tableRules, "select.fields"), true, allFieldsIncludingComputed) || allFieldsIncludingComputed,
        sBuilder = new SelectItemBuilder({ allowedFields, computedFields: exports.COMPUTED_FIELDS, isView: _this.is_view, functions: exports.FUNCTIONS, allFields: _this.column_names.slice(0) });
        //   /* Array select */
        // if(Array.isArray(userSelect)){
        //   if(userSelect.find(key => typeof key !== "string")) throw "Invalid array select. Expecting an array of strings";
        //   userSelect.map(key => sBuilder.addColumn(key, true))
        // /* Empty select */
        // } else if(userSelect === ""){
        //   // select.push({
        //   //   type: "function",
        //   //   alias: "",
        //   //   getFields: () => [],
        //   //   getQuery: () => ""
        //   // })
        //   console.log("Finish empty select")
        // } else if(userSelect === "*"){
        //   allowedFields.map(key => sBuilder.addColumn(key, true) );
        // } else if(isPlainObject(userSelect) && !isEmpty(userSelect as object)){
        //   const selectKeys = Object.keys(userSelect),
        //     selectValues = Object.values(userSelect);
        //   /* Cannot include and exclude at the same time */
        //   if(
        //     selectValues.filter(v => [0, false].includes(v)).length 
        //   ){
        //     if(selectValues.filter(v => ![0, false].includes(v)).length ){
        //       throw "\nCannot include and exclude fields at the same time";
        //     }
        //     /* Exclude only */
        //     allowedFields.filter(f => !selectKeys.includes(f)).map(key => sBuilder.addColumn(key, true) )
        //   } else {
        //     await Promise.all(selectKeys.map(async key => {
        //       const val = userSelect[key],
        //         throwErr = (extraErr: string = "") => {
        //           console.trace(extraErr)
        //           throw "Unexpected select -> " + JSON.stringify({ [key]: val }) + "\n" + extraErr;
        //         };
        //       /* Included fields */
        //       if([1, true].includes(val)){
        //         if(key === "*"){
        //           allowedFields.map(key => sBuilder.addColumn(key, true) )
        //         } else {
        //           sBuilder.addColumn(key, true);
        //         }
        //       /* Aggs and functions */
        //       } else if(typeof val === "string" || isPlainObject(val)) {
        //         /* Function 
        //             { id: "$max" } === { id: { $max: ["id"] } } === SELECT MAX(id) AS id 
        //         */  
        //         if(
        //           (typeof val === "string" && val !== "*") ||
        //           isPlainObject(val) && Object.keys(val).length === 1 && Array.isArray(Object.values(val)[0])
        //         ){
        //           let funcName, args;
        //           if(typeof val === "string") {
        //             /* Shorthand notation -> it is expected that the key is the column name used as the only argument */
        //             try {
        //               sBuilder.checkField(key)
        //             } catch (err){
        //               throwErr(`Shorthand function notation error: the specifield column ( ${key} ) is invalid or dissallowed. Use correct column name or full function notation, e.g.: -> { key: { $func_name: ["column_name"] } } `)
        //             }
        //             funcName = val;
        //             args = [key];
        //           } else {
        //             const callKeys = Object.keys(val);
        //             if(callKeys.length !== 1 || !Array.isArray(val[callKeys[0]])) throw "\nIssue with select. \nUnexpected function definition. \nExpecting { field_name: func_name } OR { result_key: { func_name: [arg1, arg2 ...] } } \nBut got -> " + JSON.stringify({ [key]: val });
        //             funcName = callKeys[0];
        //             args = val[callKeys[0]];
        //           }
        //           sBuilder.addFunctionByName(funcName, args, key);
        //         /* Join */
        //         } else {
        //           // console.log({ key, val })
        //           let j_filter: Filter = {},
        //               j_selectParams: SelectParams = {},
        //               j_path: string[],
        //               j_alias: string,
        //               j_tableRules: TableRule,
        //               j_table: string,
        //               j_isLeftJoin: boolean = true;
        //           if(val === "*"){
        //             j_selectParams.select = "*";
        //             j_alias = key;
        //             j_table = key;
        //           } else {
        //             /* Full option join  { field_name: db.innerJoin.table_name(filter, select)  } */
        //             const JOIN_KEYS = ["$innerJoin", "$leftJoin"];
        //             const JOIN_PARAMS = ["select", "filter", "$path", "offset", "limit", "orderBy"];
        //             const joinKeys = Object.keys(val).filter(k => JOIN_KEYS.includes(k));
        //             if(joinKeys.length > 1) {
        //               throwErr("\nCannot specify more than one join type ( $innerJoin OR $leftJoin )");
        //             } else if(joinKeys.length === 1) {
        //               const invalidParams = Object.keys(val).filter(k => ![ ...JOIN_PARAMS, ...JOIN_KEYS ].includes(k));
        //               if(invalidParams.length) throw "Invalid join params: " + invalidParams.join(", ");
        //               j_isLeftJoin = joinKeys[0] === "$leftJoin";
        //               j_table = val[joinKeys[0]];
        //               j_alias = key;
        //               if(typeof j_table !== "string") throw "\nIssue with select. \nJoin type must be a string table name but got -> " + JSON.stringify({ [key]: val });
        //               j_selectParams.select = val.select || "*";
        //               j_filter = val.filter || {};
        //               j_selectParams.limit = val.limit;
        //               j_selectParams.offset = val.offset;
        //               j_selectParams.orderBy = val.orderBy;
        //               j_path = val.$path;
        //             } else {
        //               j_selectParams.select = val;
        //               j_alias = key;
        //               j_table = key;
        //             }
        //           }
        //           const _thisJoinedTable: any = _this.dboBuilder.dbo[j_table];
        //           if(!_thisJoinedTable) throw `Joined table ${j_table} is disallowed or inexistent`;
        //           let isLocal = true;
        //           if(localParams && localParams.socket){
        //             isLocal = false;
        //             j_tableRules = await _this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: j_table, command: "find", socket: localParams.socket });
        //           }
        //           if(isLocal || j_tableRules){
        //             const joinQuery: NewQuery = await getNewQuery(
        //                 _thisJoinedTable,
        //                 j_filter, 
        //                 { ...j_selectParams, alias: j_alias }, 
        //                 param3_unused, 
        //                 j_tableRules, 
        //                 localParams
        //               );
        //             joinQuery.isLeftJoin = j_isLeftJoin;
        //             joinQuery.tableAlias = j_alias;
        //             joinQuery.$path = j_path;
        //             joinQueries.push(joinQuery);
        //             // console.log(joinQuery)
        //           }
        //         }
        //       } else throwErr();
        //     }));
        //   }
        // } else throw "Unexpected select -> " + JSON.stringify(userSelect);
        yield sBuilder.parseUserSelect(userSelect, (key, val, throwErr) => __awaiter(this, void 0, void 0, function* () {
            // console.log({ key, val })
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
            const _thisJoinedTable = _this.dboBuilder.dbo[j_table];
            if (!_thisJoinedTable) {
                throw `Joined table ${JSON.stringify(j_table)} is disallowed or inexistent \nOr you've forgot to put the function arguments into an array`;
            }
            let isLocal = true;
            if (localParams && localParams.socket) {
                isLocal = false;
                j_tableRules = yield _this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: j_table, command: "find", socket: localParams.socket });
            }
            if (isLocal || j_tableRules) {
                const joinQuery = yield getNewQuery(_thisJoinedTable, j_filter, Object.assign(Object.assign({}, j_selectParams), { alias: j_alias }), param3_unused, j_tableRules, localParams);
                joinQuery.isLeftJoin = j_isLeftJoin;
                joinQuery.tableAlias = j_alias;
                joinQuery.$path = j_path;
                joinQueries.push(joinQuery);
                // console.log(joinQuery)
            }
        }));
        /* Add non selected columns */
        /* WHY???? */
        allowedFields.map(key => {
            if (!sBuilder.select.find(s => s.alias === key && s.type === "column")) {
                sBuilder.addColumn(key, false);
            }
        });
        let select = sBuilder.select;
        // const validatedAggAliases = select
        //   .filter(s => s.type !== "joinedColumn")
        //   .map(s => s.alias);
        const where = yield _this.prepareWhere({
            filter,
            select,
            forcedFilter: utils_1.get(tableRules, "select.forcedFilter"),
            filterFields: utils_1.get(tableRules, "select.filterFields"),
            tableAlias: selectParams.alias,
            localParams,
            tableRule: tableRules
        });
        let resQuery = {
            allFields: allowedFields,
            select,
            table: _this.name,
            joins: joinQueries,
            where,
            // having: cond.having,
            limit: _this.prepareLimitQuery(selectParams.limit, utils_1.get(tableRules, "select.maxLimit")),
            orderBy: [_this.prepareSort(selectParams.orderBy, allowedFields, selectParams.alias, null, select)],
            offset: _this.prepareOffsetQuery(selectParams.offset)
        };
        // console.log(resQuery);
        // console.log(buildJoinQuery(_this, resQuery));
        return resQuery;
    });
}
exports.getNewQuery = getNewQuery;
/* No validation/authorisation at this point */
function makeQuery(_this, q, depth = 0, joinFields = []) {
    const PREF = `prostgles`, joins = q.joins || [], 
    // aggs = q.aggs || [],
    makePref = (q) => !q.tableAlias ? q.table : `${q.tableAlias || ""}_${q.table}`, makePrefANON = (joinAlias, table) => prostgles_types_1.asName(!joinAlias ? table : `${joinAlias || ""}_${table}`), makePrefAN = (q) => prostgles_types_1.asName(makePref(q));
    const indentLine = (numInd, str, indentStr = "    ") => new Array(numInd).fill(indentStr).join("") + str;
    const indStr = (numInd, str) => str.split("\n").map(s => indentLine(numInd, s)).join("\n");
    const indjArr = (numInd, strArr, indentStr = "    ") => strArr.map(str => indentLine(numInd, str));
    const indJ = (numInd, strArr, separator = " \n ", indentStr = "    ") => indjArr(numInd, strArr, indentStr).join(separator);
    const selectArrComma = (strArr) => strArr.map((s, i, arr) => s + (i < arr.length - 1 ? " , " : " "));
    const prefJCAN = (q, str) => prostgles_types_1.asName(`${q.tableAlias || q.table}_${PREF}_${str}`);
    // const indent = (a, b) => a;
    const joinTables = (q1, q2) => {
        const paths = _this.getJoins(q1.table, q2.table, q2.$path);
        return Prostgles_1.flat(paths.map(({ table, on }, i) => {
            const getPrevColName = (col) => {
                return table === q1.table ? q1.select.find(s => s.getQuery() === prostgles_types_1.asName(col)).alias : col;
            };
            const getThisColName = (col) => {
                return table === q2.table ? q2.select.find(s => s.getQuery() === prostgles_types_1.asName(col)).alias : col;
            };
            const prevTable = i === 0 ? q1.table : (paths[i - 1].table);
            const thisAlias = makePrefANON(q2.tableAlias, table);
            const prevAlias = i === 0 ? makePrefAN(q1) : thisAlias;
            // If root then prev table is aliased from root query. Alias from join otherwise
            let iQ = [
                prostgles_types_1.asName(table) + ` ${thisAlias}`
            ];
            /* If target table then add filters, options, etc */
            if (i === paths.length - 1) {
                // const targetSelect = (
                //     q2.select.concat(
                //         (q2.joins || []).map(j => j.tableAlias || j.table)
                //     ).concat(
                //         /* Rename aggs to avoid collision with join cols */
                //         (q2.aggs || []).map(a => asName(`agg_${a.alias}`) + " AS " + asName(a.alias)) || [])
                //     ).filter(s => s).join(", ");
                const targetSelect = q2.select.filter(s => s.selected).map(s => {
                    /* Rename aggs to avoid collision with join cols */
                    if (s.type === "aggregation")
                        return prostgles_types_1.asName(`agg_${s.alias}`) + " AS " + prostgles_types_1.asName(s.alias);
                    return s.alias;
                }).join(", ");
                const _iiQ = makeQuery(_this, q2, depth + 1, on.map(([c1, c2]) => prostgles_types_1.asName(c2)));
                // const iiQ = flat(_iiQ.split("\n")); // prettify for debugging
                // console.log(_iiQ)
                const iiQ = [_iiQ];
                iQ = [
                    "(",
                    ...indjArr(depth + 1, [
                        `-- 4. [target table] `,
                        `SELECT *,`,
                        `row_number() over() as ${prefJCAN(q2, `rowid_sorted`)},`,
                        `row_to_json((select x from (SELECT ${targetSelect}) as x)) AS ${prefJCAN(q2, `json`)}`,
                        `FROM (`,
                        ...iiQ,
                        `) ${prostgles_types_1.asName(q2.table)}    `
                    ]),
                    `) ${thisAlias}`
                ];
            }
            let jres = [
                `${q2.isLeftJoin ? "LEFT" : "INNER"} JOIN `,
                ...iQ,
                `ON ${on.map(([c1, c2]) => `${prevAlias}.${prostgles_types_1.asName(getPrevColName(c1))} = ${thisAlias}.${prostgles_types_1.asName(getThisColName(c2))} `).join(" AND ")}`
            ];
            return jres;
        }));
    };
    /* Leaf query -> no joins -> return simple query */
    const aggs = q.select.filter(s => s.type === "aggregation");
    const nonAggs = q.select.filter(s => depth || s.selected).filter(s => s.type !== "aggregation");
    if (!joins.length) {
        /* Nested queries contain all fields to allow joining */
        let 
        // select = q.select.filter(s => joinFields.includes(s.alias) || s.selected).map(s => {
        //   if(s.type === "aggregation"){
        //     /* Rename aggs to avoid collision with join cols */
        //     return s.getQuery(!depth? undefined : `agg_${s.alias}`) + " AS " + asName(s.alias);
        //   }
        //   return s.getQuery() + " AS " + asName(s.alias);
        // }),
        groupBy = "";
        // console.log(select, q);
        /* If aggs exist need to set groupBy add joinFields into select */
        if (aggs.length) {
            // const missingFields = joinFields.filter(jf => !q.select.find(s => s.type === "column" && s.alias === jf));
            // if(depth && missingFields.length){
            //     // select = Array.from(new Set(missingFields.concat(select)));
            // }
            if (nonAggs.length) {
                let groupByFields = nonAggs.filter(sf => !depth || joinFields.includes(sf.getQuery()));
                if (groupByFields.length) {
                    groupBy = `GROUP BY ${groupByFields.map(sf => sf.type === "function" ? sf.getQuery() : prostgles_types_1.asName(sf.alias)).join(", ")}\n`;
                }
            }
        }
        // console.log(q.select, joinFields)
        let fres = indJ(depth, [
            `-- 0. or 5. [leaf query] `
            /* Group by selected fields + any join fields */
            ,
            `SELECT ` + q.select.filter(s => joinFields.includes(s.getQuery()) || s.selected).map(s => {
                // return s.getQuery() + ((s.type !== "column")? (" AS " + s.alias) : "")
                if (s.type === "aggregation") {
                    /* Rename aggs to avoid collision with join cols */
                    return s.getQuery() + " AS " + prostgles_types_1.asName((depth ? "agg_" : "") + s.alias);
                }
                return s.getQuery() + " AS " + prostgles_types_1.asName(s.alias);
            }).join(", "),
            `FROM ${prostgles_types_1.asName(q.table)} `,
            q.where,
            groupBy //!aggs.length? "" : `GROUP BY ${nonAggs.map(sf => asName(sf.alias)).join(", ")}`,
            ,
            q.having ? `HAVING ${q.having}` : "",
            q.orderBy.join(", "),
            !depth ? `LIMIT ${q.limit} ` : null,
            !depth ? `OFFSET ${q.offset || 0} ` : null
        ].filter(v => v && (v + "").trim().length));
        // console.log(fres);
        return fres;
    }
    else {
        // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
        if (q.select.find(s => s.type === "aggregation") &&
            joins.find(j => j.select.find(s => s.type === "aggregation")))
            throw "Cannot join two aggregates";
    }
    if (joins && joins.length && aggs.length)
        throw "Joins within Aggs dissallowed";
    // if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
    let rootGroupBy;
    if ((aggs.length || q.joins && q.joins.length) && nonAggs.length) {
        // console.log({ aggs, nonAggs, joins: q.joins })
        rootGroupBy = `GROUP BY ${(depth ? q.allFields : nonAggs.map(s => s.type === "function" ? s.getQuery() : prostgles_types_1.asName(s.alias))).concat(aggs && aggs.length ? [] : [`ctid`]).filter(s => s).join(", ")} `;
    }
    /* Joined query */
    const rootSelect = [
        " \n",
        `-- 0. [joined root]  `,
        "SELECT    ",
        ...selectArrComma(q.select.filter(s => depth || s.selected).map(s => s.getQuery() + " AS " + prostgles_types_1.asName(s.alias)).concat(joins.map((j, i) => {
            const jsq = `json_agg(${prefJCAN(j, `json`)}::jsonb ORDER BY ${prefJCAN(j, `rowid_sorted`)}) FILTER (WHERE ${prefJCAN(j, `limit`)} <= ${j.limit} AND ${prefJCAN(j, `dupes_rowid`)} = 1 AND ${prefJCAN(j, `json`)} IS NOT NULL)`;
            const resAlias = prostgles_types_1.asName(j.tableAlias || j.table);
            // If limit = 1 then return a single json object (first one)
            return (j.limit === 1 ? `${jsq}->0 ` : `COALESCE(${jsq}, '[]') `) + `  AS ${resAlias}`;
        }))),
        `FROM ( `,
        ...indjArr(depth + 1, [
            "-- 1. [subquery limit + dupes] ",
            "SELECT     ",
            ...selectArrComma([`t1.*`].concat(joins.map((j, i) => {
                return `row_number() over(partition by ${prefJCAN(j, `dupes_rowid`)}, ` +
                    `ctid order by ${prefJCAN(j, `rowid_sorted`)}) AS ${prefJCAN(j, `limit`)}  `;
            }))),
            `FROM ( ----------- ${makePrefAN(q)}`,
            ...indjArr(depth + 1, [
                "-- 2. [source full select + ctid to group by] ",
                "SELECT ",
                ...selectArrComma(q.allFields.concat(["ctid"])
                    .map(field => `${makePrefAN(q)}.${field}  `)
                    .concat(joins.map((j, i) => makePrefAN(j) + "." + prefJCAN(j, `json`) + ", " + makePrefAN(j) + "." + prefJCAN(j, `rowid_sorted`)).concat(joins.map(j => `row_number() over(partition by ${makePrefAN(j)}.${prefJCAN(j, `rowid_sorted`)}, ${makePrefAN(q)}.ctid ) AS ${prefJCAN(j, `dupes_rowid`)}`)))),
                `FROM ( `,
                ...indjArr(depth + 1, [
                    "-- 3. [source table] ",
                    "SELECT ",
                    "*, row_number() over() as ctid ",
                    `FROM ${prostgles_types_1.asName(q.table)} `,
                    `${q.where} `
                ]),
                `) ${makePrefAN(q)} `,
                ...Prostgles_1.flat(joins.map((j, i) => joinTables(q, j)))
            ]),
            ") t1"
        ]),
        ") t0",
        rootGroupBy,
        q.having ? `HAVING ${q.having} ` : "",
        q.orderBy,
        depth ? null : `LIMIT ${q.limit || 0} OFFSET ${q.offset || 0}`,
        "-- EOF 0. joined root",
        " \n"
    ].filter(v => v);
    let res = indJ(depth, rootSelect);
    // res = indent(res, depth);
    // console.log(res);
    return res;
}
exports.makeQuery = makeQuery;
class FilterBuilder {
    constructor() {
    }
}
exports.FilterBuilder = FilterBuilder;
exports.EXISTS_KEYS = ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];
// const f: FinalFilter<{ a: Date }> = {
//   // hehe: { "@>": ['', 2] }
//   a: { $eq: new Date() }
// }
// const cc: FilterForObject<{
//   hehe: string;
//   num: number;
// }> = {
//   // hehe: { $ilike: 'daw' }
//   num: { $gt: 2 }
// };
exports.pParseFilter = (_f, select, pgp) => {
    if (!_f || prostgles_types_1.isEmpty(_f))
        return "";
    const mErr = (msg) => {
        throw `${msg}: ${JSON.stringify(_f, null, 2)}`;
    }, asValue = (v) => pgp.as.format("$1", [v]);
    const fKeys = Object.keys(_f);
    if (fKeys.length !== 1) {
        mErr(`Bad filter. Expecting a single property but got`);
    }
    const fKey = fKeys[0];
    /* Exists filter */
    if (exports.EXISTS_KEYS.find(k => k in _f)) {
        // parseExistsFilter()
    }
    let selItem = select.find(s => fKey === s.alias);
    let rightF = _f[fKey];
    let leftKey = fKey;
    /* Check if string notation. Build obj if necessary */
    if (!selItem) {
        selItem = select.find(s => fKey.startsWith(s.alias) // "field_name->objName->>keyAsValue"
        );
        if (!selItem)
            mErr("Bad filter. Could not match to a column or alias: ");
        const remainingStr = fKey.slice(selItem.alias.length);
        /* Is json path spec */
        if (remainingStr.startsWith("->")) {
            leftKey = prostgles_types_1.asName(selItem.alias);
            /**
             * get json path separators. Expecting -> to come first
             */
            const getSep = (fromIdx = 0) => {
                let idx = remainingStr.slice(fromIdx).indexOf("->");
                if (idx > -1) {
                    /* if -> matches then check if it's the last separator */
                    if (remainingStr.slice(idx).startsWith("->>"))
                        return { idx, sep: "->>" };
                    return { idx, sep: "->" };
                }
                idx = remainingStr.slice(fromIdx).indexOf("->>");
                if (idx > -1) {
                    return { idx, sep: "->>" };
                }
            };
            let currSep = getSep();
            while (currSep) {
                let nextSep = getSep(currSep.idx + currSep.sep.length);
                let nextIdx = nextSep ? nextSep.idx : remainingStr.length;
                leftKey += currSep.sep + asValue(remainingStr.slice(currSep.idx + currSep.sep.length, nextIdx));
                currSep = nextSep;
            }
            /* Is collapsed filter spec */
        }
        else if (remainingStr.startsWith(".")) {
            let getSep = (fromIdx = 0) => {
                return remainingStr.slice(fromIdx).indexOf(".");
            };
            let currIdx = getSep();
            let res = {};
            let curObj = res;
            while (currIdx > -1) {
                const nextIdx = getSep(currIdx + 1);
                const nIdx = nextIdx > -1 ? nextIdx : remainingStr.length;
                const key = remainingStr.slice(currIdx + 1, nIdx);
                curObj[key] = {};
                curObj = curObj[key];
            }
            curObj = _f[fKey];
            rightF = curObj;
        }
        else {
            mErr("Bad filter. Could not find the valid col name or alias or col json path");
        }
    }
    console.log({ leftKey, rightF });
};
// ensure pgp is not NULL!!!
// const asValue = v => v;// pgp.as.value;
// const filters: FilterSpec[] = [
//   ...(["ilike", "like"].map(op => ({ 
//     operands: ["$" + op],
//     tsDataTypes: ["any"] as TSDataType[],
//     tsDefinition: ` { $${op}: string } `,
//     // data_types: 
//     getQuery: (leftQuery: string, rightVal: any) => {
//       return `${leftQuery}::text ${op.toUpperCase()} ${asValue(rightVal)}::text` 
//     }
//   }))),
//   { 
//     operands: ["", "="],
//     tsDataTypes: ["any"],
//     tsDefinition: ` { "=": any } | any `,
//     // data_types: 
//     getQuery: (leftQuery: string, rightVal: any) => {
//       if(rightVal === null) return`${leftQuery} IS NULL `;
//       return `${leftQuery} = ${asValue(rightVal)}`;
//     }
//   }
// ];
//# sourceMappingURL=QueryBuilder.js.map
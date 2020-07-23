
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Bluebird from "bluebird";
declare global { export interface Promise<T> extends Bluebird<T> {} }

import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');

import { get } from "./utils";
import { DB, TableRule, OrderBy, SelectRule, InsertRule, UpdateRule, DeleteRule, SyncRule, SelectParams, InsertParams, UpdateParams, DeleteParams } from "./Prostgles";
import { PubSubManager } from "./PubSubManager";
import { promises } from "fs";
/**
 * @example
 * { field_name: (true | false) }
 * 
 * ["field_name1", "field_name2"]
 * 
 * field_name: false -> means all fields except this
 */
export type FieldFilter = object | string[] | "*" | "" ;

// type DBO = {
//     { [key: strign]: }
// }

type Subscription = {
    unsubscribe(...params:any): void;
}
type Sync = {
    unsync(...params:any): void;
}


export type TableInfo = {
    schema: string;
    name: string;
    columns: ColumnInfo[];
}

type ViewInfo = TableInfo & {
    parent_tables: string[]
}

export type TableOrViewInfo = TableInfo & ViewInfo & {
    is_view: boolean;
}

type ColumnInfo = {
    name: string;

    /* Simplified data type */
    data_type: string;

    /* values starting with underscore means it's an array of that data type */
    udt_name: string;

    element_type: string;
}

type LocalParams = {
    socket: any;
    func: () => any;
    has_rules: boolean;
    testRule: boolean;
}
function capitalizeFirstLetter(string: string) : string {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

type Filter = object | { $and: Filter[] } | { $or: Filter[] } | {};

export class ViewHandler {
    db: DB;
    name: string;
    columns: ColumnInfo[];
    column_names: string[];
    tableOrViewInfo: TableOrViewInfo;
    columnSet: any;
    tsDataDef: string = "";
    tsDataName: string = "";
    tsDboDefs: string[];
    tsDboDef: string;
    tsDboName: string = "";
    tsFieldFilter: string = "";
    tsFieldFilterName: string = "";

    pubSubManager: PubSubManager;
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager){
        if(!db || !tableOrViewInfo) throw "";

        this.db = db;
        this.tableOrViewInfo = tableOrViewInfo;
        this.name = tableOrViewInfo.name;
        this.columns = tableOrViewInfo.columns;
        this.column_names = tableOrViewInfo.columns.map(c => c.name);

        this.pubSubManager = pubSubManager;

        this.columnSet = new pgp.helpers.ColumnSet(
            this.columns.map(({ name, data_type }) => ({
                name,
                ...(["json", "jsonb"].includes(data_type)? { mod: ":json" } : {})
            })
            ), { table: this.name }
        );
        
        this.tsDataName = capitalizeFirstLetter(this.name);
        this.tsFieldFilterName = "FieldFilter_" + this.name;
        this.tsDataDef = `type ${this.tsDataName} = {\n`;
        this.columns.map(({ name, udt_name }) => {
            this.tsDataDef += `     ${name}?: ${postgresToTsType(udt_name)};\n`
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

    makeDef(){
        this.tsDboName = `DBO_${this.name}`;
        this.tsDboDef = `type ${this.tsDboName} = {\n ${this.tsDboDefs.join("\n")} \n};\n`;
    }

    getFullDef(){
        return []
    }

    async validateViewRules(fields: FieldFilter, filterFields: FieldFilter, returningFields: FieldFilter, forcedFilter: object){

        /* Safely test publish rules */
        if(fields) {
            try {
                this.parseFieldFilter(fields);
            } catch(e){
                throw ` issue with fields: \nVALUE: ` + JSON.stringify(fields, null, 2) + "\nERROR: " + e;
            }
        }
        if(filterFields) {
            try {
                this.parseFieldFilter(filterFields);
            } catch(e){
                throw ` issue with filterFields: \nVALUE: ` + JSON.stringify(filterFields, null, 2) + "\nERROR: " + e;
            }
        }
        if(returningFields) {
            try {
                this.parseFieldFilter(returningFields);
            } catch(e){
                throw " issue with returningFields: \nVALUE: " + JSON.stringify(returningFields, null, 2) + "\nERROR: " + e;
            }
        }
        if(forcedFilter) {
            try {
                await this.find(forcedFilter, { limit: 0 });
            } catch(e){
                throw " issue with forcedFilter: \nVALUE: " + JSON.stringify(forcedFilter, null, 2) + "\nERROR: " + e;
            }
        }

        return true;
    }

    async find(filter: Filter, selectParams?: SelectParams , param3_unused = null, tableRules?: TableRule, localParams?: LocalParams): Promise<object[]>{
        try {
            if(filter && !isPojoObject(filter)) throw `invalid update filter -> ${JSON.stringify(filter)} \n Expecting an object or undefined`;

            const { select = "*", limit = null, offset = null, orderBy = null, expectOne = false } = selectParams || {};

            let fields: FieldFilter,
                filterFields: FieldFilter,
                forcedFilter: object,
                maxLimit: number;


            const { testRule = false } = localParams || {};

            if(tableRules){
                if(!tableRules.select) throw "select rules missing for " + this.name;
                fields = tableRules.select.fields;
                forcedFilter = tableRules.select.forcedFilter;
                filterFields = tableRules.select.filterFields;
                maxLimit = tableRules.select.maxLimit;

                if(!fields)  throw ` invalid select rule for ${this.name}. fields missing `;

                if(testRule){
                    if(maxLimit && !Number.isInteger(maxLimit)) throw " invalid maxLimit, expecting integer but got " + maxLimit;

                    await this.validateViewRules(fields, filterFields, null, forcedFilter);
                    return [];
                }
            }

            // console.log(this.parseFieldFilter(select));

            let columnSet = this.prepareColumnSet(select, fields);
            
            let _query = pgp.as.format(" SELECT ${select:raw} FROM ${_psqlWS_tableName:name} ", { select: columnSet, _psqlWS_tableName: this.name });
        
            _query += this.prepareWhere(filter, forcedFilter, filterFields)
            _query += this.prepareSort(orderBy, fields);
            _query += this.prepareLimitQuery(limit, maxLimit);
            _query += this.prepareOffsetQuery(offset);
            // console.log(_query)
            /* TO FINISH */
            // if(select_rules.validate){

            // }

            if(expectOne) return this.db.one(_query);
            else return this.db.any(_query);

        } catch(e){
            throw ` Issue with dbo.${this.name}.find: \n -> ` + e;
        }                             
    }

    findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?, table_rules?: TableRule, localParams?: LocalParams): Promise<object>{

        try {
            const { select = "*", orderBy = null, expectOne = true } = selectParams || {};
            return this.find(filter, { select, orderBy, limit: 1, expectOne }, null, table_rules, localParams);
        } catch(e){
            throw ` Issue with dbo.${this.name}.findOne: \n -> ` + e;
        }
    }

    count(filter?: Filter, param2_unused?, param3_unused?, table_rules?: TableRule, localParams: any = {}): Promise<number>{
        
        try {
            return this.find(filter, { select: "", limit: 1 }, null, table_rules, localParams)
            .then(allowed => {
                const { filterFields, forcedFilter } = get(table_rules, "select") || {};
                
                let query = "SELECT COUNT(*) FROM ${_psqlWS_tableName:raw} " + this.prepareWhere(filter, forcedFilter, filterFields, false);
                return this.db.one(query, { _psqlWS_tableName: this.name }).then(({ count }) => + count);
            });
        } catch(e){
            throw ` Issue with dbo.${this.name}.count: \n -> ` + e;
        } 
    }

    subscribe(filter: Filter, params: SelectParams, localFunc: (items: object[]) => any, table_rules?: TableRule, localParams?: LocalParams){
        try {
      
            if(!localParams && !localFunc) throw " missing data. provide -> localFunc | localParams { socket } "; 

            const { filterFields, forcedFilter } = get(table_rules, "select") || {},
                condition = this.prepareWhere(filter, forcedFilter, filterFields, true);
            
            if(!localFunc) {
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
            } else {
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
                        this.pubSubManager.removeLocalSub(this.name, condition, localFunc)
                    };
                return Object.freeze({ unsubscribe })
            }
        } catch(e){
            throw ` Issue with dbo.${this.name}.subscribe: \n -> ` + e;
        } 
        
    }




    // getdFindCondition(filter: object, table_rules: TableRule, excludeWhere = false): string {
    //     let select_rules = null;
    //     if(table_rules) select_rules = table_rules.select; 
    //     return this.prepareCondition(filter, select_rules.forcedFilter, select_rules.filterFields, excludeWhere);
    // }

    prepareColumnSet(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true): string {  //, asColumnSet = true, fullCols = false
        let all_columns = this.column_names.slice(0),
            allowedFields = all_columns.slice(0),
            resultFields = [];

        if(selectParams){
            resultFields = this.parseFieldFilter(selectParams, allow_empty);
        }
        if(allowed_cols){
            allowedFields = this.parseFieldFilter(allowed_cols, allow_empty);
        }

        let col_names = (resultFields || []).filter(f => !allowedFields || allowedFields.includes(f));
        try{
            let colSet = new pgp.helpers.ColumnSet(col_names);
            return colSet.names;
        } catch (e) {
            throw e;
        }
    }

    // prepareCondition(filter: object, forcedFilter: object, filterFields: FieldFilter, excludeWhere = false): string {
    //     return this.getWhere(filter, forcedFilter, filterFields, excludeWhere);
    //     // let final_filter = this.prepareFieldValues(filter, forcedFilter, filterFields),
    //     //     final_filter_keys = Object.keys(final_filter),
    //     //     result = "";
            
    //     // if(final_filter_keys.length){
    //     //     if(!excludeWhere) {
    //     //         result += " WHERE ";
    //     //     }
    //     //     result += this.getCondition({ ...final_filter }, null);
    //     // }
        
    //     // return result;
    // }

    prepareWhere(filter: Filter, forcedFilter: object, filterFields: FieldFilter, excludeWhere = false){
        const parseFilter = (f: any, parentFilter: any = null) => {
            let result = "";
            let keys = Object.keys(f);
            if(!keys.length) return result;
            if((keys.includes("$and") || keys.includes("$or"))){
                if(keys.length > 1) throw "$and/$or filter must contain only one array property. e.g.: { $and: [...] } OR { $or: [...] } ";
                if(parentFilter && Object.keys(parentFilter).includes("")) throw "$and/$or filter can only be placed at the root or within another $and/$or filter";
            }

            const { $and, $or } = f,
                group = $and || $or;

            if(group && group.length){
                const operand = $and? " AND " : " OR ";
                let conditions = group.map(gf => parseFilter(gf, group)).filter(c => c);
                if(conditions && conditions.length){
                    if(conditions.length === 1) return conditions.join(operand);
                    else return ` ( ${conditions.sort().join(operand)} ) `;
                }       
            } else if(!group) {
                result = this.getCondition({ ...f }, this.parseFieldFilter(filterFields));
            }
            return result;
        }

        if(!isPlainObject(filter)) throw "expecting an object but got -> " + JSON.stringify(filter);
        
        let result = "";
        let _filter = { ... filter };
        if(forcedFilter){
            _filter = {
                $and: [forcedFilter, _filter].filter(f => f)
            }
        }
            
        // let keys = Object.keys(filter);
        // if(!keys.length) return result;
        
        let cond = parseFilter(_filter, null);
        if(cond) {
            if(excludeWhere) return cond;
            else return " WHERE " + cond;
        }
    }

    /* NEW API !!! :) */
    getCondition(filter: object, allowed_colnames: string[]){
        
        const parseDataType = (key, col = null) => {
                const _col = col || this.columns.find(({ name }) => name === key);
                if(_col && _col.data_type === "ARRAY"){
                    return " ARRAY[${data:csv}] "
                }
                return " ${data} ";
            },
            conditionParsers = [
                { aliases: ["$nin"],                            get: (key, val, col) => " ${key:name} NOT IN (${data:csv}) " },
                { aliases: ["$in"],                             get: (key, val, col) => " ${key:name} IN (${data:csv}) " },

                { aliases: ["@@"],                              get: (key, val, col) => {
                    if(col && val && val.to_tsquery && Array.isArray(val.to_tsquery)){
                        if(col.data_type === "tsvector"){
                            return pgp.as.format(" ${key:name} @@ to_tsquery(${data:csv}) ", { key, data: val.to_tsquery }); 
                        } else {
                            return pgp.as.format(" to_tsvector(${key:name}::text) @@ to_tsquery(${data:csv}) ", { key, data: val.to_tsquery }); 
                        } 

                    } else throw `expecting { field_name: { "@@": { to_tsquery: [ ...params ] } } } `;
                }},

                { aliases: ["@>"],                              get: (key, val, col) => " ${key:name} @> " + parseDataType(key ,col) },
                { aliases: ["<@"],                              get: (key, val, col) => " ${key:name} <@ " + parseDataType(key ,col) },
                { aliases: ["&&"],                              get: (key, val, col) => " ${key:name} && " + parseDataType(key ,col) },

                { aliases: ["=", "$eq", "$equal"],              get: (key, val, col) => " ${key:name} =  " + parseDataType(key ,col) },
                { aliases: [">", "$gt", "$greater"],            get: (key, val, col) => " ${key:name} >  " + parseDataType(key ,col) },
                { aliases: [">=", "$gte", "$greaterOrEqual"],   get: (key, val, col) => " ${key:name} >= " + parseDataType(key ,col) },
                { aliases: ["<", "$lt", "$less"],               get: (key, val, col) => " ${key:name} <  " + parseDataType(key ,col) },
                { aliases: ["<=", "$lte", "$lessOrEqual"],      get: (key, val, col) => " ${key:name} <= " + parseDataType(key ,col) },
                { aliases: ["$ilike"],                          get: (key, val, col) => " ${key:name}::text ilike ${data} " },
                { aliases: ["<>", "$ne", "$not"],               get: (key, val, col) => " ${key:name} " + (val === null? " IS NOT NULL " : (" <> " + parseDataType(key, col))) },
                { aliases: ["$isNull", "$null"],                get: (key, val, col) => " ${key:name} " + `  IS ${!val? " NOT " : ""} NULL ` }
            ],
            condAliases = conditionParsers.map(c => c.aliases).flat();

        let data = { ...filter };

        if(allowed_colnames){
            const invalidColumn = Object.keys(data)
                .find(fName => !allowed_colnames.includes(fName));

            if(invalidColumn){
                throw 'invalid columns in filter: ' + invalidColumn;
            }
        }

        let template = Object.keys(data)
            .map(fKey=>{
                let d = data[fKey],
                    col = this.columns.find(({ name }) => name === fKey);

                if(d === null){
                    return pgp.as.format(" ${key:name} IS NULL ", { key: fKey });
                }
                if(isPlainObject(d)){
                    if(Object.keys(d).length){
                        return Object.keys(d).map(operand_key => {
                            const op = conditionParsers.find(o => operand_key && o.aliases.includes(operand_key));
                            if(!op){
                                throw "Unrecognised operand: " + operand_key;
                            }
                            return pgp.as.format(op.get(fKey, d[operand_key], col), { key: fKey, data: d[operand_key] });
                        });
                        // if(Object.keys(d).length){

                        // } else throw `\n Unrecognised statement for field ->   ${fKey}: ` + JSON.stringify(d);
                    }                    
                }

                return pgp.as.format(" ${key:name} = " + parseDataType(fKey), { key: fKey, data: data[fKey] }); ;
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
    prepareSort(orderBy: OrderBy, allowed_cols): string {
        let column_names = this.column_names.slice(0);

        if(!orderBy) return "";

        let statement: string = "";

        let allowedFields = [];
        if(allowed_cols){
            allowedFields = this.parseFieldFilter(allowed_cols);
        }

        let _ob: { key: string, asc: boolean }[] = [];
        if(typeof orderBy === "object" && !Array.isArray(orderBy)){
            /* { key2: bool, key1: bool } */
            _ob = Object.keys(orderBy).map(key => ({ key, asc: Boolean(orderBy[key]) }))
        } else if(typeof orderBy === "string"){
            /* string */
            _ob = [{ key: orderBy, asc: true }];
        } else if(Array.isArray(orderBy)){

            /* Order by is formed of a list of ascending field names */
            let _orderBy = (orderBy as any[]);
            if(_orderBy && !_orderBy.find(v => typeof v !== "string")){
                /* [string] */
                _ob = _orderBy.map(key => ({ key, asc: true }));
            } else if(_orderBy.find(v => typeof v === "object" && Object.keys(v).length)) {
                if(!_orderBy.find(v => typeof v.key !== "string" || typeof v.asc !== "boolean")){
                    /* [{ key, asc }] */
                    _ob = <{ key: string, asc: boolean }[]>Object.freeze(_orderBy);
                } else {
                    /* [{ [key]: asc }] */
                    _ob = _orderBy.map(v => {
                        let key = Object.keys(v)[0],
                            asc = v[key];

                        if(typeof asc === "string"){ 
                            asc = ["asc", "ascending"].includes(asc.toLowerCase());
                        } else {
                            asc = Boolean(v[key]);
                        }
                        return { key, asc };
                    });
                }
            }
        }

        if(!_ob || !_ob.length) return "";

        let bad_param = _ob.find(({ key }) => !column_names.includes(key) || (allowedFields.length && !allowedFields.includes(key)));
        if(!bad_param){
            return " ORDER BY " + (_ob.map(({ key, asc }) => `${pgp.as.format("$1:name", key)} ${asc? " ASC " : " DESC "}` ).join(", "))
        } else {
            throw "Unrecognised orderBy fields or params: " + bad_param.key;
        }
    }

    /* This relates only to SELECT */
    prepareLimitQuery(limit = 100, maxLimit: number): string{
        const DEFAULT_LIMIT = 100,
            MAX_LIMIT = 1000;

        let _limit = [limit, DEFAULT_LIMIT].find(Number.isInteger);
            
        if(!Number.isInteger(_limit)){
            throw "limit must be an integer"
        }

        if(Number.isInteger(maxLimit)){
            _limit = Math.min(_limit, maxLimit);
        } else {
            _limit = Math.min(_limit, MAX_LIMIT);
        }

        return " LIMIT " + _limit;
    }

    /* This relates only to SELECT */
    prepareOffsetQuery(offset: number): string{
        if(Number.isInteger(offset)){
            return " OFFSET " + offset;
        }

        return "";
    }


    intersectColumns(allowedFields: FieldFilter, dissallowedFields: FieldFilter, fixIssues: boolean = false): string[] {
        let result = [];
        if(allowedFields){
            result = this.parseFieldFilter(allowedFields);
        }
        if(dissallowedFields){
            const _dissalowed = this.parseFieldFilter(dissallowedFields);

            if(!fixIssues) {

                throw `dissallowed/invalid field found for ${this.name}: `
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
    prepareFieldValues(obj: object = {}, forcedData: object = {}, allowed_cols: FieldFilter, fixIssues = false): object {
        let column_names = this.column_names.slice(0);
        if(!column_names || !column_names.length) throw "table column_names mising";
        let _allowed_cols = column_names.slice(0);
        let _obj = { ...obj };

        if(allowed_cols){
            _allowed_cols = this.parseFieldFilter(allowed_cols, false);
        }
        let final_filter = { ..._obj },
            filter_keys = Object.keys(final_filter);

        if(fixIssues && filter_keys.length){
            final_filter = {};
            filter_keys
                .filter(col => _allowed_cols.includes(col))
                .map(col => {
                    final_filter[col] = _obj[col];
                });
        }

        /* If has keys check against allowed_cols */
        if(final_filter && Object.keys(final_filter).length && _allowed_cols){
            validateObj(final_filter, _allowed_cols)
        }
        
        if(forcedData && Object.keys(forcedData).length){
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
   parseFieldFilter(fieldParams: FieldFilter = "*", allow_empty: boolean = true): string[] {
        const all_fields = this.column_names.slice(0);
        let colNames = null,
            initialParams = JSON.stringify(fieldParams);

        if(fieldParams){
            
            /* 
                "field1, field2, field4" | "*"
            */
            if(typeof fieldParams === "string"){
                fieldParams = fieldParams.split(",").map(k => k.trim());
            } 
            
            /* string[] */
            if(Array.isArray(fieldParams) && !fieldParams.find(f => typeof f !== "string")){
                /* 
                    ["*"] 
                */
                if(fieldParams[0] === "*"){
                    return all_fields.slice(0);

                /* 
                    [""] 
                */
                } else if(fieldParams[0] === ""){
                    if(allow_empty){
                        return [""];
                    } else {
                        throw "Empty value not allowed";
                    }
                /* 
                    ["field1", "field2", "field3"] 
                */
                } else {
                    colNames = fieldParams.slice(0);
                }

            /*
                { field1: true, field2: true } = only field1 and field2
                { field1: false, field2: false } = all fields except field1 and field2
            */
            } else if(isPlainObject(fieldParams)){

                if(Object.keys(fieldParams).length){
                    let keys = Object.keys(fieldParams);
                    if(keys[0] === ""){ 
                        if(allow_empty){
                            return [""];
                        } else {
                            throw "Empty value not allowed";
                        }
                    }

                    validate(keys);

                    let allowed = keys.filter(key => fieldParams[key]),
                        disallowed = keys.filter(key => !fieldParams[key]);


                    if(disallowed && disallowed.length){
                        return all_fields.filter(col => !disallowed.includes(col));
                    } else {
                        return all_fields.filter(col => allowed.includes(col));
                    }
                } else {
                    return all_fields.slice(0);
                }
            } else {
                throw " unrecognised field filter.\nExpected ->     string | string[] | { [field]: boolean } \n Received ->  " + initialParams;
            }

            validate(colNames);
        }
        return colNames;

        function validate(cols: string[]){
            let bad_keys = cols.filter(col => !all_fields.includes(col));
            if(bad_keys && bad_keys.length){
                throw "unrecognised or illegal fields: " + bad_keys.join();
            }
        }
    }
}

function isPojoObject(obj): boolean {
    if(obj && (typeof obj !== "object" || Array.isArray(obj) || obj instanceof Date)){
        return false;
    }
    return true;
}

type ValidDataAndColumnSet = {
    data: object;
    columnSet: any;
};

type ValidatedParams = {
   row: object;
   forcedData: object;
   allowedFields: FieldFilter;
   tableRules: TableRule;
   fixIssues: boolean;
}

export class TableHandler extends ViewHandler {
    io_stats: {
        throttle_queries_per_sec: number;
        since: number, 
        queries: number,
        batching: string[]
    }
    
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager){
        super(db, tableOrViewInfo, pubSubManager);
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
    willBatch(query: string){
        const now = Date.now();
        if(this.io_stats.since < Date.now()){
            this.io_stats.since = Date.now();
            this.io_stats.queries = 0;
        } else {
            this.io_stats.queries++;
        }

        if(this.io_stats.queries > this.io_stats.throttle_queries_per_sec){

            return true;
        }
    }

    async update(filter: Filter, newData: object, params: UpdateParams, tableRules: TableRule, localParams: LocalParams = null){
        try {

            const { testRule = false } = localParams || {};
            if(!testRule){
                if(!newData || !Object.keys(newData).length) throw "no update data provided";
                if(!filter || !isPojoObject(filter)) throw `invalid update filter -> ${JSON.stringify(filter)} \n Expecting an object `;
            }

            let forcedFilter: object = {},
                forcedData: object = {},
                returningFields: FieldFilter = "*",
                filterFields: FieldFilter = "*",
                fields: FieldFilter = "*";

            if(tableRules){
                if(!tableRules.update) throw "update rules missing for " + this.name;
                ({ forcedFilter, forcedData, returningFields, fields, filterFields } = tableRules.update);

                if(!fields)  throw ` invalid update rule for ${this.name}. fields missing `;

                /* Safely test publish rules */
                if(testRule){
                    await this.validateViewRules(fields, filterFields, returningFields, forcedFilter);
                    if(forcedData) {
                        try {
                            const { data, columnSet } = this.validateNewData({ row: forcedData, forcedData: null, allowedFields: "*", tableRules, fixIssues: false });
                            let query = pgp.helpers.update(data, columnSet) + " WHERE FALSE ";
                            await this.db.any("EXPLAIN " + query);
                        } catch(e){
                            throw " issue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                        }
                    }
                    return true;
                }
            }

            let { returning, multi = true, onConflictDoNothing = false, fixIssues = false } = params || {};

            /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
            let _fields = this.parseFieldFilter(fields);

            if(forcedFilter){
                let _forcedFilterKeys = Object.keys(forcedFilter);
                _fields = _fields.filter(fkey => !_forcedFilterKeys.includes(fkey))
            }
            
            const { data, columnSet } = this.validateNewData({ row: newData, forcedData, allowedFields: _fields, tableRules, fixIssues });
            let query = pgp.helpers.update(data, columnSet);

            query += this.prepareWhere(filter, forcedFilter, filterFields);
            if(onConflictDoNothing) query += " ON CONFLICT DO NOTHING ";

            let qType = "none";
            if(returning){
                qType = multi? "any" : "one";
                query += " RETURNING " + this.prepareColumnSet(returning, returningFields);
            }
            return this.db.tx(t => t[qType](query));
        } catch(e){
            throw ` Issue with dbo.${this.name}.update: \n -> ` + e;
        }
    };

    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }: ValidatedParams): ValidDataAndColumnSet {
        const synced_field = get(tableRules || {}, "sync.synced_field");
        if(synced_field && !row[synced_field]){
            row[synced_field] = Date.now();
        }
        let data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
        const dataKeys = Object.keys(data);

        if(!dataKeys.length) throw "missing/invalid data provided";
        let cs = new pgp.helpers.ColumnSet(this.columnSet.columns.filter(c => dataKeys.includes(c.name)), { table: this.name });

        return { data, columnSet: cs }
    }
    
    async insert(data: (object | object[]), param2?: InsertParams, param3_unused?, tableRules?: TableRule, localParams: LocalParams = null){
        try {

            const { returning, onConflictDoNothing, fixIssues = false } = param2 || {};
            const { testRule = false } = localParams || {};

            let returningFields: FieldFilter,
                forcedData: object,
                fields: FieldFilter;
    
            if(tableRules){
                if(!tableRules.insert) throw "insert rules missing for " + this.name;
                returningFields = tableRules.insert.returningFields;
                forcedData = tableRules.insert.forcedData;
                fields = tableRules.insert.fields;
    
                if(!fields) throw ` invalid insert rule for ${this.name}. fields missing `;

                /* Safely test publish rules */
                if(testRule){
                    await this.validateViewRules(fields, null, returningFields, null);
                    if(forcedData) {
                        const keys = Object.keys(forcedData);
                        if(keys.length){
                            try {
                                const values = pgp.helpers.values(forcedData),
                                    colNames = this.prepareColumnSet(keys, this.column_names);
                                await this.db.any("EXPLAIN INSERT INTO ${name:raw} (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { name: this.name, colNames, values })
                            } catch(e){
                                throw " issue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                            }
                        }
                    }
                    return true;
                }
            }
            
            if(!data) throw "Provide data in param1";
            const makeQuery = (row) => {
                if(!isPojoObject(row)) throw "invalid insert data provided -> " + JSON.stringify(row);
                const { data, columnSet } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues })
                return pgp.helpers.insert(data, columnSet);
            };
    
        
            let conflict_query = "";
            if(typeof onConflictDoNothing === "boolean" && onConflictDoNothing){
                conflict_query = " ON CONFLICT DO NOTHING ";
            }
    
            let query = "";
            if(Array.isArray(data)){
                // if(returning) throw "Sorry but [returning] is dissalowed for multi insert";
                let queries = data.map(p => { 
                    return makeQuery(p) + conflict_query 
                });
                query = pgp.helpers.concat(queries);
            } else {
                query = makeQuery(data);
            }
            
            let queryType = "none";
            if(returning){
                query += " RETURNING " + this.prepareColumnSet(returning, returningFields, false);
                queryType = "one"
            }
            
            return this.db.tx(t => t[queryType](query));
        } catch(e){
            throw ` Issue with dbo.${this.name}.insert: \n -> ` + e;
        }
    };
    
    delete(filter: Filter, params?: DeleteParams, param3_unused?, table_rules?: TableRule, localParams: LocalParams = null){    //{ socket, func, has_rules = false, socketDb } = {}
        try {
            const { returning } = params || {};

            if(!filter) throw `invalid/missing filter object -> ${JSON.stringify(filter)} \n Expecting empty object or something like { some_column: "filter_value" }`;

            // table_rules = table_rules || {};

            let forcedFilter: object = null,
                filterFields: FieldFilter = null,
                returningFields: FieldFilter = null;

            const { testRule = false } = localParams || {};
            if(table_rules){
                if(!table_rules.delete) throw "delete rules missing";
                forcedFilter = table_rules.delete.forcedFilter;
                filterFields = table_rules.delete.filterFields;
                returningFields = table_rules.delete.returningFields;

                if(!filterFields)  throw ` invalid delete rule for ${this.name}. filterFields missing `;

                /* Safely test publish rules */
                if(testRule){
                    this.validateViewRules(null, filterFields, returningFields, forcedFilter);
                    return true;
                }
            }

            let queryType = 'none';                        
            let _query = pgp.as.format("DELETE FROM ${_psqlWS_tableName:raw} ", { _psqlWS_tableName: this.name }) ;

            _query += this.prepareWhere(filter, forcedFilter, filterFields);

            if(returning){
                queryType = "any";
                _query += " RETURNING " + this.prepareColumnSet(returning, returningFields);
            }
            
            return this.db[queryType](_query, { _psqlWS_tableName: this.name });
        } catch(e){
            throw ` Issue with dbo.${this.name}.delete: \n -> ` + e;
        }
    };
   
    remove(filter: Filter, params?: UpdateParams, param3_unused?: null, tableRules?: TableRule, localParams: LocalParams = null){
        return this.delete(filter, params, param3_unused , tableRules, localParams);
    }

    upsert(filter: Filter, newData?: object, params?: UpdateParams, table_rules?: TableRule, localParams: LocalParams = null){
        try {
            return this.find(filter, { select: "", limit: 1 }, {}, table_rules, localParams)
                .then(exists => {
                    if(exists && exists.length){
                        // console.log(filter, "exists");
                        return this.update(filter, newData, params, table_rules, localParams);
                    } else {
                        // console.log(filter, "existnts")
                        return this.insert({ ...newData, ...filter }, params, null, table_rules, localParams);
                    }
                });
                // .catch(existnts => {
                //     console.log(filter, "existnts")
                //     return this.insert({ ...filter, ...newData}, params);
                // });
        } catch(e){
            throw ` Issue with dbo.${this.name}.upsert: \n -> ` + e;
        }
    };

    /* External request. Cannot sync from server */
    async sync(filter: Filter, params: SelectParams, param3_unused, table_rules: TableRule, localParams: LocalParams){
        try {
            const { socket } = localParams || {};

            if(!socket) throw "INTERNAL ERROR: socket missing";
            if(!table_rules || !table_rules.sync || !table_rules.select) throw "INTERNAL ERROR: sync or select rules missing";
            

            let { id_fields, synced_field, allow_delete }: SyncRule = table_rules.sync;

            if(!id_fields || !synced_field){
                const err = "id_fields OR synced_field missing from publish";
                console.error(err);
                throw err;
            }

            id_fields = this.parseFieldFilter(id_fields, false);

            /* Step 1: parse command and params */
            return this.find(filter, { select: [...id_fields, synced_field], limit: 0 }, null, table_rules, localParams)
                .then(isValid => {

                    const { filterFields, forcedFilter } = get(table_rules, "select") || {};

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

        } catch(e){
            throw ` Issue with dbo.${this.name}.sync: \n -> ` + e;
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

export interface DbHandler {
    [key: string]: TableHandler | ViewHandler
}

export class DboBuilder {
    tablesOrViews: TableOrViewInfo[];
    
    db: DB;
    schema: string = "public";

    dbo: DbHandler;
    pubSubManager: PubSubManager;

    pojoDefinitions: string[];
    dboDefinition: string;

    tsTypesDefinition: string;

    constructor(db: DB, schema: string = "public"){
        this.db = db;
        this.schema = schema;
        this.dbo = {};
        this.pubSubManager = new PubSubManager(this.db, this.dbo);
    }

    async init(): Promise<DbHandler>{
        
        this.tablesOrViews = await getTablesForSchemaPostgresSQL(this.db, this.schema)

        let allDataDefs = "";
        let allDboDefs = "";
        const common_types = 
`/* This file was generated by Prostgles 
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
`
        this.dboDefinition = `export type DBObj = {\n`;
        this.tablesOrViews.map(tov => {
            if(tov.is_view){
                this.dbo[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager);
            } else {
                this.dbo[tov.name] = new TableHandler(this.db, tov, this.pubSubManager);
            }
            allDataDefs += this.dbo[tov.name].tsDataDef + "\n";
            allDboDefs += this.dbo[tov.name].tsDboDef;
            this.dboDefinition += ` ${tov.name}: ${this.dbo[tov.name].tsDboName};\n`;
        });
        this.dboDefinition += "};\n";
        
        this.tsTypesDefinition = [common_types, allDataDefs, allDboDefs, this.dboDefinition].join("\n");
        
        return this.dbo;
            // let dbo = makeDBO(db, allTablesViews, pubSubManager, true);
    }
}

type PublishedTableRules = {
    [key: string]: TableRule
}


type PGP = pgPromise.IMain<{}, pg.IClient>;
let pgp: PGP = pgPromise({
    promiseLib: Bluebird
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});

// export async function makeDBO(db: DB): Promise<DbHandler> {
//     return await DBO.build(db, "public");
// }


/* UTILS */




/* UTILS */

function getTablesForSchemaPostgresSQL(db: DB, schema: string){
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
function validateObj(obj: object, allowedKeys: string[]): object{
    if(obj && Object.keys(obj).length){
        const invalid_keys = Object.keys(obj).filter(k => !allowedKeys.includes(k));
        if(invalid_keys.length){ 
            throw "Invalid/Illegal fields found: " + invalid_keys.join(", ");
        }
    }

    return obj;
}


function isPlainObject(o) {
    return Object(o) === o && Object.getPrototypeOf(o) === Object.prototype;
}

function postgresToTsType(data_type: string, elem_data_type?: string ): string{
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
            return 'string'
        case 'int2':
        case 'int4':
        case 'int8':
        case 'float4':
        case 'float8':
        case 'numeric':
        case 'money':
        case 'oid':
            return 'number'
        case 'bool':
            return 'boolean'
        case 'json':
        case 'jsonb':
            return 'Object'
        case 'date':
        case 'timestamp':
        case 'timestamptz':
            return 'Date'
        case '_int2':
        case '_int4':
        case '_int8':
        case '_float4':
        case '_float8':
        case '_numeric':
        case '_money':
            return 'Array<number>'
        case '_bool':
            return 'Array<number>'
        case '_varchar':
        case '_text':
        case '_citext':                    
        case '_uuid':
        case '_bytea':
            return 'Array<string>'
        case '_json':
        case '_jsonb':
            return 'Array<Object>'
        case '_timestamptz':
            return 'Array<Date>'
        default:
            return 'any'
    }
}
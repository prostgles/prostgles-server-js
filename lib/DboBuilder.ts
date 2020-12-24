
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Bluebird from "bluebird";
declare global { export interface Promise<T> extends Bluebird<T> {} }

import * as pgPromise from 'pg-promise';
import pg = require('pg-promise/typescript/pg-subset');
import { ColumnInfo, ValidatedColumnInfo, FieldFilter, SelectParams, 
    InsertParams, UpdateParams, DeleteParams, OrderBy, DbJoinMaker 
} from "prostgles-types";

export type DbHandler = {
    [key: string]: Partial<TableHandler>;
  } & DbJoinMaker & {
    sql?: (query: string, params?: any, options?: any) => Promise<any>;
  };;

import { get } from "./utils";
import { 
    DB, TableRule, SelectRule, InsertRule, UpdateRule, DeleteRule, SyncRule, Joins, Join, Prostgles, PublishParser, flat 
} from "./Prostgles";
import { PubSubManager, filterObj } from "./PubSubManager";

type PGP = pgPromise.IMain<{}, pg.IClient>;
let pgp: PGP = pgPromise({
    promiseLib: Bluebird
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});

export const asName = (str: string): string => {
    return pgp.as.format("$1:name", [str]);
}
// export type FieldFilter = object | string[] | "*" | "" ;



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

type LocalParams = {
    socket?: any;
    func?: () => any;
    has_rules?: boolean;
    testRule?: boolean;
    tableAlias?: string;
    subOne?: boolean;
    dbTX?: any;
}
function replaceNonAlphaNumeric(string: string): string {
    return string.replace(/[\W_]+/g,"_");
}
function capitalizeFirstLetter(string: string) : string {
    return replaceNonAlphaNumeric(string).charAt(0).toUpperCase() + string.slice(1);
}

export type Aggregation = { 
    field: string, 
    query: string, 
    alias: string,
    getQuery: (alias: string) => string;
};

type Filter = object | { $and: Filter[] } | { $or: Filter[] } | {};

type SelectFunc = {
    alias: string;
    getQuery: (alias: string, tableAlias?: string) => string;
}

type Query = {
    select: string[];
    selectFuncs: SelectFunc[];
    allFields: string[];
    aggs?: Aggregation[];
    table: string;
    where: string;
    orderBy: string[];
    limit: number;
    offset: number;
    isLeftJoin: boolean;
    joins?: Query[];
    joinAlias?: string;
    $path?: string[];
}

export type JoinInfo = { 
    table: string, 
    on: [[string, string]], 
    expectOne: boolean, 
    source: string, 
    target: string 
}[]

type JoinPaths = {
    t1: string;
    t2: string;
    path: string[];
}[];

import { findShortestPath, Graph } from "./shortestPath";



function makeErr(err, localParams?: LocalParams){
    // console.error(err)
    return Promise.reject({
        ...((!localParams || !localParams.socket)? err : {}),
        ...filterObj(err, ["column", "code", "table", "constraint"]),
        code_info: sqlErrCodeToMsg(err.code)
    });
}
const EXISTS_KEYS = ["$exists", "$notExists", "$existsJoined", "$notExistsJoined"];

function parseError(e){
    // console.error(e)
    return Object.keys(e || {}).length? e : e.toString?  ( "INTERNAL ERROR: " + e.toString() ): e;
}

export type ExistsFilterConfig = {
    key: string;
    f2: Filter;
    existType: typeof EXISTS_KEYS[number];
    tables: string[];
    isJoined: boolean;
    shortestJoin: boolean;
};

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
    joins: Join[];
    joinGraph: Graph;
    joinPaths: JoinPaths;
    dboBuilder: DboBuilder;
    t: pgPromise.ITask<{}>;
    is_view: boolean = true;
    filterDef: string = "";

    pubSubManager: PubSubManager;
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, joinPaths?: JoinPaths){
        if(!db || !tableOrViewInfo) throw "";

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

        this.columnSet = new pgp.helpers.ColumnSet(
            this.columns.map(({ name, data_type }) => ({
                name,
                ...(["json", "jsonb"].includes(data_type)? { mod: ":json" } : {})
            })
            ), { table: this.name }
        );
        
        this.tsDataName = capitalizeFirstLetter(this.name);
        this.tsDataDef = `export type ${this.tsDataName} = {\n`;
        this.columns.map(({ name, udt_name }) => {
            this.tsDataDef += `     ${replaceNonAlphaNumeric(name)}?: ${postgresToTsType(udt_name)};\n`
        });
        this.tsDataDef += "};";
        this.tsDataDef += "\n";
        this.tsDataDef += `export type ${this.tsDataName}_Filter = ${this.tsDataName} | object | { $and: (${this.tsDataName} | object)[] } | { $or: (${this.tsDataName} | object)[] } `;
        this.filterDef = ` ${this.tsDataName}_Filter `;
        const filterDef = this.filterDef;
        
        this.tsDboDefs = [
            `   getColumns: () => Promise<any[]>;`,
            `   find: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<${this.tsDataName}[] | any[]>;`,
            `   findOne: (filter?: ${filterDef}, selectParams?: SelectParams) => Promise<${this.tsDataName} | any>;`,
            `   subscribe: (filter: ${filterDef}, params: SelectParams, onData: (items: ${this.tsDataName}[]) => any) => Promise<{ unsubscribe: () => any }>;`,
            `   subscribeOne: (filter: ${filterDef}, params: SelectParams, onData: (item: ${this.tsDataName}) => any) => Promise<{ unsubscribe: () => any }>;`,
            `   count: (filter?: ${filterDef}) => Promise<number>;`
        ];
        this.makeDef();
    }

    makeDef(){
        this.tsDboName = `DBO_${this.name}`;
        this.tsDboDef = `export type ${this.tsDboName} = {\n ${this.tsDboDefs.join("\n")} \n};\n`;
    }

    getSelectFunctions(select: any){
        if(select){
            if(select.$rowhash){
                
            }
        }
    }

    getRowHashSelect(tableRules: TableRule, alias?: string, tableAlias?: string): string {
        let allowed_cols = this.column_names;
        if(tableRules) allowed_cols = this.parseFieldFilter(get(tableRules, "select.fields"));
        return "md5(" +
            allowed_cols
                .concat(["ctid"])
                .sort()
                .map(f => (tableAlias? (asName(tableAlias) + ".") : "") + asName(f))
                .map(f => `md5(coalesce(${f}::text, 'dd'))`)
                .join(" || ") + 
        `)` + (alias? ` as ${asName(alias)}` : "");
    }

    getFullDef(){
        return []
    }

    async validateViewRules(fields: FieldFilter, filterFields: FieldFilter, returningFields: FieldFilter, forcedFilter: object, rule: string){

        /* Safely test publish rules */
        if(fields) {
            try {
                this.parseFieldFilter(fields);
            } catch(e){
                throw ` issue with publish.${this.name}.${rule}.fields: \nVALUE: ` + JSON.stringify(fields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
            }
        }
        if(filterFields) {
            try {
                this.parseFieldFilter(filterFields);
            } catch(e){
                throw ` issue with publish.${this.name}.${rule}.filterFields: \nVALUE: ` + JSON.stringify(filterFields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
            }
        }
        if(returningFields) {
            try {
                this.parseFieldFilter(returningFields);
            } catch(e){
                throw ` issue with publish.${this.name}.${rule}.returningFields: \nVALUE: ` + JSON.stringify(returningFields, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
            }
        }
        if(forcedFilter) {
            try {
                await this.find(forcedFilter, { limit: 0 });
            } catch(e){
                throw ` issue with publish.${this.name}.${rule}.forcedFilter: \nVALUE: ` + JSON.stringify(forcedFilter, null, 2) + "\nERROR: " + JSON.stringify(e, null, 2);
            }
        }

        return true;
    }

    getShortestJoin(table1: string, table2: string, startAlias: number, isInner: boolean = false): { query: string, toOne: boolean } {
        // let searchedTables = [], result; 
        // while (!result && searchedTables.length <= this.joins.length * 2){

        // }
 
        let toOne = true,
            query = this.joins.map(({ tables, on, type }, i) => {
                if(type.split("-")[1] === "many"){
                    toOne = false;
                }
                const tl = `tl${startAlias + i}`,
                    tr = `tr${startAlias + i}`;
                return `FROM ${tables[0]} ${tl} ${isInner? "INNER" : "LEFT"} JOIN ${tables[1]} ${tr} ON ${Object.keys(on).map(lKey => `${tl}.${lKey} = ${tr}.${on[lKey]}`).join("\nAND ")}`;
            }).join("\n");
        return { query, toOne: false }
    }

    private getJoins(source: string, target: string, path?: string[]): JoinInfo {
        let result = [];

        if(!this.joinPaths) throw "Joins dissallowed";

        if(path && !path.length) throw `Empty join path ( $path ) specified for ${source} <-> ${target}`

        /* Find the join path between tables */
        let jp;
        if(!path){ 
            jp = this.joinPaths.find(j => path? j.path.join() === path.join() : j.t1 === source && j.t2 === target);
        } else {
            jp = {
                t1: source,
                t2: target,
                path
            }
        }
        if(!jp || !this.joinPaths.find(j => path? j.path.join() === path.join() : j.t1 === source && j.t2 === target))  throw `Joining ${source} <-...-> ${target} dissallowed or missing`;

        /* Make the join chain info excluding root table */
        result = (path || jp.path).slice(1).map((t2, i, arr) => {
            const t1 = i === 0? source : arr[i-1];
            
            if(!this.joins) this.joins = JSON.parse(JSON.stringify(this.dboBuilder.joins));

            /* Get join options */
            const jo = this.joins.find(j => j.tables.includes(t1) && j.tables.includes(t2));
            if(!jo) throw `Joining ${t1} <-> ${t2} dissallowed or missing`;;

            let on = [];

            Object.keys(jo.on).map(leftKey => {
                const rightKey = jo.on[leftKey];

                /* Left table is joining on keys */
                if(jo.tables[0] === t1){
                    on.push([leftKey, rightKey])

                /* Left table is joining on values */
                } else {
                    on.push([rightKey, leftKey])

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

    async buildJoinQuery(q: Query): Promise<string> {

        const makeQuery3 = (q: Query, depth: number = 0, joinFields: string[]) => {
            const PREF = `prostgles`,
                joins = q.joins || [],
                aggs = q.aggs || [],
                makePref = (q: Query) => !q.joinAlias? q.table : `${q.joinAlias || ""}_${q.table}`,
                makePrefANON = (joinAlias, table) => asName(!joinAlias? table : `${joinAlias || ""}_${table}`),
                makePrefAN = (q: Query) => asName(makePref(q));

            const indentLine = (numInd, str, indentStr = "    ") => new Array(numInd).fill(indentStr).join("") + str;
            const indStr = (numInd, str: string) => str.split("\n").map(s => indentLine(numInd, s)).join("\n");
            const indjArr = (numInd, strArr: string[], indentStr = "    "): string[] => strArr.map(str => indentLine(numInd, str) );
            const indJ = (numInd, strArr: string[], separator = " \n ", indentStr = "    ") => indjArr(numInd, strArr, indentStr).join(separator);
            const selectArrComma = (strArr: string[]): string[] => strArr.map((s, i, arr)=> s + (i < arr.length - 1? " , " : " "));
            const prefJCAN = (q: Query, str: string) => asName(`${q.joinAlias || q.table}_${PREF}_${str}`);

            // const indent = (a, b) => a;
            const joinTables = (q1: Query, q2: Query): string[] => {
                const paths = this.getJoins(q1.table, q2.table, q2.$path);

                return flat(paths.map(({ table, on }, i) => {
                    const prevTable = i === 0? q1.table : (paths[i - 1].table);
                    const thisAlias = makePrefANON(q2.joinAlias, table);
                    const prevAlias = i === 0? makePrefAN(q1) : thisAlias;
                    // If root then prev table is aliased from root query. Alias from join otherwise

                    let iQ = [
                        asName(table) + ` ${thisAlias}`
                    ];

                    /* If target table then add filters, options, etc */
                    if(i === paths.length - 1){
                         
                        const targetSelect = (
                            q2.select.concat(
                                (q2.joins || []).map(j => j.joinAlias || j.table)
                            ).concat(
                                /* Rename aggs to avoid collision with join cols */
                                (q2.aggs || []).map(a => asName(`agg_${a.alias}`) + " AS " + asName(a.alias)) || [])
                            ).filter(s => s).join(", ");

                        const _iiQ = makeQuery3(q2, depth + 1, on.map(([c1, c2]) => asName(c2)));
                        // const iiQ = flat(_iiQ.split("\n")); // prettify for debugging
                        // console.log(_iiQ)
                        const iiQ = [_iiQ];

                        iQ = [
                            "("
                        , ...indjArr(depth + 1, [
                                `-- 4. [target table] `
                            ,   `SELECT *,`
                            ,   `row_number() over() as ${prefJCAN(q2, `rowid_sorted`)},`
                            ,   `row_to_json((select x from (SELECT ${targetSelect}) as x)) AS ${prefJCAN(q2, `json`)}`
                            ,   `FROM (`
                            ,   ...iiQ
                            ,   `) ${asName(q2.table)}    `
                        ])
                        ,   `) ${thisAlias}`
                        ]
                    }
                    let jres =  [
                        `${q2.isLeftJoin? "LEFT" : "INNER"} JOIN `
                    , ...iQ
                    ,   `ON ${
                            on.map(([c1, c2]) => 
                                `${prevAlias}.${asName(c1)} = ${thisAlias}.${asName(c2)} `
                            ).join(" AND ")
                        }`
                    ];
                    return jres;
                }))
            }
                
            /* Leaf query */
            if(!joins.length){
                let select = (depth? q.allFields : q.select),
                    groupBy = "";
                // console.log(select, q);
                if(q.aggs && q.aggs.length){
                    q.select = q.select.filter(s => s && s.trim().length);
                    const missingFields = joinFields.filter(jf => !q.select.includes(jf));
                    let groupByFields = q.select;
                    if(depth && missingFields.length){
                        q.select = Array.from(new Set(missingFields.concat(q.select)));
                        groupByFields = q.select;
                    }

                    /* Rename aggs to avoid collision with join cols */
                    select = q.select.concat(q.aggs.map(a => !depth? a.query : a.getQuery(`agg_${a.alias}`)));
                    if(q.select.length){
                        groupBy = `GROUP BY ${groupByFields.concat((q.selectFuncs || []).map(sf => asName(sf.alias))).join(", ")}\n`;
                    }
                }
                
                // let res = "" +
                // `SELECT -- leaf query\n` + 
                // `${select} \n` +
                // `FROM ${asName(q.table)}\n`;

                // if(q.where) res += `${q.where}\n`;
                // if(groupBy) res += `${groupBy}\n`;
                // if(q.orderBy) res+= `${q.orderBy}\n`;
                // if(!depth) res += `LIMIT ${q.limit} \nOFFSET ${q.offset || 0}\n`;
                // console.log(select, q.selectFuncs)
                let fres = indJ(depth, [
                    `-- 0. or 5. [leaf query] `
                ,   `SELECT ` + select.concat((q.selectFuncs || []).map(sf => sf.getQuery("$rowhash"))).join(", ")
                ,   `FROM ${asName(q.table)} `
                ,   q.where
                ,   groupBy
                ,   q.orderBy
                ,   !depth? `LIMIT ${q.limit} ` : null
                ,   !depth? `OFFSET ${q.offset || 0} ` : null
                ].filter(v => v) as unknown as string[]);
                // console.log(fres);
                return fres;
            } else {
                // if(q.aggs && q.aggs && q.aggs.length) throw "Cannot join an aggregate";
                if(q.aggs && q.aggs.length && joins.find(j => j.aggs && j.aggs.length)) throw "Cannot join two aggregates";
            }

            if(q.selectFuncs.length) throw "Functions within select not allowed in joins yet. -> " + q.selectFuncs.map(s => s.alias).join(", ");
            
            const rootSelect = [
                " "
            ,   `-- 0. [root final]  `
            ,   "SELECT    "
            ,...selectArrComma((depth? q.allFields : q.select).concat((aggs || []).map(a => asName(a.alias))).filter(s => s).concat(
                joins.map((j, i)=> {
                    const jsq = `json_agg(${prefJCAN(j, `json`)}::jsonb ORDER BY ${prefJCAN(j, `rowid_sorted`)})   FILTER (WHERE ${prefJCAN(j, `limit`)} <= ${j.limit} AND ${prefJCAN(j, `dupes_rowid`)} = 1 AND ${prefJCAN(j, `json`)} IS NOT NULL)`;
                    const resAlias = asName(j.joinAlias || j.table)

                    // If limit = 1 then return a single json object (first one)
                    return (j.limit === 1? `${jsq}->0 ` : `COALESCE(${jsq}, '[]') `) +  `  AS ${resAlias}`;
                })
              ))
            ,   `FROM ( `
            ,   ...indjArr(depth + 1, [
                    "-- 1. [subquery limit + dupes] "
                ,   "SELECT     "
                ,    ...selectArrComma([`t1.*`].concat(
                        joins.map((j, i)=> {
                            return  `row_number() over(partition by ${prefJCAN(j, `dupes_rowid`)}, ` + 
                                `ctid order by ${prefJCAN(j, `rowid_sorted`)}) AS ${prefJCAN(j, `limit`)}  `
                        }))
                    )
                ,   `FROM ( ----------- ${makePrefAN(q)}`
                ,   ...indjArr(depth + 1, [
                        "-- 2. [source full select + ctid to group by] "
                    ,   "SELECT "
                    ,   ...selectArrComma(
                            q.allFields.concat(["ctid"])
                            .map(field => `${makePrefAN(q)}.${field}  `)
                            .concat(
                                joins.map((j, i)=> 
                                makePrefAN(j) + "." + prefJCAN(j, `json`) + ", " + makePrefAN(j) + "." + prefJCAN(j, `rowid_sorted`)
                                ).concat(
                                    joins.map(j => `row_number() over(partition by ${makePrefAN(j)}.${prefJCAN(j, `rowid_sorted`)}, ${makePrefAN(q)}.ctid ) AS ${prefJCAN(j, `dupes_rowid`)}`)
                                )
                        ))
                    ,   `FROM ( `
                    ,   ...indjArr(depth + 1, [
                            "-- 3. [source table] "
                        ,   "SELECT "
                        ,   "*, row_number() over() as ctid "
                        ,   `FROM ${asName(q.table)} `
                        ,   `${q.where} `
                        ])
                    ,   `) ${makePrefAN(q)} `
                    ,   ...flat(joins.map((j, i)=> joinTables(q, j)))
                    ])
                ,   ") t1"
                ])
            ,   ") t0"
            ,   `GROUP BY ${(depth? q.allFields : q.select).concat(aggs && aggs.length? [] : [`ctid`]).filter(s => s).join(", ")} `
            ,   q.orderBy
            ,   depth? null : `LIMIT ${q.limit || 0} OFFSET ${q.offset || 0}`
            ,   "-- eof 0. root"
            ,   " "
            ].filter(v => v)

            let res = indJ(depth, rootSelect as unknown as string[]);
            // res = indent(res, depth);
            // console.log(res);
            return res;




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

        return makeQuery3(q, 0, []);
    }

    getAggs(select: object): Aggregation[] {
        const aggParsers = [
            { name: "$max", get: () => " MAX(${field:name}) as ${alias:name} "  },
            { name: "$min", get: () => " MIN(${field:name}) as ${alias:name} "  },
            { name: "$avg", get: () => " AVG(${field:name}) as ${alias:name} "  },
            { name: "$sum", get: () => " SUM(${field:name}) as ${alias:name} "  },
            { name: "$count", get: () => " COUNT(${field:name}) as ${alias:name} "  },
            { name: "$countDistinct", get: () => " COUNT(DISTINCT ${field:name}) as ${alias:name} "  },
        ];

        let keys = Object.keys(select);

        let nonAliased = keys.filter(key => typeof select[key] === "string")
            .map(field => ({ field, alias: field, parser: aggParsers.find(a => a.name === (select[field])) }))
            .filter((f: any) => f.parser)
            // .map(({ field, parser, alias }) => ({ field, alias, query: pgp.as.format(parser.get(), { field, alias }) }));
        
        let aliased = keys.filter(key => isPlainObject(select[key]))
            .map(alias => ({ alias, parser: aggParsers.find(a => a.name === (Object.keys(select[alias])[0])) }))
            .filter((f: any) => f.parser)
            .map((a: any)=> {
                let data = <any> select[a.alias][a.parser.name];
                if(
                    typeof data !== "string" && 
                    (
                        !data || 
                        Array.isArray(data) && data.find(v => typeof v !== "string")
                    )
                ) throw "\nInvalid aggregate function call -> " + JSON.stringify(select[a.alias]) + "\n Expecting { $aggFuncName: \"fieldName\" | [\"fieldName\"] }";

                a.field = Array.isArray(data)? data[0] : data;
                return a;
            });

            
        let res = nonAliased.concat(aliased).map(({ field, parser, alias }) => ({ 
            field, 
            alias, 
            query: pgp.as.format(parser.get(), { field, alias }),
            getQuery: (alias: string) =>  pgp.as.format(parser.get(), { field, alias })
        }));
        // console.log(res);
        return res;
    }

    async buildQueryTree(filter: Filter, selectParams?: SelectParams & { alias?: string }, param3_unused = null, tableRules?: TableRule, localParams?: LocalParams): Promise<Query> {
        this.checkFilter(filter);
        const { select, alias } = selectParams || {};
        let mainSelect = select;

        let joinAliases: string[],
            _Aggs: Aggregation[],
            aggAliases = [],
            aggs: string[],
            joinQueries: Query[] = [];
            
        // console.log("add checks for when to REINDEX TABLE CONCURRENTLY ... \nand also if join columns are missing indexes\nand also if running out of disk space!! (in nodejs)")
        
        if(isPlainObject(select)){
            if(
                Object.values(select).find(v => (v === 1 || v === true)) &&
                Object.values(select).find(v => (v === 0 || v === false))
            ) throw "\nCannot include and exclude fields at the same time";

            _Aggs = this.getAggs(filterObj(<object>select, Object.keys(select).filter(key => select[key] !== "*") )) || [];
            let aggFields = Array.from(new Set(_Aggs.map(a => a.field)));
            
            aggAliases = _Aggs.map(a => a.alias);
            
            if(_Aggs.length){
                /* Validate fields from aggs */
                await this.prepareValidatedQuery({}, { select: aggFields }, param3_unused, tableRules, localParams);
            }
            joinAliases = Object.keys(select)
                .filter(key => 
                    !aggAliases.includes(key) && 
                    ( 
                        select[key] === "*" 
                        ||  
                        isPlainObject(select[key])
                    ) 
            );
            if(joinAliases && joinAliases.length){
                if(!this.joinPaths) throw "Joins not allowed";
                for(let i = 0; i < joinAliases.length; i++){
                    let jKey = joinAliases[i],
                        jParams = select[jKey],
                        jTable = jKey,
                        isLeftJoin = true,
                        jSelectAlias = jKey,
                        jSelect = jParams,
                        jFilter = {},
                        jLimit = undefined,
                        jOffset = undefined,
                        jOrder = undefined,
                        jPath = undefined;
                    
                    /* Detailed join config */
                    if(isPlainObject(jParams)){
                        /* Has params */
                        const joinKeys = Object.keys(jParams).filter(key => ["$innerJoin", "$leftJoin"].includes(key)); 
                        if(joinKeys.length){
                            if(joinKeys.length > 1) throw "cannot use $innerJoin and $leftJoin at the same time on same table";
                            jTable = jParams[joinKeys[0]];
                            jSelect = jParams.select || "*";
                            jFilter = jParams.filter || {};
                            jLimit = jParams.limit;
                            jOffset = jParams.offset;
                            jOrder = jParams.orderBy;
                            jPath = jParams.$path;
                            isLeftJoin = joinKeys[0] === "$leftJoin";
                        }
                    }
                    // const joinTable = joins[i];
    
                    if(!this.dboBuilder.dbo[jTable]) throw `Joined table ${jTable} is disallowed or inexistent`;
    
                    let joinTableRules = undefined, isLocal = true;
                    if(localParams && localParams.socket){
                        isLocal = false;
                        joinTableRules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: jTable, command: "find", socket: localParams.socket });
                    }
                    if(isLocal || joinTableRules){
    
                        const joinQuery = await (this.dboBuilder.dbo[jTable] as TableHandler).buildQueryTree(jFilter, { select: jSelect, limit: jLimit, offset: jOffset, orderBy: jOrder, alias: jSelectAlias }, param3_unused, joinTableRules, localParams);
                        joinQuery.isLeftJoin = isLeftJoin;
                        joinQuery.joinAlias = jSelectAlias;
                        joinQuery.$path = jPath;
                        joinQueries.push(joinQuery);
                    }
                }
            } 
            
            mainSelect = filterObj(<object>select, Object.keys(select).filter(key => !(aggAliases.concat(joinAliases).includes(key))));
            /* Allow empty select */
            if(Object.keys(mainSelect).length < 1) mainSelect = "";

            /* Select star already selects all fields */
            if(Object.keys(select).includes("*")) {
                if(Object.keys(select).find(key => key !== "*" && [true, false, 1, 0].includes(select[key]))) throw "\nCannot use all ('*') together with other fields ";
                mainSelect = "*";
            }
        }
        
        let q = await this.prepareValidatedQuery(filter, { ...selectParams, select: mainSelect }, param3_unused, tableRules, localParams, aggAliases);
        const ambiguousAggName = q.select.find(s => aggAliases.includes(s));
        
        if(ambiguousAggName) throw `Cannot have select columns collide with aggregation alias for: ` + ambiguousAggName;
        q.joins = joinQueries;
        q.aggs = _Aggs;
        q.joinAlias = alias;
        return q;
    }

    checkFilter(filter: any){
        if(filter === null || filter && !isPojoObject(filter)) throw `invalid filter -> ${JSON.stringify(filter)} \nExpecting:    undefined | {} | { field_name: "value" } | { field: { $gt: 22 } } ... `;
    }

    async prepareValidatedQuery(
        filter: Filter, 
        selectParams?: SelectParams , 
        param3_unused = null, 
        tableRules?: TableRule, 
        localParams?: LocalParams, 
        validatedAggAliases?: string[]
    ): Promise<Query> {

        try {
            this.checkFilter(filter);
            const { select = "*", limit = null, offset = null, orderBy = null, expectOne = false } = selectParams || {};

            let fields: FieldFilter,
                filterFields: FieldFilter,
                forcedFilter: object,
                maxLimit: number;

            const { testRule = false, tableAlias } = localParams || {};

            if(tableRules){
                if(!tableRules.select) throw "select rules missing for " + this.name;
                fields = tableRules.select.fields;
                forcedFilter = tableRules.select.forcedFilter;
                filterFields = tableRules.select.filterFields;
                maxLimit = tableRules.select.maxLimit;

                if(<any>tableRules.select !== "*" && typeof tableRules.select !== "boolean" && !isPlainObject(tableRules.select)) throw `\nINVALID publish.${this.name}.select\nExpecting any of: "*" | { fields: "*" } | true | false`
                if(!fields)  throw ` invalid ${this.name}.select rule -> fields (required) setting missing.\nExpecting any of: "*" | { col_name: false } | { col1: true, col2: true }`;

                if(testRule){
                    if(maxLimit && !Number.isInteger(maxLimit)) throw ` invalid publish.${this.name}.select.maxLimit -> expecting integer but got ` + maxLimit;

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
            let selectFuncs = [];
            if(select && (select as any).$rowhash){
                delete (select as any).$rowhash;
                
                selectFuncs.push({
                    alias: "$rowhash",
                    getQuery: (alias: string, tableAlias?: string) => this.getRowHashSelect(tableRules, alias, tableAlias)
                });
            }
            
            return {
                isLeftJoin: true,
                table: this.name,
                allFields: this.column_names.map(asName),
                orderBy: [this.prepareSort(orderBy, fields, tableAlias, null, validatedAggAliases)],
                select: this.prepareSelect(select, fields, null, tableAlias).split(","),
                selectFuncs,
                where: await this.prepareWhere(filter, forcedFilter, filterFields, null, tableAlias, localParams, tableRules),
                limit: this.prepareLimitQuery(limit, maxLimit),
                offset: this.prepareOffsetQuery(offset)
            };

        } catch(e){
            // console.error(e)
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.find()` };
        }  
    }

    async getColumns(tableRules?: TableRule, localParams?: LocalParams): Promise<ValidatedColumnInfo[]> {
        if(tableRules || localParams){

            const selF = this.parseFieldFilter(get(tableRules, "select.fields"));
            const filF = this.parseFieldFilter(get(tableRules, "select.filterFields"));

            const insF = this.parseFieldFilter(get(tableRules, "insert.fields"));

            const updF = this.parseFieldFilter(get(tableRules, "update.fields"));

            const delF = this.parseFieldFilter(get(tableRules, "delete.filterFields"));
            return this.columns.map(c => ({
                ...c,
                insert: insF.includes(c.name),
                select: selF.includes(c.name),
                filter: filF.includes(c.name),
                update: updF.includes(c.name),
                delete: delF.includes(c.name)
            }));
        }
        return this.columns.map(c => ({
            ...c,
            insert: true,
            select: true,
            update: true,
            delete: true
        }));
    }

    async find(filter: Filter, selectParams?: SelectParams , param3_unused = null, tableRules?: TableRule, localParams?: LocalParams): Promise<object[]>{
        try {
            filter = filter || {};
            const { expectOne = false } = selectParams || {};

            const { testRule = false } = localParams || {};

            // const statement = await this.prepareValidatedQuery(filter, selectParams, param3_unused, tableRules, localParams),
            //     _query = statement.query;

            if(testRule) {
                await this.prepareValidatedQuery(filter, selectParams, param3_unused, tableRules, localParams);
                return undefined;
            }
            const q = await this.buildQueryTree(filter, selectParams, param3_unused, tableRules, localParams),
                _query = await this.buildJoinQuery(q);

            // console.log(_query);

            if(testRule) return [];
            if(selectParams){
                const good_params = ["select", "orderBy", "offset", "limit", "expectOne"];
                const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
                if(bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }

            /* Apply publish validation */
            // if(tableRules && tableRules.select && tableRules.select.validate){
            //     const forcedFilter = tableRules.select.forcedFilter || {};
                
            //     /* Filters have been validated up to this point */
            //     await tableRules.select.validate({ filter: { ...filter, ...forcedFilter }, params: selectParams });
            // }

            // console.log(_query);
            if(expectOne) return (this.t || this.db).oneOrNone(_query).catch(err => makeErr(err, localParams));
            else return (this.t || this.db).any(_query).catch(err => makeErr(err, localParams));

        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.find()` };
        }                             
    }

    findOne(filter?: Filter, selectParams?: SelectParams, param3_unused?, table_rules?: TableRule, localParams?: LocalParams): Promise<object>{

        try {
            const expectOne = true;
            const { select = "*", orderBy = null, offset = 0 } = selectParams || {};
            if(selectParams){
                const good_params = ["select", "orderBy", "offset"];
                const bad_params = Object.keys(selectParams).filter(k => !good_params.includes(k));
                if(bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }
            return this.find(filter, { select, orderBy, limit: 1, offset, expectOne }, null, table_rules, localParams);
        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.findOne()` };
        }
    }

    async count(filter?: Filter, param2_unused?, param3_unused?, table_rules?: TableRule, localParams: any = {}): Promise<number>{
        filter = filter || {};
        try {
            return await this.find(filter, { select: "", limit: 0 }, null, table_rules, localParams)
            .then(async allowed => {
                const { filterFields, forcedFilter } = get(table_rules, "select") || {};
                
                let query = "SELECT COUNT(*) FROM ${_psqlWS_tableName:name} " + await this.prepareWhere(filter, forcedFilter, filterFields, false, null, localParams, table_rules);
                return (this.t || this.db).one(query, { _psqlWS_tableName: this.name }).then(({ count }) => + count);
            });
        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.count()` };
        } 
    }

    async subscribe(filter: Filter, params: SelectParams, localFunc: (items: object[]) => any, table_rules?: TableRule, localParams?: LocalParams){
        try {
            if(this.t) throw "subscribe not allowed within transactions";
            if(!localParams && !localFunc) throw " missing data. provide -> localFunc | localParams { socket } "; 

            const { filterFields, forcedFilter } = get(table_rules, "select") || {},
                condition = await this.prepareWhere(filter, forcedFilter, filterFields, true, null, localParams, table_rules);
            
            if(!localFunc) {
                return await this.find(filter, { ...params, limit: 0 }, null, table_rules, localParams)
                .then(isValid => {
    
                    const { socket = null, subOne = false } = localParams;
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
                        last_throttled: 0,
                        subOne
                    }).then(channelName => ({ channelName }));
                });
            } else {
                const { subOne = false } = localParams || {};
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
                    last_throttled: 0,
                    subOne
                }).then(channelName => ({ channelName }));
                const unsubscribe = () => {
                        this.pubSubManager.removeLocalSub(this.name, condition, localFunc)
                    };
                return Object.freeze({ unsubscribe })
            }
        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.subscribe()` };
        }        
    }

    subscribeOne(filter: Filter, params: SelectParams, localFunc: (items: object) => any, table_rules?: TableRule, localParams?: LocalParams){
        return this.subscribe(filter, params, localFunc, table_rules, { ...(localParams || {}), subOne: true });
    }

    getAllowedSelectFields(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true): string[] {
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

        /* Maintain allowed cols order */
        if(selectParams === "*" && allowedFields && allowedFields.length) col_names = allowedFields;

        return col_names;
    }

    prepareColumnSet(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true, onlyNames: boolean = true): string | pgPromise.ColumnSet {
        let all_columns = this.column_names.slice(0);
        let col_names = this.getAllowedSelectFields(selectParams, all_columns, allow_empty);
        try{
            let colSet = new pgp.helpers.ColumnSet(col_names);
            return onlyNames? colSet.names : colSet;
        } catch (e) {
            throw e;
        }
    }

    prepareSelect(selectParams: FieldFilter = "*", allowed_cols: FieldFilter, allow_empty: boolean = true, tableAlias?: string): string {
        if(tableAlias){
            let cs = <pgPromise.ColumnSet>this.prepareColumnSet(selectParams, allowed_cols, true, false);
            return cs.columns.map(col => pgp.as.format("${tableAlias:name}.${name:name}", { tableAlias, name: col.name })).join(", ");
        } else {
            return <string>this.prepareColumnSet(selectParams, allowed_cols, true, true);
        }
    }

    private getFinalFilterObj(filter: Filter, forcedFilter: object): object {

        let _filter = { ... filter };
        if(!isPlainObject(_filter)) throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);

        if(forcedFilter){
            _filter = {
                $and: [forcedFilter, _filter].filter(f => f)
            }
        }

        return _filter;
    }

    async prepareWhere(filter: Filter, forcedFilter: object, filterFields: FieldFilter, excludeWhere = false, tableAlias: string = null, localParams: LocalParams, tableRule: TableRule){
        const parseFilter = async (f: any, parentFilter: any = null) => {
            let result = "";
            let keys = Object.keys(f);
            if(!keys.length) return result;
            if((keys.includes("$and") || keys.includes("$or"))){
                if(keys.length > 1) throw "\n$and/$or filter must contain only one array property. e.g.: { $and: [...] } OR { $or: [...] } ";
                if(parentFilter && Object.keys(parentFilter).includes("")) throw "$and/$or filter can only be placed at the root or within another $and/$or filter";
            }

            const { $and, $or } = f,
                group = $and || $or;

            if(group && group.length){
                const operand = $and? " AND " : " OR ";
                let conditions = (await Promise.all(group.map(async gf => await parseFilter(gf, group)))).filter(c => c);
                if(conditions && conditions.length){
                    if(conditions.length === 1) return conditions.join(operand);
                    else return ` ( ${conditions.sort().join(operand)} ) `;
                }       
            } else if(!group) {
                result = await this.getCondition({ ...f }, this.parseFieldFilter(filterFields), tableAlias, localParams, tableRule);
            }
            return result;
        }

        if(!isPlainObject(filter)) throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(filter);
        

        let _filter = { ... filter };
        if(forcedFilter){
            _filter = {
                $and: [forcedFilter, _filter].filter(f => f)
            }
        }
            
        // let keys = Object.keys(filter);
        // if(!keys.length) return result;
        
        let cond = await parseFilter(_filter, null);
        if(cond) {
            if(excludeWhere) return cond;
            else return " WHERE " + cond;
        }
        return "";
    }

    async prepareExistCondition(eConfig: ExistsFilterConfig, localParams: LocalParams, tableRules: TableRule): Promise<string> {
        let res = "";
        const thisTable = this.name;

        let { f2, tables, isJoined } = eConfig;
        let t2 = tables[tables.length - 1];

        tables.forEach(t => {
            if(!this.dboBuilder.dbo[t]) throw "Invalid or dissallowed table: " + t;
        });


        /* Nested $exists not allowed */
        if(f2 && Object.keys(f2).find(fk => EXISTS_KEYS.includes(fk))){
            throw "Nested exists dissallowed";
        }

        const makeTableChain = (finalFilter: string) => {

            let joinPaths: JoinInfo = [];
            tables.map((t2, depth) => {
                let t1 = depth? tables[depth - 1] : thisTable;
                let exactPaths = [t1, t2];

                if(!depth && eConfig.shortestJoin) exactPaths = undefined;
                
                joinPaths = joinPaths.concat(this.getJoins(t1, t2, exactPaths));
            });

            let r = makeJoin(joinPaths, 0);
            // console.log(r);
            return r;
            
            function makeJoin(paths: JoinInfo, ji: number) {
                const jp = paths[ji];

                let prevTable = ji? paths[ji - 1].table : jp.source;
                let table = paths[ji].table;
                let tableAlias = asName(ji < paths.length - 1? `jd${ji}` : table);
                let prevTableAlias = asName(ji? `jd${ji - 1}` : thisTable);

                let cond = `${jp.on.map(([c1, c2]) => 
                    `${prevTableAlias}.${asName(c1)} = ${tableAlias}.${asName(c2)}`).join("\n AND ")
                }`;
                // console.log(join, cond);
    
                let j = `SELECT 1 \n` +
                        `FROM ${asName(table)} ${tableAlias} \n` +
                        `WHERE ${cond} \n`;//
                if(
                    ji === paths.length - 1 && 
                    finalFilter
                ) {
                    j += `AND ${finalFilter} \n`;
                }

                const indent = (a, b) => a;    
    
                if(ji < paths.length - 1){
                    j += `AND ${makeJoin(paths, ji + 1)} \n`
                }

                j = indent(j, ji + 1);
    
                let res = `EXISTS ( \n` +
                    j +
                `) \n`;
                return indent(res, ji);
            }

        }

        let t2Rules: TableRule = undefined,
            forcedFilter,
            filterFields,
            tableAlias;

        /* Check if allowed to view data */
        if(localParams && localParams.socket && this.dboBuilder.publishParser){
            /* Need to think about joining through dissallowed tables */
            t2Rules = await this.dboBuilder.publishParser.getValidatedRequestRuleWusr({ tableName: t2, command: "find", socket: localParams.socket });
            if(!t2Rules || !t2Rules.select) throw "Dissallowed";
            ({ forcedFilter, filterFields } = t2Rules.select);
        }
        
        let finalWhere;
        try {
            finalWhere = await (this.dboBuilder.dbo[t2] as TableHandler).prepareWhere(f2, forcedFilter, filterFields, true, tableAlias, localParams, tableRules)
        } catch(err) {
            throw "Issue with preparing $exists query for table " + t2 + "\n->" + JSON.stringify(err);
        }
        // console.log(f2, finalWhere);
        if(!isJoined){
            res = ` EXISTS (SELECT 1 \nFROM ${asName(t2)} \n${finalWhere? `WHERE ${finalWhere}` : ""}) `
        } else {
            res = makeTableChain(finalWhere);
        }
        return res;
    }

    /* NEW API !!! :) */
    async getCondition(filter: object, allowed_colnames: string[], tableAlias?: string, localParams?: LocalParams, tableRules?: TableRule){
        let prefix = "";
        const getRawFieldName = (field) => {
            if(tableAlias) return pgp.as.format("$1:name.$2:name", [tableAlias, field]);
            else return pgp.as.format("$1:name", [field]);
        }
        const parseDataType = (key, col = null) => {
                const _col = col || this.columns.find(({ name }) => name === key);
                if(_col && _col.data_type === "ARRAY"){
                    return " ARRAY[${data:csv}] "
                }
                return " ${data} ";
            },
            parseLocationFilter = () => {

            },
            conditionParsers = [
                // { aliases: ["$exists"],                         get: (key, val, col) =>  },                
                { aliases: ["&&ST_MakeEnvelope"],               get: (key, val, col) => {
                    return "${key:raw} && ST_MakeEnvelope(${data:csv}) "
                } },
                { aliases: ["$nin"],                            get: (key, val, col) => "${key:raw} NOT IN (${data:csv}) " },
                { aliases: ["$in"],                             get: (key, val, col) => "${key:raw} IN (${data:csv}) " },
                { aliases: ["$tsQuery"],                        get: (key, val, col) => {
                    if(col.data_type === "tsvector"){
                        return pgp.as.format("${key:raw} @@ to_tsquery(${data:csv}) ", { key: getRawFieldName(key), data: val, prefix }); 
                    } else {
                        return pgp.as.format(" to_tsvector(${key:raw}::text) @@ to_tsquery(${data:csv}) ", { key, data: val, prefix }); 
                    } 
                } },

                { aliases: ["@@"],                              get: (key, val, col) => {
                    if(col && val && val.to_tsquery && Array.isArray(val.to_tsquery)){
                        if(col.data_type === "tsvector"){
                            return pgp.as.format("${key:raw} @@ to_tsquery(${data:csv}) ", { key: getRawFieldName(key), data: val.to_tsquery, prefix }); 
                        } else {
                            return pgp.as.format(" to_tsvector(${key:raw}::text) @@ to_tsquery(${data:csv}) ", { key, data: val.to_tsquery, prefix }); 
                        } 

                    } else throw `expecting { field_name: { "@@": { to_tsquery: [ ...params ] } } } `;
                }},

                { aliases: ["@>", "$contains"],                 get: (key, val, col) => "${key:raw} @> " + parseDataType(key ,col) },
                { aliases: ["<@", "$containedBy"],              get: (key, val, col) => "${key:raw} <@ " + parseDataType(key ,col) },
                { aliases: ["&&", "$overlaps"],                 get: (key, val, col) => "${key:raw} && " + parseDataType(key ,col) },

                { aliases: ["=", "$eq", "$equal"],              get: (key, val, col) => "${key:raw} =  " + parseDataType(key ,col) },
                { aliases: [">", "$gt", "$greater"],            get: (key, val, col) => "${key:raw} >  " + parseDataType(key ,col) },
                { aliases: [">=", "$gte", "$greaterOrEqual"],   get: (key, val, col) => "${key:raw} >= " + parseDataType(key ,col) },
                { aliases: ["<", "$lt", "$less"],               get: (key, val, col) => "${key:raw} <  " + parseDataType(key ,col) },
                { aliases: ["<=", "$lte", "$lessOrEqual"],      get: (key, val, col) => "${key:raw} <= " + parseDataType(key ,col) },
                { aliases: ["$ilike"],                          get: (key, val, col) => "${key:raw}::text ILIKE ${data}::text " },
                { aliases: ["$like"],                           get: (key, val, col) => "${key:raw}::text LIKE ${data}::text " },
                { aliases: ["$notIlike"],                       get: (key, val, col) => "${key:raw}::text NOT ILIKE ${data}::text " },
                { aliases: ["$notLike"],                        get: (key, val, col) => "${key:raw}::text NOT LIKE ${data}::text " },
                { aliases: ["<>", "$ne", "$not"],               get: (key, val, col) => "${key:raw} " + (val === null? " IS NOT NULL " : (" <> " + parseDataType(key, col))) },
                { aliases: ["$isNull", "$null"],                get: (key, val, col) => "${key:raw} " + `  IS ${!val? " NOT " : ""} NULL ` }
            ];

        let data = { ...filter };

        /* Exists join filter */
        const ERR = "Invalid exists filter. \nExpecting somethibng like: { $exists: { tableName.tableName2: Filter } } | { $exists: { \"**.tableName3\": Filter } }"
        const SP_WILDCARD = "**";
        let existsKeys: ExistsFilterConfig[] = Object.keys(data)
            .filter(k => EXISTS_KEYS.includes(k) && Object.keys(data[k] || {}).length)
            .map(key => {
                const isJoined = EXISTS_KEYS.slice(-2).includes(key);
                let firstKey = Object.keys(data[key])[0],
                    tables = firstKey.split("."),
                    f2 = data[key][firstKey],
                    shortestJoin = false;

                if(!isJoined){
                    if(tables.length !== 1) throw "Expecting single table in exists filter. Example: { $exists: { tableName: Filter } }"
                } else {
                    /* First part can be the ** param meaning shortest join */
                    
                    if(!tables.length) throw ERR + "\nBut got: " + data[key];

                    if(tables[0] === SP_WILDCARD){
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
                }
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
        if(existsKeys.length){
            existsCond = (await Promise.all(existsKeys.map(async k => await this.prepareExistCondition(k,  localParams, tableRules)))).join(" AND ");
        }

        let rowHashKeys = ["$rowhash"],
            rowHashCondition;
        if(rowHashKeys[0] in (data || {})){
            rowHashCondition = this.getRowHashSelect(tableRules ,tableAlias) + ` = ${pgp.as.format("$1", (data as any).$rowhash)}`;
            delete (data as any).$rowhash;
        }

        let filterKeys = Object.keys(data).filter(k => !rowHashKeys.includes(k) && !existsKeys.find(ek => ek.key === k));
        if(allowed_colnames){
            const invalidColumn = filterKeys
                .find(fName => !allowed_colnames.includes(fName));

            if(invalidColumn){
                throw `Table: ${this.name} -> disallowed/inexistent columns in filter: ${invalidColumn}`;
            }
        }

        let templates = flat(filterKeys
            .map(fKey=>{
                let d = data[fKey],
                    col = this.columns.find(({ name }) => name === fKey);

                if(d === null){
                    return pgp.as.format("${key:raw} IS NULL ", { key: getRawFieldName(fKey), prefix });
                }
                if(isPlainObject(d)){
                    if(Object.keys(d).length){
                        return Object.keys(d).map(operand_key => {
                            const op = conditionParsers.find(o => operand_key && o.aliases.includes(operand_key));
                            if(!op){
                                throw "Unrecognised operand: " + operand_key;
                            }
                            let _d = d[operand_key];
                            /* Turn data into array if comparing to array type column */
                            if(col.element_type && !Array.isArray(_d)) _d = [_d];
                            return pgp.as.format(op.get(fKey, _d, col), { key: getRawFieldName(fKey), data: _d, prefix });
                        });
                        // if(Object.keys(d).length){

                        // } else throw `\n Unrecognised statement for field ->   ${fKey}: ` + JSON.stringify(d);
                    }                    
                }

                return pgp.as.format("${key:raw} = " + parseDataType(fKey), { key: getRawFieldName(fKey), data: data[fKey], prefix });
            }));

            if(existsCond) templates.push(existsCond);
            if(rowHashCondition) templates.push(rowHashCondition);

        templates = templates.sort() /*  sorted to ensure duplicate subscription channels are not created due to different condition order */
            .join(" AND \n");

        // console.log(templates)
        return templates; //pgp.as.format(template, data);
                            
        /* 
            SHOULD CHECK DATA TYPES TO AVOID "No operator matches the given data type" error
            console.log(table.columns)
        */
    }

    /* This relates only to SELECT */
    prepareSort(orderBy: OrderBy, allowed_cols, tableAlias?: string, excludeOrder: boolean = false, validatedAggAliases?: string[]): string {
        let column_names = this.column_names.slice(0);

        const throwErr = () => {
                throw "\nInvalid orderBy option -> " + JSON.stringify(orderBy) + 
                    "\nExpecting { key2: false, key1: true } | { key1: 1, key2: -1 } | [{ key1: true }, { key2: false }] | [{ key1: 1 }, { key2: -1 }]";
            },
            parseOrderObj = (orderBy, expectOne = false): { key: string, asc: boolean }[] => {
                if(!isPlainObject(orderBy)) return throwErr();

                if(expectOne && Object.keys(orderBy).length > 1) throw "\nInvalid orderBy " + JSON.stringify(orderBy) +
                "\nEach orderBy array element cannot have more than one key";

                /* { key2: bool, key1: bool } */
                if(!Object.values(orderBy).find(v => ![true, false].includes(<any>v))){
                    return Object.keys(orderBy).map(key => ({ key, asc: Boolean(orderBy[key]) }))
                } else if(!Object.values(orderBy).find(v => ![-1,1].includes(<any>v))){
                    return Object.keys(orderBy).map(key => ({ key, asc: orderBy[key] === 1 }))
                } else if(!Object.values(orderBy).find(v => !["asc", "desc"].includes(<any>v))){
                    return Object.keys(orderBy).map(key => ({ key, asc: orderBy[key] === "asc" }))
                } else return throwErr();
            };

        if(!orderBy) return "";

        let allowedFields = [];
        if(allowed_cols){
            allowedFields = this.parseFieldFilter(allowed_cols);
        }

        let _ob: { key: string, asc: boolean }[] = [];
        if(isPlainObject(orderBy)){
            _ob = parseOrderObj(orderBy);
        } else if(typeof orderBy === "string"){
            /* string */
            _ob = [{ key: orderBy, asc: true }];
        } else if(Array.isArray(orderBy)){

            /* Order by is formed of a list of ascending field names */
            let _orderBy = (orderBy as any[]);
            if(_orderBy && !_orderBy.find(v => typeof v !== "string")){
                /* [string] */
                _ob = _orderBy.map(key => ({ key, asc: true }));
            } else if(_orderBy.find(v => isPlainObject(v) && Object.keys(v).length)) {
                if(!_orderBy.find(v => typeof v.key !== "string" || typeof v.asc !== "boolean")){
                    /* [{ key, asc }] */
                    _ob = <{ key: string, asc: boolean }[]>Object.freeze(_orderBy);
                } else {
                    /* [{ [key]: asc }] | [{ [key]: -1 }] */
                    _ob = _orderBy.map(v => parseOrderObj(v, true)[0]);
                }
            } else return throwErr();
        } else return throwErr();

        if(!_ob || !_ob.length) return "";

        let bad_param = _ob.find(({ key }) => 
            !(validatedAggAliases || []).includes(key) &&
            (
                !column_names.includes(key) || 
                (allowedFields.length && !allowedFields.includes(key))
            )
        );
        if(!bad_param){
            return (excludeOrder? "" : " ORDER BY ") + (_ob.map(({ key, asc }) => `${tableAlias? pgp.as.format("$1:name.", tableAlias) : ""}${pgp.as.format("$1:name", key)} ${asc? " ASC " : " DESC "}` ).join(", "))
        } else {
            throw "Unrecognised orderBy fields or params: " + bad_param.key;
        }
    }

    /* This relates only to SELECT */
    prepareLimitQuery(limit = 100, maxLimit: number): number{
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

        return _limit;
    }

    /* This relates only to SELECT */
    prepareOffsetQuery(offset: number): number{
        if(Number.isInteger(offset)){
            return offset;
        }

        return 0;
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
    * @param {FieldFilter} fieldParams - { col1: 0, col2: 0 } | { col1: true, col2: true } | "*" | ["key1", "key2"] | []
    * @param {boolean} allow_empty - allow empty select. defaults to true
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

                    keys.forEach(key => {
                        const allowedVals = [true, false, 0, 1];
                        if(!allowedVals.includes(fieldParams[key])) throw `Invalid field selection value for: { ${key}: ${fieldParams[key]} }. \n Allowed values: ${allowedVals.join(" OR ")}`
                    })

                    let allowed = keys.filter(key => fieldParams[key]),
                        disallowed = keys.filter(key => !fieldParams[key]);


                    if(disallowed && disallowed.length){
                        return all_fields.filter(col => !disallowed.includes(col));
                    } else {
                        return [...allowed];
                    }
                } else {
                    return all_fields.slice(0);
                }
            } else {
                throw " Unrecognised field filter.\nExpecting any of:   string | string[] | { [field]: boolean } \n Received ->  " + initialParams;
            }

            validate(colNames);
        }
        return colNames;

        function validate(cols: string[]){
            let bad_keys = cols.filter(col => !all_fields.includes(col));
            if(bad_keys && bad_keys.length){
                throw "\nUnrecognised or illegal fields: " + bad_keys.join(", ");
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
    
    constructor(db: DB, tableOrViewInfo: TableOrViewInfo, pubSubManager: PubSubManager, dboBuilder: DboBuilder, t?: pgPromise.ITask<{}>, joinPaths?: JoinPaths){
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
                if(!newData || !Object.keys(newData).length) throw "no update data provided\nEXPECTING db.table.update(filter, updateData, options)";
                this.checkFilter(filter);
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
                    await this.validateViewRules(fields, filterFields, returningFields, forcedFilter, "update");
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


            if(params){
                const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
                const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
                if(bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }

            /* Update all allowed fields (fields) except the forcedFilter (so that the user cannot change the forced filter values) */
            let _fields = this.parseFieldFilter(fields);

            if(forcedFilter){
                let _forcedFilterKeys = Object.keys(forcedFilter);
                _fields = _fields.filter(fkey => !_forcedFilterKeys.includes(fkey))
            }
            const { data, columnSet } = this.validateNewData({ row: newData, forcedData, allowedFields: _fields, tableRules, fixIssues });
            
            let nData = { ...data };
            if(tableRules && tableRules.update && tableRules.update.validate){
                nData = await tableRules.update.validate(nData);
            }
            let query = pgp.helpers.update(nData, columnSet);

            query += await this.prepareWhere(filter, forcedFilter, filterFields, false, null, localParams, tableRules);
            if(onConflictDoNothing) query += " ON CONFLICT DO NOTHING ";

            let qType = "none";
            if(returning){
                qType = multi? "any" : "one";
                query += " RETURNING " + this.prepareSelect(returning, returningFields);
            }
            if(this.t){
                return this.t[qType](query).catch(err => makeErr(err, localParams));
            }
            return this.db.tx(t => t[qType](query)).catch(err => makeErr(err, localParams));
        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.update()` };
        }
    };

    validateNewData({ row, forcedData, allowedFields, tableRules, fixIssues = false }: ValidatedParams): ValidDataAndColumnSet {
        const synced_field = get(tableRules || {}, "sync.synced_field");
        if(synced_field && !row[synced_field]){
            row[synced_field] = Date.now();
        }
        let data = this.prepareFieldValues(row, forcedData, allowedFields, fixIssues);
        const dataKeys = Object.keys(data);

        if(!data || !dataKeys.length) {
            // throw "missing/invalid data provided";
        }
        let cs = new pgp.helpers.ColumnSet(this.columnSet.columns.filter(c => dataKeys.includes(c.name)), { table: this.name });

        return { data, columnSet: cs }
    }
    
    async insert(data: (object | object[]), param2?: InsertParams, param3_unused?, tableRules?: TableRule, localParams: LocalParams = null): Promise<object | object[] | boolean>{
        try {

            const { returning, onConflictDoNothing, fixIssues = false } = param2 || {};
            const { testRule = false } = localParams || {};

            let returningFields: FieldFilter,
                forcedData: object,
                validate: any,
                preValidate: any,
                fields: FieldFilter;
    
            if(tableRules){
                if(!tableRules.insert) throw "insert rules missing for " + this.name;
                returningFields = tableRules.insert.returningFields;
                forcedData = tableRules.insert.forcedData;
                fields = tableRules.insert.fields;
                validate = tableRules.insert.validate;
                preValidate = tableRules.insert.preValidate;
    
                if(!fields) throw ` invalid insert rule for ${this.name}. fields missing `;

                /* Safely test publish rules */
                if(testRule){
                    await this.validateViewRules(fields, null, returningFields, null, "insert");
                    if(forcedData) {
                        const keys = Object.keys(forcedData);
                        if(keys.length){
                            try {
                                const values = pgp.helpers.values(forcedData),
                                    colNames = this.prepareSelect(keys, this.column_names);
                                await this.db.any("EXPLAIN INSERT INTO ${name:name} (${colNames:raw}) SELECT * FROM ( VALUES ${values:raw} ) t WHERE FALSE;", { name: this.name, colNames, values })
                            } catch(e){
                                throw "\nissue with forcedData: \nVALUE: " + JSON.stringify(forcedData, null, 2) + "\nERROR: " + e;
                            }
                        }
                    }
                    return true;
                }
            }

            let conflict_query = "";
            if(typeof onConflictDoNothing === "boolean" && onConflictDoNothing){
                conflict_query = " ON CONFLICT DO NOTHING ";
            }
            
            if(!data) data = {}; //throw "Provide data in param1";
            let returningSelect = returning? (" RETURNING " + this.prepareSelect(returning, returningFields, false)) : "";
            const makeQuery = async (_row, isOne = false) => {
                let row = { ..._row };
                if(preValidate){
                    row = await preValidate(row);
                }
                if(!isPojoObject(row)) throw "\ninvalid insert data provided -> " + JSON.stringify(row);

                const { data, columnSet } = this.validateNewData({ row, forcedData, allowedFields: fields, tableRules, fixIssues });
                let _data = { ...data };
                if(validate){
                    _data = await validate(_data);
                }
                let insertQ = "";
                if(!Object.keys(_data).length) insertQ = `INSERT INTO ${asName(this.name)} DEFAULT VALUES `;
                else insertQ = pgp.helpers.insert(_data, columnSet); 
                return insertQ + conflict_query + returningSelect;
            };


            if(param2){
                const good_params = ["returning", "multi", "onConflictDoNothing", "fixIssues"];
                const bad_params = Object.keys(param2).filter(k => !good_params.includes(k));
                if(bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }
    
            let query = "";
            let queryType = "none";
            if(Array.isArray(data)){
                // if(returning) throw "Sorry but [returning] is dissalowed for multi insert";
                let queries = await Promise.all(data.map(async p => {
                    const q = await makeQuery(p);
                    return q;
                }));
                // console.log(queries)
                query = pgp.helpers.concat(queries);
                if(returning) queryType = "many";
            } else {
                query = await makeQuery(data, true);
                if(returning) queryType = "one";
            }
            
            // console.log(query);
            if(this.t) return this.t[queryType](query).catch(err => makeErr(err, localParams));
            return this.db.tx(t => t[queryType](query)).catch(err => makeErr(err, localParams));
        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.insert()` };
        }
    };
    
    async delete(filter: Filter, params?: DeleteParams, param3_unused?, table_rules?: TableRule, localParams: LocalParams = null){    //{ socket, func, has_rules = false, socketDb } = {}
        try {
            const { returning } = params || {};
            filter = filter || {};
            this.checkFilter(filter);

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
                    await this.validateViewRules(null, filterFields, returningFields, forcedFilter, "delete");
                    return true;
                }
            }


            if(params){
                const good_params = ["returning"];
                const bad_params = Object.keys(params).filter(k => !good_params.includes(k));
                if(bad_params && bad_params.length) throw "Invalid params: " + bad_params.join(", ") + " \n Expecting: " + good_params.join(", ");
            }

            let queryType = 'none';
            let _query = pgp.as.format("DELETE FROM $1:name", [this.name] ) ;

            _query += await this.prepareWhere(filter, forcedFilter, filterFields, null, null, localParams, table_rules);

            if(returning){
                queryType = "any";
                _query += " RETURNING " + this.prepareSelect(returning, returningFields);
            }
            
            return (this.t || this.db)[queryType](_query, { _psqlWS_tableName: this.name }).catch(err => makeErr(err, localParams));
        } catch(e){
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.delete()` };
        }
    };
   
    remove(filter: Filter, params?: UpdateParams, param3_unused?: null, tableRules?: TableRule, localParams: LocalParams = null){
        return this.delete(filter, params, param3_unused , tableRules, localParams);
    }

    async upsert(filter: Filter, newData?: object, params?: UpdateParams, table_rules?: TableRule, localParams: LocalParams = null){
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
            if(localParams && localParams.testRule) throw e;
            throw { err: parseError(e), msg: `Issue with dbo.${this.name}.upsert()` };
        }
    };

    /* External request. Cannot sync from server */
    async sync(filter: Filter, params: SelectParams, param3_unused, table_rules: TableRule, localParams: LocalParams){
        if(!localParams) throw "Sync not allowed within the same server code";
        const { socket } = localParams;
        if(!socket) throw "INTERNAL ERROR: socket missing";


        if(!table_rules || !table_rules.sync || !table_rules.select) throw "INTERNAL ERROR: sync or select rules missing";

        if(this.t) throw "Sync not allowed within transactions";

        const ALLOWED_PARAMS = ["select"];
        const invalidParams = Object.keys(params || {}).filter(k => !ALLOWED_PARAMS.includes(k));
        if(invalidParams.length) throw "Invalid or dissallowed params found: " + invalidParams.join(", ");

        try {
            

            let { id_fields, synced_field, allow_delete }: SyncRule = table_rules.sync;
            const syncFields = [...id_fields, synced_field];

            if(!id_fields || !synced_field){
                const err = "INTERNAL ERROR: id_fields OR synced_field missing from publish";
                console.error(err);
                throw err;
            }

            id_fields = this.parseFieldFilter(id_fields, false);

            let allowedSelect = this.parseFieldFilter(get(table_rules, "select.fields"), false);
            if(syncFields.find(f => !allowedSelect.includes(f))){
                throw `INTERNAL ERROR: sync field missing from publish.${this.name}.select.fields`;
            }
            let select = this.getAllowedSelectFields(
                    get(params || {}, "select") || "*",
                    allowedSelect,
                    false
                );
            if(!select.length) throw "Empty select not allowed";

            /* Add sync fields if missing */
            syncFields.map(sf => {
                if(!select.includes(sf)) select.push(sf);
            });

            /* Step 1: parse command and params */
            return this.find(filter, { select, limit: 0 }, null, table_rules, localParams)
                .then(async isValid => {

                    const { filterFields, forcedFilter } = get(table_rules, "select") || {};
                    const condition = await this.prepareWhere(filter, forcedFilter, filterFields, true, null, localParams, table_rules);

                    // let final_filter = getFindFilter(filter, table_rules);
                    return this.pubSubManager.addSync({
                        table_info: this.tableOrViewInfo, 
                        condition,
                        id_fields, synced_field, allow_delete,
                        socket,
                        table_rules,
                        filter: { ...filter },
                        params: { select }
                    }).then(channelName => ({ channelName, id_fields, synced_field }));
                });

        } catch(e){
            if(localParams && localParams.testRule) throw e;
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
    }

}
type TransactionHandler = {
    (): Promise<TxHandler>
}
export interface TxHandler {
    [key: string]: TableHandler | ViewHandler;
}
export type TxCB = {
    (t: TxHandler): (any | void);
}
export type TX = {
    (t: TxCB): Promise<(any | void)>;
}
// export type JoinMaker = (filter?: object, select?: FieldFilter, options?: SelectParams) => any;

// export type TableJoin = {
//     [key: string]: JoinMaker;
// }
// export type DbJoinMaker = {
//     innerJoin: TableJoin;
//     leftJoin: TableJoin;
//     innerJoinOne: TableJoin;
//     leftJoinOne: TableJoin;
// }

// export type DbHandler = {
//     [key: string]: TableHandler | ViewHandler;
// } & DbJoinMaker;

export type DbHandlerTX = { [key: string]: TX } | DbHandler;


import { JOIN_TYPES } from "./Prostgles";

export class DboBuilder {
    tablesOrViews: TableOrViewInfo[];
    
    db: DB;
    schema: string = "public";

    dbo: DbHandler | DbHandlerTX;
    pubSubManager: PubSubManager;

    pojoDefinitions: string[];
    dboDefinition: string;

    tsTypesDefinition: string;

    joins: Join[];
    joinGraph: Graph;
    joinPaths: JoinPaths;

    prostgles: Prostgles;
    publishParser: PublishParser;

    constructor(prostgles: Prostgles){
        this.prostgles = prostgles;
        this.db = this.prostgles.db;
        this.schema = this.prostgles.schema || "public";
        this.dbo = { };
        // this.joins = this.prostgles.joins;
        this.pubSubManager = new PubSubManager(this.db, this.dbo as unknown as DbHandler);
    }

    getJoins(){
        return this.joins;
    }
    getJoinPaths(){
        return this.joinPaths;
    }

    async parseJoins(): Promise<JoinPaths> {
        if(this.prostgles.joins){
            let _joins = await this.prostgles.joins;
            if(typeof _joins === "string" && _joins === "inferred"){
                _joins = await getInferredJoins(this.db, this.prostgles.schema);
            }
            let joins = JSON.parse(JSON.stringify(_joins)) as Join[];
            this.joins = joins;
            // console.log(joins);
            // Validate joins
            try {
                // 1 find duplicates
                const dup = joins.find(j => 
                    j.tables[0] === j.tables[1] || 
                    joins.find(jj => 
                        j.tables.join() !== jj.tables.join() && 
                        j.tables.slice().sort().join() === jj.tables.slice().sort().join())
                    );
                if(dup){
                    throw "Duplicate join declaration for table: " + dup.tables[0];
                }
                const tovNames = this.tablesOrViews.map(t => t.name);

                // 2 find incorrect tables
                const missing = flat(joins.map(j => j.tables)).find(t => !tovNames.includes(t));
                if(missing){
                    throw "Table not found: " + missing;
                }
                
                // 3 find incorrect fields
                joins.map(({ tables, on }) => {
                    const t1 = tables[0],
                        t2 = tables[1],
                        f1s = Object.keys(on),
                        f2s = Object.values(on);
                    [[t1, f1s], [t2, f2s]].map(v => {
                        var t = <string>v[0],
                            f = <string[]>v[1];
                            
                        let tov = this.tablesOrViews.find(_t => _t.name === t);
                        if(!tov) throw "Table not found: " + t;
                        const m1 = f.filter(k => !tov.columns.map(c => c.name).includes(k))
                        if(m1 && m1.length){
                            throw `Table ${t}(${tov.columns.map(c => c.name).join()}) has no fields named: ${m1.join()}`;
                        }
                    });
                });

                // 4 find incorrect/missing join types
                const expected_types = " \n\n-> Expecting: " + JOIN_TYPES.map(t => JSON.stringify(t)).join(` | `)
                const mt = joins.find(j => !j.type);
                if(mt) throw "Join type missing for: " + JSON.stringify(mt, null, 2) + expected_types;

                const it = joins.find(j => !JOIN_TYPES.includes(j.type));
                if(it) throw "Incorrect join type for: " + JSON.stringify(it, null, 2) + expected_types;

            } catch(e){
                console.error("JOINS VALIDATION ERROR \n-> ", e);
            }

            // Make joins graph
            this.joinGraph = {};
            this.joins.map(({ tables }) => {
                let _t = tables.slice().sort(),
                    t1 = _t[0],
                    t2 = _t[1];
                this.joinGraph[t1] = this.joinGraph[t1] || {};
                this.joinGraph[t1][t2] = 1;

                this.joinGraph[t2] = this.joinGraph[t2] || {};
                this.joinGraph[t2][t1] = 1;
            });
            const tables = flat(this.joins.map(t => t.tables));
            this.joinPaths = [];
            tables.map(t1 => {
                tables.map(t2 => {
                    const spath = findShortestPath(this.joinGraph, t1, t2);
                    if(spath && spath.distance < Infinity){
                        if(!this.joinPaths.find(j => j.t1 === t1 && j.t2 === t2)){
                            this.joinPaths.push({ t1, t2, path: spath.path });
                        }
                        if(!this.joinPaths.find(j => j.t2 === t1 && j.t1 === t2)){
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
    }

    buildJoinPaths(){
        
    }

    async init(): Promise<DbHandler | DbHandlerTX>{
        
        this.tablesOrViews = await getTablesForSchemaPostgresSQL(this.db, this.schema);

        let allDataDefs = "";
        let allDboDefs = "";
        const common_types = 
`
export type Filter = object | {} | undefined;
export type GroupFilter = { $and: Filter } | { $or: Filter };
export type FieldFilter = object | string[] | "*" | "";
export type AscOrDesc = 1 | -1 | boolean;
export type OrderBy = { key: string, asc: AscOrDesc }[] | { [key: string]: AscOrDesc }[] | { [key: string]: AscOrDesc } | string | string[];
        
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
export type JoinMaker = (filter?: object, select?: FieldFilter, options?: SelectParams) => any;

`
        this.dboDefinition = `export type DBObj = {\n`;

        await this.parseJoins();

        let joinTableNames = [];

        this.tablesOrViews.map(tov => {
            if(tov.is_view){
                this.dbo[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager, this, null, this.joinPaths);
            } else {
                this.dbo[tov.name] = new TableHandler(this.db, tov, this.pubSubManager, this, null, this.joinPaths);
            }
            allDataDefs += (this.dbo[tov.name] as TableHandler).tsDataDef + "\n";
            allDboDefs += (this.dbo[tov.name] as TableHandler).tsDboDef;
            this.dboDefinition += ` ${tov.name}: ${(this.dbo[tov.name] as TableHandler).tsDboName};\n`;

            if(this.joinPaths && this.joinPaths.find(jp => [jp.t1, jp.t2].includes(tov.name))){

                let table = tov.name;
                joinTableNames.push(table);

                this.dbo.innerJoin = this.dbo.innerJoin || {};
                this.dbo.leftJoin = this.dbo.leftJoin || {};
                this.dbo.innerJoinOne = this.dbo.innerJoinOne || {};
                this.dbo.leftJoinOne = this.dbo.leftJoinOne || {};
                this.dbo.leftJoin[table] = (filter, select, options = {}) => {
                    return makeJoin(true, filter, select, options);
                }
                this.dbo.innerJoin[table] = (filter, select, options = {}) => {
                    return makeJoin(false, filter, select, options);
                }
                this.dbo.leftJoinOne[table] = (filter, select, options = {}) => {
                    return makeJoin(true, filter, select, {...options, limit: 1});
                }
                this.dbo.innerJoinOne[table] = (filter, select, options = {}) => {
                    return makeJoin(false, filter, select, {...options, limit: 1});
                }
                function makeJoin(isLeft = true, filter, select, options){
                    return {
                        [isLeft? "$leftJoin" : "$innerJoin"]: table,
                        filter,
                        select,
                        ...options
                    }
                }
            }
        });

        let joinBuilderDef = "";
        if(joinTableNames.length){
            joinBuilderDef += "export type JoinMakerTables = {\n";
            joinTableNames.map(tname => {
                joinBuilderDef += ` ${tname}: JoinMaker;\n`
            })
            joinBuilderDef += "};\n";
            ["leftJoin", "innerJoin", "leftJoinOne", "innerJoinOne"].map(joinType => {
                this.dboDefinition += ` ${joinType}: JoinMakerTables;\n`;
            });
        }


        if(this.prostgles.transactions){
            let txKey = "tx";
            if(typeof this.prostgles.transactions === "string") txKey = this.prostgles.transactions;
            this.dboDefinition += ` ${txKey}: (t: TxCB) => Promise<any | void> ;\n`;

            this.dbo[txKey] = (cb: TxCB) => {
                return this.db.tx((t) => {
                    let txDB = {};
                    this.tablesOrViews.map(tov => {
                        if(tov.is_view){
                            txDB[tov.name] = new ViewHandler(this.db, tov, this.pubSubManager, this, t, this.joinPaths);
                        } else {
                            txDB[tov.name] = new TableHandler(this.db, tov, this.pubSubManager, this, t, this.joinPaths);
                        }
                    });
                    return cb(txDB);
                });
            }
        }
        this.dboDefinition += "};\n";
        
        this.tsTypesDefinition = [common_types, allDataDefs, allDboDefs, joinBuilderDef, this.dboDefinition].join("\n");

        return this.dbo;
            // let dbo = makeDBO(db, allTablesViews, pubSubManager, true);
    }
}

type PublishedTableRules = {
    [key: string]: TableRule
}



// export async function makeDBO(db: DB): Promise<DbHandler> {
//     return await DBO.build(db, "public");
// }


/* UTILS */




/* UTILS */
function getTablesForSchemaPostgresSQL(db: DB, schema: string): Promise<{
    schema: string;
    name: string;
    columns: ColumnInfo[];
    is_view: boolean;
    parent_tables: string[];
}[]>{
    const query = " \
    SELECT t.table_schema as schema, t.table_name as name \
    , json_agg((SELECT x FROM (SELECT cc.column_name as name, cc.data_type, cc.udt_name, cc.element_type, cc.is_pkey) as x) ORDER BY cc.column_name, cc.data_type ) as columns  \
    , t.table_type = 'VIEW' as is_view \
    , array_to_json(vr.table_names) as parent_tables \
    FROM information_schema.tables t  \
    INNER join (  \
        SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name, e.data_type as element_type,  \
        EXISTS ( \
            SELECT 1    \
            from information_schema.table_constraints as tc \
            JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema  \
            WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type IN ('PRIMARY KEY') \
        ) as is_pkey    \
        FROM information_schema.columns c    \
        LEFT JOIN (SELECT * FROM information_schema.element_types )   e  \
             ON ((c.table_catalog, c.table_schema, c.table_name, 'TABLE', c.dtd_identifier)  \
              = (e.object_catalog, e.object_schema, e.object_name, e.object_type, e.collection_type_identifier))  \
    ) cc  \
    ON t.table_name = cc.table_name  \
    AND t.table_schema = cc.table_schema  \
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
    GROUP BY t.table_schema, t.table_name, t.table_type, vr.table_names  \
    ORDER BY schema, name ";
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

function sqlErrCodeToMsg(code){
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
      },
      c2 = {"20000":"case_not_found","21000":"cardinality_violation","22000":"data_exception","22001":"string_data_right_truncation","22002":"null_value_no_indicator_parameter","22003":"numeric_value_out_of_range","22004":"null_value_not_allowed","22005":"error_in_assignment","22007":"invalid_datetime_format","22008":"datetime_field_overflow","22009":"invalid_time_zone_displacement_value","22010":"invalid_indicator_parameter_value","22011":"substring_error","22012":"division_by_zero","22013":"invalid_preceding_or_following_size","22014":"invalid_argument_for_ntile_function","22015":"interval_field_overflow","22016":"invalid_argument_for_nth_value_function","22018":"invalid_character_value_for_cast","22019":"invalid_escape_character","22021":"character_not_in_repertoire","22022":"indicator_overflow","22023":"invalid_parameter_value","22024":"unterminated_c_string","22025":"invalid_escape_sequence","22026":"string_data_length_mismatch","22027":"trim_error","22030":"duplicate_json_object_key_value","22031":"invalid_argument_for_sql_json_datetime_function","22032":"invalid_json_text","22033":"invalid_sql_json_subscript","22034":"more_than_one_sql_json_item","22035":"no_sql_json_item","22036":"non_numeric_sql_json_item","22037":"non_unique_keys_in_a_json_object","22038":"singleton_sql_json_item_required","22039":"sql_json_array_not_found","23000":"integrity_constraint_violation","23001":"restrict_violation","23502":"not_null_violation","23503":"foreign_key_violation","23505":"unique_violation","23514":"check_violation","24000":"invalid_cursor_state","25000":"invalid_transaction_state","25001":"active_sql_transaction","25002":"branch_transaction_already_active","25003":"inappropriate_access_mode_for_branch_transaction","25004":"inappropriate_isolation_level_for_branch_transaction","25005":"no_active_sql_transaction_for_branch_transaction","25006":"read_only_sql_transaction","25007":"schema_and_data_statement_mixing_not_supported","25008":"held_cursor_requires_same_isolation_level","26000":"invalid_sql_statement_name","27000":"triggered_data_change_violation","28000":"invalid_authorization_specification","34000":"invalid_cursor_name","38000":"external_routine_exception","38001":"containing_sql_not_permitted","38002":"modifying_sql_data_not_permitted","38003":"prohibited_sql_statement_attempted","38004":"reading_sql_data_not_permitted","39000":"external_routine_invocation_exception","39001":"invalid_sqlstate_returned","39004":"null_value_not_allowed","40000":"transaction_rollback","40001":"serialization_failure","40002":"transaction_integrity_constraint_violation","40003":"statement_completion_unknown","42000":"syntax_error_or_access_rule_violation","42501":"insufficient_privilege","42601":"syntax_error","42602":"invalid_name","42611":"invalid_column_definition","42622":"name_too_long","42701":"duplicate_column","42702":"ambiguous_column","42703":"undefined_column","42704":"undefined_object","42710":"duplicate_object","42712":"duplicate_alias","42723":"duplicate_function","42725":"ambiguous_function","42803":"grouping_error","42804":"datatype_mismatch","42809":"wrong_object_type","42830":"invalid_foreign_key","42846":"cannot_coerce","42883":"undefined_function","42939":"reserved_name","44000":"with_check_option_violation","53000":"insufficient_resources","53100":"disk_full","53200":"out_of_memory","53300":"too_many_connections","53400":"configuration_limit_exceeded","54000":"program_limit_exceeded","54001":"statement_too_complex","54011":"too_many_columns","54023":"too_many_arguments","55000":"object_not_in_prerequisite_state","55006":"object_in_use","57000":"operator_intervention","57014":"query_canceled","58000":"system_error","58030":"io_error","72000":"snapshot_too_old","00000":"successful_completion","01000":"warning","0100C":"dynamic_result_sets_returned","01008":"implicit_zero_bit_padding","01003":"null_value_eliminated_in_set_function","01007":"privilege_not_granted","01006":"privilege_not_revoked","01004":"string_data_right_truncation","01P01":"deprecated_feature","02000":"no_data","02001":"no_additional_dynamic_result_sets_returned","03000":"sql_statement_not_yet_complete","08000":"connection_exception","08003":"connection_does_not_exist","08006":"connection_failure","08001":"sqlclient_unable_to_establish_sqlconnection","08004":"sqlserver_rejected_establishment_of_sqlconnection","08007":"transaction_resolution_unknown","08P01":"protocol_violation","09000":"triggered_action_exception","0A000":"feature_not_supported","0B000":"invalid_transaction_initiation","0F000":"locator_exception","0F001":"invalid_locator_specification","0L000":"invalid_grantor","0LP01":"invalid_grant_operation","0P000":"invalid_role_specification","0Z000":"diagnostics_exception","0Z002":"stacked_diagnostics_accessed_without_active_handler","2202E":"array_subscript_error","2200B":"escape_character_conflict","2201E":"invalid_argument_for_logarithm","2201F":"invalid_argument_for_power_function","2201G":"invalid_argument_for_width_bucket_function","2200D":"invalid_escape_octet","22P06":"nonstandard_use_of_escape_character","2201B":"invalid_regular_expression","2201W":"invalid_row_count_in_limit_clause","2201X":"invalid_row_count_in_result_offset_clause","2202H":"invalid_tablesample_argument","2202G":"invalid_tablesample_repeat","2200C":"invalid_use_of_escape_character","2200G":"most_specific_type_mismatch","2200H":"sequence_generator_limit_exceeded","2200F":"zero_length_character_string","22P01":"floating_point_exception","22P02":"invalid_text_representation","22P03":"invalid_binary_representation","22P04":"bad_copy_file_format","22P05":"untranslatable_character","2200L":"not_an_xml_document","2200M":"invalid_xml_document","2200N":"invalid_xml_content","2200S":"invalid_xml_comment","2200T":"invalid_xml_processing_instruction","2203A":"sql_json_member_not_found","2203B":"sql_json_number_not_found","2203C":"sql_json_object_not_found","2203D":"too_many_json_array_elements","2203E":"too_many_json_object_members","2203F":"sql_json_scalar_required","23P01":"exclusion_violation","25P01":"no_active_sql_transaction","25P02":"in_failed_sql_transaction","25P03":"idle_in_transaction_session_timeout","28P01":"invalid_password","2B000":"dependent_privilege_descriptors_still_exist","2BP01":"dependent_objects_still_exist","2D000":"invalid_transaction_termination","2F000":"sql_routine_exception","2F005":"function_executed_no_return_statement","2F002":"modifying_sql_data_not_permitted","2F003":"prohibited_sql_statement_attempted","2F004":"reading_sql_data_not_permitted","39P01":"trigger_protocol_violated","39P02":"srf_protocol_violated","39P03":"event_trigger_protocol_violated","3B000":"savepoint_exception","3B001":"invalid_savepoint_specification","3D000":"invalid_catalog_name","3F000":"invalid_schema_name","40P01":"deadlock_detected","42P20":"windowing_error","42P19":"invalid_recursion","42P18":"indeterminate_datatype","42P21":"collation_mismatch","42P22":"indeterminate_collation","428C9":"generated_always","42P01":"undefined_table","42P02":"undefined_parameter","42P03":"duplicate_cursor","42P04":"duplicate_database","42P05":"duplicate_prepared_statement","42P06":"duplicate_schema","42P07":"duplicate_table","42P08":"ambiguous_parameter","42P09":"ambiguous_alias","42P10":"invalid_column_reference","42P11":"invalid_cursor_definition","42P12":"invalid_database_definition","42P13":"invalid_function_definition","42P14":"invalid_prepared_statement_definition","42P15":"invalid_schema_definition","42P16":"invalid_table_definition","42P17":"invalid_object_definition","55P02":"cant_change_runtime_param","55P03":"lock_not_available","55P04":"unsafe_new_enum_value_usage","57P01":"admin_shutdown","57P02":"crash_shutdown","57P03":"cannot_connect_now","57P04":"database_dropped","58P01":"undefined_file","58P02":"duplicate_file","F0000":"config_file_error","F0001":"lock_file_exists","HV000":"fdw_error","HV005":"fdw_column_name_not_found","HV002":"fdw_dynamic_parameter_value_needed","HV010":"fdw_function_sequence_error","HV021":"fdw_inconsistent_descriptor_information","HV024":"fdw_invalid_attribute_value","HV007":"fdw_invalid_column_name","HV008":"fdw_invalid_column_number","HV004":"fdw_invalid_data_type","HV006":"fdw_invalid_data_type_descriptors","HV091":"fdw_invalid_descriptor_field_identifier","HV00B":"fdw_invalid_handle","HV00C":"fdw_invalid_option_index","HV00D":"fdw_invalid_option_name","HV090":"fdw_invalid_string_length_or_buffer_length","HV00A":"fdw_invalid_string_format","HV009":"fdw_invalid_use_of_null_pointer","HV014":"fdw_too_many_handles","HV001":"fdw_out_of_memory","HV00P":"fdw_no_schemas","HV00J":"fdw_option_name_not_found","HV00K":"fdw_reply_handle","HV00Q":"fdw_schema_not_found","HV00R":"fdw_table_not_found","HV00L":"fdw_unable_to_create_execution","HV00M":"fdw_unable_to_create_reply","HV00N":"fdw_unable_to_establish_connection","P0000":"plpgsql_error","P0001":"raise_exception","P0002":"no_data_found","P0003":"too_many_rows","P0004":"assert_failure","XX000":"internal_error","XX001":"data_corrupted","XX002":"index_corrupted"}

      return c2[code] || errs[code] || code;

      /*
        https://www.postgresql.org/docs/13/errcodes-appendix.html
        JSON.stringify([...THE_table_$0.rows].map(t => [...t.children].map(u => u.innerText)).filter((d, i) => i && d.length > 1).reduce((a, v)=>({ ...a, [v[0]]: v[1] }), {}))
      */
}
async function getInferredJoins(db: DB, schema: string = "public"): Promise<Join[]>{
    let joins: Join[] = [];
    let res = await db.any(`SELECT
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
        
    res.map((d: any) => {
        let eIdx = joins.findIndex(j => j.tables.includes(d.table_name) && j.tables.includes(d.foreign_table_name));
        let existing = joins[eIdx];
        if(existing){
            if(existing.tables[0] === d.table_name){
                existing.on = { ...existing.on,  [d.column_name]:  d.foreign_column_name }
            } else {
                existing.on = { ...existing.on,  [d.foreign_column_name]:  d.column_name }
            }
            joins[eIdx] = existing;
        } else {
            joins.push({
                tables: [d.table_name, d.foreign_table_name],
                on: {
                    [d.column_name]:  d.foreign_column_name 
                },
                type: "many-many"
            })
        }
    });
    // console.log(joins);
    return joins;
}
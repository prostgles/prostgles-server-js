"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.canEXECUTE = exports.prepareSort = exports.postgresToTsType = exports.isPlainObject = exports.DboBuilder = exports.parseError = exports.makeErrorFromPGError = exports.escapeTSNames = exports.pgp = void 0;
const Bluebird = require("bluebird");
const pgPromise = require("pg-promise");
const runSQL_1 = require("./DboBuilder/runSQL");
const prostgles_types_1 = require("prostgles-types");
// export const getFilterFields = (f: Filter | any, $and_key: string, $or_key: string, prevFields: string[] = []): string[] => {
//     if(Array.isArray(f)){
//         return f.flatMap(_f => getFilterFields(_f, $and_key, $or_key, prevFields) );
//     }
//     if($and_key in f && Array.isArray(f[$and_key]) ){
//         return f[$and_key].flatMap((_f: any) => getFilterFields(_f, $and_key, $or_key, prevFields) );
//     } else if($or_key in f && Array.isArray(f[$or_key]) ){
//         return f[$or_key].flatMap((_f: any) => getFilterFields(_f, $and_key, $or_key, prevFields) );
//     } else if(isObject(f)){
//         const filter: 
//     }
//     return []
// }
const utils_1 = require("./utils");
const PubSubManager_1 = require("./PubSubManager/PubSubManager");
const ViewHandler_1 = require("./DboBuilder/ViewHandler");
exports.pgp = pgPromise({
    promiseLib: Bluebird
    // ,query: function (e) { console.log({psql: e.query, params: e.params}); }
});
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
function canBeUsedAsIsInTypescript(str) {
    if (!str)
        return false;
    const isAlphaNumericOrUnderline = str.match(/^[a-z0-9_]+$/i);
    const startsWithCharOrUnderscore = str[0].match(/^[a-z_]+$/i);
    return Boolean(isAlphaNumericOrUnderline && startsWithCharOrUnderscore);
}
function escapeTSNames(str, capitalize = false) {
    let res = str;
    res = (capitalize ? str[0].toUpperCase() : str[0]) + str.slice(1);
    if (canBeUsedAsIsInTypescript(res))
        return res;
    return JSON.stringify(res);
}
exports.escapeTSNames = escapeTSNames;
const shortestPath_1 = require("./shortestPath");
/* DEBUG CLIENT ERRORS HERE */
function makeErrorFromPGError(err, localParams, view, allowedKeys) {
    // console.trace(err)
    if (process.env.TEST_TYPE || process.env.PRGL_DEBUG) {
        console.trace(err);
    }
    const errObject = {
        ...((!localParams || !localParams.socket) ? err : {}),
        ...(0, PubSubManager_1.pickKeys)(err, ["column", "code", "table", "constraint"]),
        ...(err && err.toString ? { txt: err.toString() } : {}),
        code_info: sqlErrCodeToMsg(err.code)
    };
    if (view?.dboBuilder?.constraints && errObject.constraint && !errObject.column) {
        const constraint = view.dboBuilder.constraints
            .find(c => c.conname === errObject.constraint && c.relname === view.name);
        if (constraint) {
            const cols = view.columns.filter(c => (!allowedKeys || allowedKeys.includes(c.name)) &&
                constraint.conkey.includes(c.ordinal_position));
            if (cols.length) {
                errObject.column = cols[0].name;
                errObject.columns = cols.map(c => c.name);
            }
        }
    }
    return Promise.reject(errObject);
}
exports.makeErrorFromPGError = makeErrorFromPGError;
/**
 * Ensure the error is an Object and has
 */
function parseError(e, caller) {
    const errorObject = (0, prostgles_types_1.isObject)(e) ? e : undefined;
    const message = typeof e === "string" ? e : e instanceof Error ? e.message :
        (0, prostgles_types_1.isObject)(errorObject) ? (errorObject.message ?? errorObject.txt ?? JSON.stringify(errorObject) ?? "") : "";
    const stack = [
        ...(errorObject && Array.isArray(errorObject.stack) ? errorObject.stack : []),
        caller
    ];
    const result = {
        ...errorObject,
        message,
        stack,
    };
    return result;
}
exports.parseError = parseError;
const Prostgles_1 = require("./Prostgles");
const DBSchemaBuilder_1 = require("./DBSchemaBuilder");
const TableHandler_1 = require("./DboBuilder/TableHandler");
class DboBuilder {
    constructor(prostgles) {
        this.schema = "public";
        this.getPubSubManager = async () => {
            if (!this._pubSubManager) {
                let onSchemaChange;
                const { yes, canExecute, isSuperUs } = await PubSubManager_1.PubSubManager.canCreate(this.db);
                if (!exports.canEXECUTE)
                    throw "PubSubManager based subscriptions not possible: Cannot run EXECUTE statements on this connection";
                if (this.prostgles.opts.watchSchema && this.prostgles.opts.watchSchemaType === "DDL_trigger") {
                    if (!isSuperUs) {
                        console.warn(`watchSchemaType "${this.prostgles.opts.watchSchemaType}" cannot be used because db user is not a superuser. Will fallback to watchSchemaType "prostgles_queries" `);
                    }
                    else {
                        onSchemaChange = (event) => {
                            this.prostgles.onSchemaChange(event);
                        };
                    }
                }
                this._pubSubManager = await PubSubManager_1.PubSubManager.create({
                    dboBuilder: this,
                    onSchemaChange
                });
            }
            if (!this._pubSubManager) {
                console.trace("Could not create this._pubSubManager");
                throw "Could not create this._pubSubManager";
            }
            return this._pubSubManager;
        };
        this.joinPaths = [];
        this.init = async () => {
            /* If watchSchema then PubSubManager must be created (if possible) */
            await this.build();
            if (this.prostgles.opts.watchSchema &&
                (this.prostgles.opts.watchSchemaType === "DDL_trigger" || !this.prostgles.opts.watchSchemaType) &&
                this.prostgles.isSuperUser) {
                await this.getPubSubManager();
            }
            return this;
        };
        this.runSQL = async (query, params, options, localParams) => {
            return runSQL_1.runSQL.bind(this)(query, params, options, localParams);
        };
        this.getTX = (cb) => {
            return this.db.tx((t) => {
                let dbTX = {};
                this.tablesOrViews?.map(tov => {
                    dbTX[tov.name] = new (tov.is_view ? ViewHandler_1.ViewHandler : TableHandler_1.TableHandler)(this.db, tov, this, t, dbTX, this.joinPaths);
                });
                if (!dbTX.sql) {
                    dbTX.sql = this.runSQL;
                }
                (0, prostgles_types_1.getKeys)(dbTX).map(k => {
                    dbTX[k].dbTX = dbTX;
                });
                dbTX.sql = (q, args, opts, localP) => this.runSQL(q, args, opts, { tx: { dbTX, t }, ...(localP ?? {}) });
                return cb(dbTX, t);
            });
        };
        this.prostgles = prostgles;
        if (!this.prostgles.db)
            throw "db missing";
        this.db = this.prostgles.db;
        this.schema = this.prostgles.opts.schema || "public";
        this.dbo = {};
    }
    destroy() {
        this._pubSubManager?.destroy();
    }
    get joins() {
        return (0, utils_1.clone)(this._joins ?? []).filter(j => j.tables[0] !== j.tables[1]);
        ;
    }
    set joins(j) {
        this._joins = (0, utils_1.clone)(j);
    }
    getJoinPaths() {
        return this.joinPaths;
    }
    async parseJoins() {
        if (this.prostgles.opts.joins) {
            let _joins = await this.prostgles.opts.joins;
            if (!this.tablesOrViews)
                throw new Error("Could not create join config. this.tablesOrViews missing");
            let inferredJoins = await getInferredJoins2(this.tablesOrViews);
            if (_joins === "inferred") {
                _joins = inferredJoins;
                /* If joins are specified then include inferred joins except the explicit tables */
            }
            else if (Array.isArray(_joins)) {
                const joinTables = _joins.map(j => j.tables).flat();
                _joins = _joins.concat(inferredJoins.filter(j => !j.tables.find(t => joinTables.includes(t))));
            }
            else if (_joins) {
                throw new Error("Unexpected joins init param. Expecting 'inferred' OR joinConfig but got: " + JSON.stringify(_joins));
            }
            let joins = JSON.parse(JSON.stringify(_joins));
            this.joins = joins;
            // Validate joins
            try {
                const tovNames = this.tablesOrViews.map(t => t.name);
                // 2 find incorrect tables
                const missing = joins.flatMap(j => j.tables).find(t => !tovNames.includes(t));
                if (missing) {
                    throw "Table not found: " + missing;
                }
                // 3 find incorrect fields
                joins.map(({ tables, on }) => {
                    const t1 = tables[0], t2 = tables[1];
                    on.map(cond => {
                        const f1s = Object.keys(cond), f2s = Object.values(cond);
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
            this.joins.forEach(({ tables }) => {
                var _b, _c;
                let _t = tables.slice().sort(), t1 = _t[0], t2 = _t[1];
                if (t1 === t2)
                    return;
                (_b = this.joinGraph)[t1] ?? (_b[t1] = {});
                this.joinGraph[t1][t2] = 1;
                (_c = this.joinGraph)[t2] ?? (_c[t2] = {});
                this.joinGraph[t2][t1] = 1;
            });
            const tables = Array.from(new Set(this.joins.flatMap(t => t.tables)));
            this.joinPaths = [];
            tables.forEach((t1, i1) => {
                tables.forEach((t2, i2) => {
                    /** Prevent recursion */
                    if (t1 === t2 ||
                        this.joinPaths.some(jp => {
                            if (arrayValuesMatch([jp.t1, jp.t2], [t1, t2])) {
                                const spath = (0, shortestPath_1.findShortestPath)(this.joinGraph, t1, t2);
                                if (spath && arrayValuesMatch(spath.path, jp.path)) {
                                    return true;
                                }
                            }
                        })) {
                        return;
                    }
                    const spath = (0, shortestPath_1.findShortestPath)(this.joinGraph, t1, t2);
                    if (!(spath && spath.distance < Infinity))
                        return;
                    const existing1 = this.joinPaths.find(j => j.t1 === t1 && j.t2 === t2);
                    if (!existing1) {
                        this.joinPaths.push({ t1, t2, path: spath.path.slice() });
                    }
                    const existing2 = this.joinPaths.find(j => j.t2 === t1 && j.t1 === t2);
                    if (!existing2) {
                        this.joinPaths.push({ t1: t2, t2: t1, path: spath.path.slice().reverse() });
                    }
                });
            });
        }
        return this.joinPaths;
    }
    async build() {
        this.tablesOrViews = await getTablesForSchemaPostgresSQL(this);
        this.constraints = await getConstraints(this.db);
        await this.parseJoins();
        this.dbo = {};
        this.tablesOrViews.map(tov => {
            const columnsForTypes = tov.columns.slice(0).sort((a, b) => a.name.localeCompare(b.name));
            const filterKeywords = Object.values(this.prostgles.keywords);
            const $filterCol = columnsForTypes.find(c => filterKeywords.includes(c.name));
            if ($filterCol) {
                throw `DboBuilder init error: \n\nTable ${JSON.stringify(tov.name)} column ${JSON.stringify($filterCol.name)} is colliding with Prostgles filtering functionality ($filter keyword)
                Please provide a replacement keyword name using the $filter_keyName init option. 
                Alternatively you can rename the table column\n`;
            }
            this.dbo[tov.name] = new (tov.is_view ? ViewHandler_1.ViewHandler : TableHandler_1.TableHandler)(this.db, tov, this, undefined, undefined, this.joinPaths);
            if (this.joinPaths && this.joinPaths.find(jp => [jp.t1, jp.t2].includes(tov.name))) {
                let table = tov.name;
                const makeJoin = (isLeft = true, filter, select, options) => {
                    return {
                        [isLeft ? "$leftJoin" : "$innerJoin"]: table,
                        filter,
                        select,
                        ...options
                    };
                };
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
                    return makeJoin(true, filter, select, { ...options, limit: 1 });
                };
                this.dbo.innerJoinOne[table] = (filter, select, options = {}) => {
                    return makeJoin(false, filter, select, { ...options, limit: 1 });
                };
            }
        });
        if (this.prostgles.opts.transactions) {
            let txKey = "tx";
            if (typeof this.prostgles.opts.transactions === "string")
                txKey = this.prostgles.opts.transactions;
            this.dbo[txKey] = (cb) => this.getTX(cb);
        }
        if (!this.dbo.sql) {
            this.dbo.sql = this.runSQL;
        }
        else {
            console.warn(`Could not create dbo.sql handler because there is already a table named "sql"`);
        }
        this.tsTypesDefinition = [
            `/* SCHEMA DEFINITON. Table names have been altered to work with Typescript */`,
            `/* DBO Definition */`,
            (0, DBSchemaBuilder_1.getDBSchema)(this)
        ].join("\n");
        return this.dbo;
    }
}
exports.DboBuilder = DboBuilder;
_a = DboBuilder;
DboBuilder.create = async (prostgles) => {
    let res = new DboBuilder(prostgles);
    return await res.init();
};
async function getConstraints(db, schema = "public") {
    return db.any(`
        SELECT rel.relname, con.conkey, con.conname, con.contype
        FROM pg_catalog.pg_constraint con
            INNER JOIN pg_catalog.pg_class rel
                ON rel.oid = con.conrelid
            INNER JOIN pg_catalog.pg_namespace nsp
                ON nsp.oid = connamespace
        WHERE nsp.nspname = ${(0, PubSubManager_1.asValue)(schema)}
    `);
}
async function getTablesForSchemaPostgresSQL({ db, runSQL }, schema = "public") {
    const query = `
    SELECT 
      jsonb_build_object(
        'insert', EXISTS (
            SELECT 1 
            FROM information_schema.role_table_grants rg
            WHERE rg.table_name = t.table_name
            AND rg.privilege_type = 'INSERT'
        ),
        'select', EXISTS (
            SELECT 1 
            FROM information_schema.role_table_grants rg
            WHERE rg.table_name = t.table_name
            AND rg.privilege_type = 'SELECT'
        ),
        'update', EXISTS (
            SELECT 1 
            FROM information_schema.role_table_grants rg
            WHERE rg.table_name = t.table_name
            AND rg.privilege_type = 'UPDATE'
        ),
        'delete', EXISTS (
            SELECT 1 
            FROM information_schema.role_table_grants rg
            WHERE rg.table_name = t.table_name
            AND rg.privilege_type = 'DELETE'
        )
      ) as privileges
      , t.table_schema as schema, t.table_name as name 
      , cc.columns 
      , cc.table_oid as oid
      , t.is_view 
      , t.view_definition 
      , array_to_json(vr.table_names) as parent_tables
      , obj_description(cc.table_oid::regclass) as comment
    FROM ( 
      SELECT table_name,
        table_schema,
        is_view,
        CASE WHEN is_view THEN pg_get_viewdef(format('%I.%I', table_schema, table_name)::REGCLASS, true) END as view_definition 
      FROM (
        SELECT table_name, table_schema, table_type = 'VIEW' as is_view
        FROM information_schema.tables 
/* TODO - add support for materialized views
        UNION ALL 
        SELECT table_name, table_schema
        FROM (
          SELECT relname as table_name, nspname as table_schema, true as is_view
          FROM pg_catalog.pg_class AS _c
          JOIN pg_catalog.pg_namespace AS _ns
            ON _c.relnamespace = _ns.oid 
          WHERE relkind IN ( 'm' )
        ) materialized_views
*/
      ) tables_matviews
      WHERE table_schema = ${(0, PubSubManager_1.asValue)(schema)}
    ) t  
    INNER  join (
        SELECT ccc.table_oid, table_schema, table_name
        , jsonb_agg((SELECT x FROM (
            SELECT ccc.column_name as name, 
            ccc.data_type, 
            ccc.udt_name, 
            ccc.element_type,
            ccc.element_udt_name,
            ccc.is_pkey, 
            ccc.comment, 
            ccc.ordinal_position, 
            ccc.is_nullable = 'YES' as is_nullable,
            ccc.references,
            ccc.has_default,
            ccc.column_default,
            ccc.privileges
        ) as x) ORDER BY ccc.ordinal_position ) as columns 
        FROM (
            SELECT  c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name
            , e.data_type as element_type
            , e.udt_name as element_udt_name
            ,  col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) as comment
            --, CASE WHEN fc.ftable IS NOT NULL THEN row_to_json((SELECT t FROM (SELECT fc.ftable, fc.fcols, fc.cols) t)) END as references
            , fc.references
            , c.is_identity = 'YES' OR EXISTS ( 
                SELECT 1    
                FROM information_schema.table_constraints as tc 
                JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema  
                WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type IN ('PRIMARY KEY') 
            ) as is_pkey
            , c.ordinal_position
            , COALESCE(c.column_default IS NOT NULL OR c.identity_generation = 'ALWAYS', false) as has_default
            , c.column_default
            , format('%I.%I', c.table_schema, c.table_name)::regclass::oid AS table_oid
            , c.is_nullable
            , cp.privileges
            FROM information_schema.columns c    
            LEFT JOIN (SELECT * FROM information_schema.element_types )   e  
                ON ((c.table_catalog, c.table_schema, c.table_name, 'TABLE', c.dtd_identifier)  
                = (e.object_catalog, e.object_schema, e.object_name, e.object_type, e.collection_type_identifier)
            )
            LEFT JOIN (
                SELECT table_schema, table_name, column_name, json_agg(row_to_json((SELECT t FROM (SELECT cpp.privilege_type, cpp.is_grantable ) t))) as privileges
                FROM information_schema.column_privileges cpp
                GROUP BY table_schema, table_name, column_name
            ) cp
                ON c.table_name = cp.table_name AND c.column_name = cp.column_name
            LEFT JOIN (
                --SELECT *
                SELECT "table", ft.cols, jsonb_agg(row_to_json((SELECT t FROM (SELECT ftable, fcols, cols) t))) as references
                FROM (
                    select 
                        (select r.relname from pg_class r where r.oid = c.conrelid) as table, 
                        (select array_agg(attname::text) from pg_attribute 
                        where attrelid = c.conrelid and ARRAY[attnum] <@ c.conkey) as cols, 
                        (select array_agg(attname::text) from pg_attribute 
                        where attrelid = c.confrelid and ARRAY[attnum] <@ c.confkey) as fcols, 
                        (select r.relname from pg_class r where r.oid = c.confrelid) as ftable
                    from pg_constraint c 
                ) ft
                WHERE ft.table IS NOT NULL 
                AND ft.ftable IS NOT NULL 
                    --  c.confrelid = 'users'::regclass::oid
                GROUP BY "table", cols
            ) fc 
            ON fc.table = c.table_name
            AND c.column_name::text = ANY(fc.cols)
        ) ccc
        GROUP BY table_oid, table_schema, table_name
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
    GROUP BY t.table_schema, t.table_name, t.is_view, t.view_definition, vr.table_names , cc.table_oid, cc.columns
    ORDER BY schema, name

    `;
    // console.log(pgp.as.format(query, { schema }), schema);
    let result = await db.any(query, { schema });
    result = await Promise.all(result
        .map(async (tbl) => {
        /** Get view reference cols (based on parent table) */
        let viewFCols = [];
        if (tbl.is_view) {
            try {
                const view_definition = tbl.view_definition?.endsWith(";") ? tbl.view_definition.slice(0, -1) : tbl.view_definition;
                const { fields } = await runSQL(`SELECT * FROM \n ( ${view_definition} \n) t LIMIT 0`, {}, {}, undefined);
                const ftables = result.filter(r => fields.some(f => f.tableID === r.oid));
                ftables.forEach(ft => {
                    const fFields = fields.filter(f => f.tableID === ft.oid);
                    const pkeys = ft.columns.filter(c => c.is_pkey);
                    const fFieldPK = fFields.filter(ff => pkeys.some(p => p.name === ff.columnName));
                    const refCols = pkeys.length && fFieldPK.length === pkeys.length ? fFieldPK : fFields.filter(ff => !["json", "jsonb", "xml"].includes(ff.udt_name));
                    const _fcols = refCols.map(ff => {
                        const d = {
                            name: ff.columnName,
                            references: [{
                                    ftable: ft.name,
                                    fcols: [ff.columnName],
                                    cols: [ff.name]
                                }]
                        };
                        return d;
                    });
                    viewFCols = [
                        ...viewFCols,
                        ..._fcols
                    ];
                });
            }
            catch (err) {
                console.error(err);
            }
        }
        tbl.columns = tbl.columns.map(col => {
            if (col.has_default) {
                /** Hide pkey default value */
                col.column_default = (col.udt_name !== "uuid" && !col.is_pkey && !col.column_default.startsWith("nextval(")) ? col.column_default : null;
            }
            const viewFCol = viewFCols?.find(fc => fc.name === col.name);
            if (viewFCol) {
                col.references = viewFCol.references;
            }
            return col;
        }); //.slice(0).sort((a, b) => a.name.localeCompare(b.name))
        // .sort((a, b) => a.ordinal_position - b.ordinal_position)
        return tbl;
    }));
    return result;
}
function isPlainObject(o) {
    return Object(o) === o && Object.getPrototypeOf(o) === Object.prototype;
}
exports.isPlainObject = isPlainObject;
function postgresToTsType(udt_data_type) {
    return (0, prostgles_types_1.getKeys)(prostgles_types_1.TS_PG_Types).find(k => {
        // @ts-ignore
        return prostgles_types_1.TS_PG_Types[k].includes(udt_data_type);
    }) ?? "any";
}
exports.postgresToTsType = postgresToTsType;
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
    //@ts-ignore
    return c2[code] || errs[code] || code;
    /*
      https://www.postgresql.org/docs/13/errcodes-appendix.html
      JSON.stringify([...THE_table_$0.rows].map(t => [...t.children].map(u => u.innerText)).filter((d, i) => i && d.length > 1).reduce((a, v)=>({ ...a, [v[0]]: v[1] }), {}))
    */
}
const arrayValuesMatch = (arr1, arr2) => {
    return arr1.slice().sort().join() === arr2.slice().sort().join();
};
async function getInferredJoins2(schema) {
    let joins = [];
    const upsertJoin = (t1, t2, cols, type) => {
        let existingIdx = joins.findIndex(j => arrayValuesMatch(j.tables.slice(0), [t1, t2]));
        let existing = joins[existingIdx];
        const normalCond = cols.reduce((a, v) => ({ ...a, [v.col1]: v.col2 }), {});
        const revertedCond = cols.reduce((a, v) => ({ ...a, [v.col2]: v.col1 }), {});
        if (existing) {
            const isLTR = existing.tables[0] === t1;
            const cond = isLTR ? normalCond : revertedCond;
            /** At some point we should add relationship type to EACH JOIN CONDITION GROUP */
            // const fixedType = isLTR? type : type.split("").reverse().join("") as Join["type"];
            /** Avoid duplicates */
            if (!existing.on.some(_cond => JSON.stringify(_cond) === JSON.stringify(cond))) {
                existing.on.push(cond);
                joins[existingIdx] = existing;
            }
        }
        else {
            joins.push({
                tables: [t1, t2],
                on: [normalCond],
                type
            });
        }
    };
    schema.map(tov => {
        tov.columns.map(col => {
            if (col.references) {
                col.references.forEach(r => {
                    const joinCols = r.cols.map((c, i) => ({ col1: c, col2: r.fcols[i] }));
                    let type = "one-many";
                    const ftablePkeys = schema.find(_tov => _tov.name === r.ftable)?.columns.filter(fcol => fcol.is_pkey);
                    if (ftablePkeys?.length && ftablePkeys.every(fkey => r.fcols.includes(fkey.name))) {
                        type = "one-one";
                    }
                    upsertJoin(tov.name, r.ftable, joinCols, type);
                });
            }
        });
    });
    return joins;
}
const prepareSort = (items, excludeOrder = false) => {
    if (!items.length)
        return "";
    return (excludeOrder ? "" : " ORDER BY ") + items.map(d => {
        const orderType = d.asc ? " ASC " : " DESC ";
        const nullOrder = d.nulls ? ` NULLS ${d.nulls === "first" ? " FIRST " : " LAST "}` : "";
        let colKey = "fieldQuery" in d ? d.fieldQuery : d.fieldPosition;
        return `${colKey} ${orderType} ${nullOrder}`;
    }).join(", ");
};
exports.prepareSort = prepareSort;
const canEXECUTE = async (db) => {
    try {
        await db.any(`DO $$ BEGIN  EXECUTE 'select 1'; END $$;`);
        return true;
    }
    catch (error) {
        console.warn(error);
    }
    return false;
};
exports.canEXECUTE = canEXECUTE;
//# sourceMappingURL=DboBuilder.js.map
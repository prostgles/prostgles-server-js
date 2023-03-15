"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONSTRAINT_TYPES = exports.parseI18N = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const validate_jsonb_schema_sql_1 = require("../JSONBValidation/validate_jsonb_schema_sql");
const getColumnDefinitionQuery_1 = require("./getColumnDefinitionQuery");
const getConstraintDefinitionQueries_1 = require("./getConstraintDefinitionQueries");
const parseI18N = (params) => {
    const { config, lang, defaultLang, defaultValue } = params;
    if (config) {
        if ((0, DboBuilder_1.isPlainObject)(config)) {
            //@ts-ignore
            return config[lang] ?? config[defaultLang];
        }
        else if (typeof config === "string") {
            return config;
        }
    }
    return defaultValue;
};
exports.parseI18N = parseI18N;
exports.CONSTRAINT_TYPES = ["PRIMARY KEY", "UNIQUE", "CHECK"]; // "FOREIGN KEY", 
/**
 * Will be run between initSQL and fileTable
 */
class TableConfigurator {
    config;
    get dbo() {
        if (!this.prostgles.dbo)
            throw "this.prostgles.dbo missing";
        return this.prostgles.dbo;
    }
    get db() {
        if (!this.prostgles.db)
            throw "this.prostgles.db missing";
        return this.prostgles.db;
    }
    // sidKeyName: string;
    prostgles;
    constructor(prostgles) {
        this.config = prostgles.opts.tableConfig;
        this.prostgles = prostgles;
    }
    getColumnConfig = (tableName, colName) => {
        const tconf = this.config?.[tableName];
        if (tconf && "columns" in tconf) {
            return tconf.columns?.[colName];
        }
        return undefined;
    };
    getTableInfo = (params) => {
        const tconf = this.config?.[params.tableName];
        return {
            label: (0, exports.parseI18N)({ config: tconf?.info?.label, lang: params.lang, defaultLang: "en", defaultValue: params.tableName })
        };
    };
    getColInfo = (params) => {
        const colConf = this.getColumnConfig(params.table, params.col);
        let result = undefined;
        if (colConf) {
            if ((0, prostgles_types_1.isObject)(colConf)) {
                const { jsonbSchema, jsonbSchemaType, info } = colConf;
                result = {
                    ...(result ?? {}),
                    ...info,
                    ...((jsonbSchema || jsonbSchemaType) && { jsonbSchema: { nullable: colConf.nullable, ...(jsonbSchema || { type: jsonbSchemaType }) } })
                };
                /**
                 * Get labels from TableConfig if specified
                 */
                if (colConf.label) {
                    const { lang } = params;
                    const lbl = colConf?.label;
                    if (["string", "object"].includes(typeof lbl)) {
                        if (typeof lbl === "string") {
                            result ??= {};
                            result.label = lbl;
                        }
                        else if (lang && (lbl?.[lang] || lbl?.en)) {
                            result ??= {};
                            result.label = (lbl?.[lang]) || lbl?.en;
                        }
                    }
                }
            }
        }
        return result;
    };
    checkColVal = (params) => {
        const conf = this.getColInfo(params);
        if (conf) {
            const { value } = params;
            const { min, max } = conf;
            if (min !== undefined && value !== undefined && value < min)
                throw `${params.col} must be less than ${min}`;
            if (max !== undefined && value !== undefined && value > max)
                throw `${params.col} must be greater than ${max}`;
        }
    };
    getJoinInfo = (sourceTable, targetTable) => {
        if (this.config &&
            sourceTable in this.config &&
            this.config[sourceTable] &&
            "columns" in this.config[sourceTable]) {
            const td = this.config[sourceTable];
            if ("columns" in td && td.columns?.[targetTable]) {
                const cd = td.columns[targetTable];
                if ((0, prostgles_types_1.isObject)(cd) && "joinDef" in cd) {
                    if (!cd.joinDef)
                        throw "cd.joinDef missing";
                    const { joinDef } = cd;
                    const res = {
                        expectOne: false,
                        paths: joinDef.map(({ sourceTable, targetTable: table, on }) => ({
                            source: sourceTable,
                            target: targetTable,
                            table,
                            on
                        })),
                    };
                    return res;
                }
            }
        }
        return undefined;
    };
    async init() {
        let queries = [];
        if (!this.config || !this.prostgles.pgp)
            throw "config or pgp missing";
        const MAX_IDENTIFIER_LENGTH = +(await this.db.one("SHOW max_identifier_length;")).max_identifier_length;
        if (!Number.isFinite(MAX_IDENTIFIER_LENGTH))
            throw `Could not obtain a valid max_identifier_length`;
        const asName = (v) => {
            if (v.length > MAX_IDENTIFIER_LENGTH - 1) {
                throw `The identifier name provided (${v}) is longer than the allowed limit (max_identifier_length - 1 = ${MAX_IDENTIFIER_LENGTH - 1} characters )\n Longest allowed: ${(0, prostgles_types_1.asName)(v.slice(0, MAX_IDENTIFIER_LENGTH - 1))} `;
            }
            return (0, prostgles_types_1.asName)(v);
        };
        let migrations;
        if (this.prostgles.opts.tableConfigMigrations) {
            const { onMigrate, version, versionTableName = "schema_version" } = this.prostgles.opts.tableConfigMigrations;
            await this.db.any(`CREATE TABLE IF NOT EXISTS ${asName(versionTableName)}(id NUMERIC PRIMARY KEY, table_config JSONB NOT NULL)`);
            migrations = { version, table: versionTableName };
            let existingVersion;
            try {
                existingVersion = (await this.db.oneOrNone(`SELECT MAX(id) as v FROM ${asName(versionTableName)}`)).v;
            }
            catch (e) {
            }
            if (!existingVersion || existingVersion < version) {
                await onMigrate({ db: this.db, oldVersion: existingVersion, getConstraints: (table, col, types) => (0, getColumnDefinitionQuery_1.getColConstraints)({ db: this.db, table, column: col, types }) });
            }
        }
        /* Create lookup tables */
        (0, prostgles_types_1.getKeys)(this.config).map(async (tableNameRaw) => {
            const tableName = asName(tableNameRaw);
            const tableConf = this.config[tableNameRaw];
            const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
            const isDropped = dropIfExists || dropIfExistsCascade;
            if (dropIfExistsCascade) {
                queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
            }
            else if (dropIfExists) {
                queries.push(`DROP TABLE IF EXISTS ${tableName} ;`);
            }
            if ("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable?.values).length) {
                const rows = Object.keys(tableConf.isLookupTable?.values).map(id => ({ id, ...(tableConf.isLookupTable?.values[id]) }));
                if (isDropped || !this.dbo?.[tableNameRaw]) {
                    const columnNames = Object.keys(rows[0]).filter(k => k !== "id");
                    queries.push(`CREATE TABLE IF NOT EXISTS ${tableName} (
              id  TEXT PRIMARY KEY
              ${columnNames.length ? (", " + columnNames.map(k => asName(k) + " TEXT ").join(", ")) : ""}
            );`);
                    rows.map(row => {
                        const values = this.prostgles.pgp.helpers.values(row);
                        queries.push(this.prostgles.pgp.as.format(`INSERT INTO ${tableName}  (${["id", ...columnNames].map(t => asName(t)).join(", ")})  ` + " VALUES ${values:raw} ;", { values }));
                    });
                    // this.log("Created lookup table " + tableName)
                }
            }
        });
        if (queries.length) {
            const q = queries.join("\n");
            if (this.prostgles.opts.DEBUG_MODE) {
                this.log("TableConfig: \n", q);
            }
            await this.db.multi(q);
            await this.prostgles.refreshDBO();
        }
        queries = [];
        /* Create/Alter columns */
        for await (const tableName of (0, prostgles_types_1.getKeys)(this.config)) {
            const tableConf = this.config[tableName];
            const constraintQueries = (0, getConstraintDefinitionQueries_1.getConstraintDefinitionQueries)({ tableName, tableConf: tableConf });
            if ("columns" in tableConf) {
                const colCreateLines = [];
                const tableHandler = this.dbo[tableName];
                if (tableConf.columns) {
                    const hasJSONBValidation = (0, prostgles_types_1.getKeys)(tableConf.columns).some(c => {
                        const cConf = tableConf.columns?.[c];
                        return cConf && (0, prostgles_types_1.isObject)(cConf) && (cConf.jsonbSchema || cConf.jsonbSchemaType);
                    });
                    /** Must install validation function */
                    if (hasJSONBValidation) {
                        try {
                            await this.db.any(validate_jsonb_schema_sql_1.validate_jsonb_schema_sql);
                        }
                        catch (err) {
                            console.error("Could not install the jsonb validation function due to error: ", err);
                            throw err;
                        }
                    }
                    const columns = (0, prostgles_types_1.getKeys)(tableConf.columns).filter(c => {
                        const colDef = tableConf.columns[c];
                        /** Exclude NamedJoinColumn  */
                        return typeof colDef === "string" || !("joinDef" in colDef);
                    });
                    const columnDefs = [];
                    for await (const colName of columns) {
                        const colConf = tableConf.columns[colName];
                        /* Add column to create statement */
                        const colDef = await (0, getColumnDefinitionQuery_1.getColumnDefinitionQuery)({ colConf, column: colName, db: this.db, table: tableName });
                        if (!colDef) {
                            // Column has only labels
                        }
                        else if (!tableHandler) {
                            columnDefs.push(colDef);
                            colCreateLines.push(colDef);
                            /** Alter existing column */
                        }
                        else if (tableHandler && !tableHandler.columns?.find(c => colName === c.name)) {
                            columnDefs.push(colDef);
                            queries.push(`
                ALTER TABLE ${asName(tableName)} 
                ADD COLUMN ${colDef};
              `);
                            if ((0, prostgles_types_1.isObject)(colConf) && "references" in colConf && colConf.references) {
                                const { tableName: lookupTable } = colConf.references;
                                this.log(`TableConfigurator: ${tableName}(${colName})` + " referenced lookup table " + lookupTable);
                            }
                            else {
                                this.log(`TableConfigurator: created/added column ${tableName}(${colName}) `);
                            }
                        }
                    }
                    /** Remove droped/altered constraints */
                    if (tableHandler && columnDefs.length) {
                        let newConstraints = [];
                        let newCols = [];
                        try {
                            await this.db.tx(async (t) => {
                                const { v } = await t.one("SELECT md5(random()::text) as v");
                                const randomTableName = `prostgles_constr_${v}`;
                                const columnDefsWithoutReferences = columnDefs.map(cdef => {
                                    return cdef.slice(0, cdef.toLowerCase().indexOf(" references "));
                                });
                                await t.any(`CREATE TABLE ${randomTableName} ( \n${columnDefsWithoutReferences.join(",\n")}\n );\n` +
                                    (constraintQueries ?? []).join("\n"));
                                newConstraints = await (0, getColumnDefinitionQuery_1.getColConstraints)({ db: t, table: randomTableName });
                                newCols = await (0, getColumnDefinitionQuery_1.getTableColumns)({ db: this.db, tableName });
                                return Promise.reject("Done");
                            });
                        }
                        catch (e) {
                        }
                        const ALTER_TABLE_Q = `ALTER TABLE ${asName(tableName)}`;
                        const currConstraints = await (0, getColumnDefinitionQuery_1.getColConstraints)({ db: this.db, table: tableName });
                        currConstraints.forEach(c => {
                            if (!newConstraints.some(nc => nc.type === c.type && nc.definition === c.definition && nc.cols.sort().join() === c.cols.sort().join())) {
                                queries.unshift(`${ALTER_TABLE_Q} DROP CONSTRAINT ${asName(c.name)} CASCADE;`);
                            }
                        });
                        const currCols = await (0, getColumnDefinitionQuery_1.getTableColumns)({ db: this.db, tableName });
                        currCols.forEach(c => {
                            const newCol = newCols.find(nc => nc.column_name === c.column_name);
                            if (!newCol) {
                                queries.push(`${ALTER_TABLE_Q} DROP COLUMN ${asName(c.column_name)} CASCADE;`);
                            }
                            else if (newCol.nullable !== c.nullable) {
                                queries.push(`${ALTER_TABLE_Q} ALTER COLUMN ${asName(c.column_name)} ${newCol.nullable ? "SET" : "DROP"} NOT NULL;`);
                            }
                            else if (newCol.udt_name !== c.udt_name) {
                                queries.push(`${ALTER_TABLE_Q} ALTER COLUMN ${asName(c.column_name)} TYPE ${newCol.udt_name};`);
                            }
                            else if (newCol.column_default !== c.column_default) {
                                queries.push(`${ALTER_TABLE_Q} ALTER COLUMN ${asName(c.column_name)} ${newCol.column_default === null ? "DROP DEFAULT" : `SET DEFAULT ${newCol.column_default}`};`);
                            }
                        });
                    }
                }
                if (colCreateLines.length) {
                    queries.push([
                        `CREATE TABLE ${asName(tableName)} (`,
                        colCreateLines.join(", \n"),
                        `);`
                    ].join("\n"));
                    this.log("TableConfigurator: Created table: \n" + queries.at(-1));
                }
            }
            queries.push(...constraintQueries ?? []);
            if ("indexes" in tableConf && tableConf.indexes) {
                /*
                    CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] [ [ IF NOT EXISTS ] name ] ON [ ONLY ] table_name [ USING method ]
                      ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass [ ( opclass_parameter = value [, ... ] ) ] ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
                      [ INCLUDE ( column_name [, ...] ) ]
                      [ NULLS [ NOT ] DISTINCT ]
                      [ WITH ( storage_parameter [= value] [, ... ] ) ]
                      [ TABLESPACE tablespace_name ]
                      [ WHERE predicate ]
                */
                (0, prostgles_types_1.getKeys)(tableConf.indexes).map(indexName => {
                    const { replace, unique, concurrently, using, columns, where = "" } = tableConf.indexes[indexName];
                    if (replace || typeof replace !== "boolean" && tableConf.replaceUniqueIndexes) {
                        queries.push(`DROP INDEX IF EXISTS ${asName(indexName)}  ;`);
                    }
                    queries.push([
                        "CREATE",
                        unique && "UNIQUE",
                        concurrently && "CONCURRENTLY",
                        `INDEX ${asName(indexName)} ON ${asName(tableName)}`,
                        using && ("USING " + using),
                        `(${columns})`,
                        where && `WHERE ${where}`
                    ].filter(v => v).join(" ") + ";");
                });
            }
            const { triggers, dropIfExists, dropIfExistsCascade } = tableConf;
            if (triggers) {
                const isDropped = dropIfExists || dropIfExistsCascade;
                const existingTriggers = await this.dbo.sql(`
            SELECT event_object_table
              ,trigger_name
            FROM  information_schema.triggers
            WHERE event_object_table = \${tableName}
            ORDER BY event_object_table
          `, { tableName }, { returnType: "rows" });
                // const existingTriggerFuncs = await this.dbo.sql!(`
                //   SELECT p.oid,proname,prosrc,u.usename
                //   FROM  pg_proc p  
                //   JOIN  pg_user u ON u.usesysid = p.proowner  
                //   WHERE prorettype = 2279;
                // `, {}, { returnType: "rows" }) as { proname: string }[];
                (0, prostgles_types_1.getKeys)(triggers).forEach(triggerFuncName => {
                    const trigger = triggers[triggerFuncName];
                    const funcNameParsed = asName(triggerFuncName);
                    queries.push(`
            CREATE OR REPLACE FUNCTION ${funcNameParsed}()
              RETURNS trigger
              LANGUAGE plpgsql
            AS
            $$

            ${trigger.query}
            
            $$;
          `);
                    trigger.actions.forEach(action => {
                        const triggerActionName = triggerFuncName + "_" + action;
                        const triggerActionNameParsed = asName(triggerActionName);
                        if (isDropped) {
                            queries.push(`DROP TRIGGER IF EXISTS ${triggerActionNameParsed} ON ${tableName};`);
                        }
                        if (isDropped || !existingTriggers.some(t => t.trigger_name === triggerActionName)) {
                            const newTableName = action !== "delete" ? "NEW TABLE AS new_table" : "";
                            const oldTableName = action !== "insert" ? "OLD TABLE AS old_table" : "";
                            queries.push(`
                CREATE TRIGGER ${triggerActionNameParsed}
                ${trigger.type} ${action} ON ${tableName}
                REFERENCING ${newTableName} ${oldTableName}
                FOR EACH ${trigger.forEach}
                EXECUTE PROCEDURE ${funcNameParsed}();
              `);
                        }
                    });
                });
            }
        }
        if (queries.length) {
            const q = queries.join("\n");
            this.log("TableConfig: \n", q);
            try {
                await this.db.multi(q);
                if (migrations) {
                    await this.db.any(`INSERT INTO ${migrations.table}(id, table_config) VALUES (${(0, PubSubManager_1.asValue)(migrations.version)}, ${(0, PubSubManager_1.asValue)(this.config)}) ON CONFLICT DO NOTHING;`);
                }
            }
            catch (err) {
                console.error("TableConfig error: ", err);
                if (err.position) {
                    const pos = +err.position;
                    if (Number.isInteger(pos)) {
                        return Promise.reject(err.toString() + "\n At:" + q.slice(pos - 50, pos + 50));
                    }
                }
                return Promise.reject(err);
            }
        }
    }
    log = (...args) => {
        if (this.prostgles.opts.DEBUG_MODE) {
            console.log("TableConfig: \n", ...args);
        }
    };
}
exports.default = TableConfigurator;
async function columnExists(args) {
    const { db, tableName, colName } = args;
    return Boolean((await db.oneOrNone(`
        SELECT column_name, table_name
        FROM information_schema.columns 
        WHERE table_name=${(0, PubSubManager_1.asValue)(tableName)} and column_name=${(0, PubSubManager_1.asValue)(colName)}
        LIMIT 1;
    `))?.column_name);
}
function getTableConstraings(db, tableName) {
    return db.any(`
    SELECT con.*, pg_get_constraintdef(con.oid)
    FROM pg_catalog.pg_constraint con
        INNER JOIN pg_catalog.pg_class rel
            ON rel.oid = con.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp
            ON nsp.oid = connamespace
    WHERE 1=1
    AND nsp.nspname = current_schema
    AND rel.relname = ` + "${tableName}", { tableName });
}

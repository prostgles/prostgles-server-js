"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONSTRAINT_TYPES = exports.parseI18N = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("../DboBuilder");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const getTableColumnQueries_1 = require("./getTableColumnQueries");
const getFutureTableSchema_1 = require("./getFutureTableSchema");
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
    constructor(prostgles) {
        this.getColumnConfig = (tableName, colName) => {
            const tconf = this.config?.[tableName];
            if (tconf && "columns" in tconf) {
                return tconf.columns?.[colName];
            }
            return undefined;
        };
        this.getTableInfo = (params) => {
            const tconf = this.config?.[params.tableName];
            return {
                label: (0, exports.parseI18N)({ config: tconf?.info?.label, lang: params.lang, defaultLang: "en", defaultValue: params.tableName })
            };
        };
        this.getColInfo = (params) => {
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
                                result ?? (result = {});
                                result.label = lbl;
                            }
                            else if (lang && (lbl?.[lang] || lbl?.en)) {
                                result ?? (result = {});
                                result.label = (lbl?.[lang]) || lbl?.en;
                            }
                        }
                    }
                }
            }
            return result;
        };
        this.checkColVal = (params) => {
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
        this.getJoinInfo = (sourceTable, targetTable) => {
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
        this.initialising = false;
        this.log = (...args) => {
            if (this.prostgles.opts.DEBUG_MODE) {
                console.log("TableConfig: \n", ...args);
            }
        };
        this.config = prostgles.opts.tableConfig;
        this.prostgles = prostgles;
    }
    async init() {
        if (this.initialising) {
            console.trace("TableConfig initialising clash");
            (0, PubSubManager_1.log)("TableConfig initialising clash");
            return;
        }
        this.initialising = true;
        let queries = [];
        const makeQuery = (q) => q.map(v => v.trim().endsWith(";") ? v : `${v};`).join("\n");
        const runQueries = async (_queries = queries) => {
            const q = makeQuery(queries);
            if (!_queries.length)
                return 0;
            this.log(q);
            (0, PubSubManager_1.log)(q);
            await this.db.multi(q).catch(err => {
                (0, PubSubManager_1.log)({ err, q });
                return Promise.reject(err);
            });
            _queries = [];
            queries = [];
            return 1;
        };
        if (!this.config || !this.prostgles.pgp) {
            throw "config or pgp missing";
        }
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
                await onMigrate({ db: this.db, oldVersion: existingVersion, getConstraints: (table, col, types) => (0, getConstraintDefinitionQueries_1.getColConstraints)({ db: this.db, table, column: col, types }) });
            }
        }
        /* Create lookup tables */
        (0, prostgles_types_1.getKeys)(this.config).forEach(tableNameRaw => {
            const tableName = asName(tableNameRaw);
            const tableConf = this.config[tableNameRaw];
            if ("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable?.values).length) {
                const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
                const isDropped = dropIfExists || dropIfExistsCascade;
                if (dropIfExistsCascade) {
                    queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
                }
                else if (dropIfExists) {
                    queries.push(`DROP TABLE IF EXISTS ${tableName};`);
                }
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
                }
            }
        });
        if (queries.length) {
            await runQueries(queries);
            await this.prostgles.refreshDBO();
        }
        /* Create/Alter columns */
        for await (const [tableName, tableConf] of Object.entries(this.config)) {
            const tableHandler = this.dbo[tableName];
            /** These have already been created */
            if ("isLookupTable" in tableConf) {
                continue;
            }
            const ALTER_TABLE_Q = `ALTER TABLE ${asName(tableName)}`;
            const coldef = await (0, getTableColumnQueries_1.getTableColumnQueries)({ db: this.db, tableConf: tableConf, tableHandler: tableHandler, tableName });
            if (coldef) {
                queries.push(coldef.fullQuery);
            }
            /** CONSTRAINTS */
            const constraintDefs = (0, getConstraintDefinitionQueries_1.getConstraintDefinitionQueries)({ tableName, tableConf: tableConf });
            if (coldef?.isCreate) {
                queries.push(...constraintDefs?.map(c => c.alterQuery) ?? []);
            }
            else if (coldef) {
                const fullSchema = await (0, getFutureTableSchema_1.getFutureTableSchema)({ db: this.db, tableName, columnDefs: coldef.columnDefs, constraintDefs });
                const futureCons = fullSchema.constraints.map(nc => ({
                    ...nc,
                    isNamed: constraintDefs?.some(c => c.name === nc.name)
                }));
                /** Run this first to ensure any dropped cols drop their constraints as well */
                await runQueries(queries);
                const currCons = await (0, getConstraintDefinitionQueries_1.getColConstraints)({ db: this.db, table: tableName });
                /** Drop removed/modified */
                currCons.forEach(c => {
                    if (!futureCons.some(nc => nc.definition === c.definition && (!nc.isNamed || nc.name === c.name))) {
                        queries.push(`${ALTER_TABLE_Q} DROP CONSTRAINT ${asName(c.name)};`);
                    }
                });
                /** Add missing named constraints */
                constraintDefs?.forEach(c => {
                    if (c.name && !currCons.some(cc => cc.name === c.name)) {
                        const fc = futureCons.find(nc => nc.name === c.name);
                        if (fc) {
                            queries.push(`${ALTER_TABLE_Q} ADD CONSTRAINT ${asName(c.name)} ${c.content};`);
                        }
                    }
                });
                /** Add remaining missing constraints */
                futureCons.filter(nc => !currCons.some(c => c.definition === nc.definition))
                    .forEach(c => {
                    queries.push(`${ALTER_TABLE_Q} ADD ${c.definition};`);
                });
            }
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
                        queries.push(`DROP INDEX IF EXISTS ${asName(indexName)};`);
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
                Object.entries(triggers).forEach(([triggerFuncName, trigger]) => {
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
            const q = makeQuery(queries);
            this.log("TableConfig >>>> ", q);
            try {
                await runQueries(queries);
                if (migrations) {
                    await this.db.any(`INSERT INTO ${migrations.table}(id, table_config) VALUES (${(0, PubSubManager_1.asValue)(migrations.version)}, ${(0, PubSubManager_1.asValue)(this.config)}) ON CONFLICT DO NOTHING;`);
                }
                this.initialising = false;
            }
            catch (err) {
                this.initialising = false;
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
}
exports.default = TableConfigurator;
//# sourceMappingURL=TableConfig.js.map
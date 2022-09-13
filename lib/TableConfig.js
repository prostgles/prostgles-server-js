"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseI18N = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("./DboBuilder");
const PubSubManager_1 = require("./PubSubManager");
const validation_1 = require("./validation");
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
/**
 * Will be run between initSQL and fileTable
 */
class TableConfigurator {
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
                if ("info" in colConf) {
                    result = {
                        ...(result ?? {}),
                        ...colConf?.info
                    };
                }
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
                    if ("joinDef" in cd) {
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
        this.config = prostgles.opts.tableConfig;
        this.prostgles = prostgles;
    }
    get dbo() {
        if (!this.prostgles.dbo)
            throw "this.prostgles.dbo missing";
        return this.prostgles.dbo;
    }
    ;
    get db() {
        if (!this.prostgles.db)
            throw "this.prostgles.db missing";
        return this.prostgles.db;
    }
    ;
    async init() {
        let queries = [];
        if (!this.config || !this.prostgles.pgp)
            throw "config or pgp missing";
        /* Create lookup tables */
        Object.keys(this.config).map(async (tableNameRaw) => {
            const tableName = (0, prostgles_types_1.asName)(tableNameRaw);
            const tableConf = this.config[tableNameRaw];
            const { dropIfExists = false, dropIfExistsCascade = false, triggers } = tableConf;
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
                    const keys = Object.keys(rows[0]).filter(k => k !== "id");
                    queries.push(`CREATE TABLE IF NOT EXISTS ${tableName} (
                        id  TEXT PRIMARY KEY
                        ${keys.length ? (", " + keys.map(k => (0, prostgles_types_1.asName)(k) + " TEXT ").join(", ")) : ""}
                    );`);
                    rows.map(row => {
                        const values = this.prostgles.pgp.helpers.values(row);
                        queries.push(this.prostgles.pgp.as.format(`INSERT INTO ${tableName}  (${["id", ...keys].map(t => (0, prostgles_types_1.asName)(t)).join(", ")})  ` + " VALUES ${values:raw} ;", { values }));
                    });
                    // console.log("Created lookup table " + tableName)
                }
            }
            if (triggers) {
                const existingTriggers = await this.dbo.sql(`
          SELECT event_object_table
            ,trigger_name
          FROM  information_schema.triggers
          WHERE event_object_table = ` + "${tableName}" + `
          ORDER BY event_object_table
        `, { tableName: tableNameRaw }, { returnType: "rows" });
                (0, prostgles_types_1.getKeys)(triggers).map(triggerName => {
                    const trigger = triggers[triggerName];
                    if (isDropped) {
                        queries.push(`DROP TRIGGER IF EXISTS ${(0, prostgles_types_1.asName)(triggerName)} ON ${tableName};`);
                    }
                    const funcNameParsed = (0, prostgles_types_1.asName)(triggerName);
                    if (isDropped || !existingTriggers.some(t => t.trigger_name === triggerName)) {
                        queries.push(`
              CREATE OR REPLACE FUNCTION ${funcNameParsed}()
                RETURNS trigger
                LANGUAGE plpgsql
              AS
              $$
              ${trigger.query}
              $$;
            `);
                    }
                    trigger.actions.forEach(action => {
                        const triggerActionName = triggerName + "_" + action;
                        const triggerActionNameParsed = (0, prostgles_types_1.asName)(triggerActionName);
                        if (dropIfExists || dropIfExistsCascade) {
                            queries.push(`DROP TRIGGER IF EXISTS ${triggerActionNameParsed} ON ${tableName};`);
                        }
                        queries.push(`
              CREATE TRIGGER ${triggerActionNameParsed}
              ${trigger.type} ${action} ON ${tableName}
              REFERENCING NEW TABLE AS new_table
              FOR EACH ${trigger.forEach}
              EXECUTE PROCEDURE ${funcNameParsed}();
            `);
                    });
                });
            }
        });
        if (queries.length) {
            const q = queries.join("\n");
            console.log("TableConfig: \n", q);
            await this.db.multi(q);
            await this.prostgles.refreshDBO();
        }
        queries = [];
        /* Create referenced columns */
        await Promise.all((0, prostgles_types_1.getKeys)(this.config).map(async (tableName) => {
            const tableConf = this.config[tableName];
            if ("columns" in tableConf) {
                const getColDef = (name, colConf) => {
                    const colNameEsc = (0, prostgles_types_1.asName)(name);
                    const getColTypeDef = (colConf, pgType) => {
                        const { nullable, defaultValue } = colConf;
                        return `${pgType} ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${(0, PubSubManager_1.asValue)(defaultValue)} ` : ""}`;
                    };
                    if ("references" in colConf && colConf.references) {
                        const { tableName: lookupTable, columnName: lookupCol = "id" } = colConf.references;
                        return ` ${colNameEsc} ${getColTypeDef(colConf.references, "TEXT")} REFERENCES ${lookupTable} (${lookupCol}) `;
                    }
                    else if ("sqlDefinition" in colConf && colConf.sqlDefinition) {
                        return ` ${colNameEsc} ${colConf.sqlDefinition} `;
                    }
                    else if ("isText" in colConf && colConf.isText) {
                        let checks = "", cArr = [];
                        if (colConf.lowerCased) {
                            cArr.push(`${colNameEsc} = LOWER(${colNameEsc})`);
                        }
                        if (colConf.trimmed) {
                            cArr.push(`${colNameEsc} = BTRIM(${colNameEsc})`);
                        }
                        if (cArr.length) {
                            checks = `CHECK (${cArr.join(" AND ")})`;
                        }
                        return ` ${colNameEsc} ${getColTypeDef(colConf, "TEXT")} ${checks}`;
                    }
                    else if ("jsonbSchema" in colConf && colConf.jsonbSchema) {
                        /** Validate default value against jsonbSchema  */
                        if (colConf.defaultValue) {
                            const checkStatement = (0, validation_1.getPGCheckConstraint)({ schema: colConf.jsonbSchema, escapedFieldName: (0, PubSubManager_1.asValue)(colConf.defaultValue) + "::JSONB", nullable: !!colConf.nullable }, 0);
                            const q = `SELECT ${checkStatement} as v`;
                            console.log(q);
                            this.dbo.sql(q, {}, { returnType: "row" }).then(row => {
                                if (!row?.v) {
                                    console.error(`Default value (${colConf.defaultValue}) for ${tableName}.${name} does not satisfy the jsonb constraint check: ${checkStatement}`);
                                }
                            });
                        }
                        const checkStatement = (0, validation_1.getPGCheckConstraint)({ schema: colConf.jsonbSchema, escapedFieldName: colNameEsc, nullable: !!colConf.nullable }, 0);
                        return ` ${colNameEsc} ${getColTypeDef(colConf, "JSONB")} CHECK(${checkStatement})`;
                    }
                    else if ("oneOf" in colConf) {
                        if (!colConf.oneOf?.length)
                            throw new Error("colConf.oneOf Must not be empty");
                        const type = colConf.oneOf.every(v => Number.isFinite(v)) ? "NUMERIC" : "TEXT";
                        const checks = colConf.oneOf.map(v => `${colNameEsc} = ${(0, PubSubManager_1.asValue)(v)}`).join(" OR ");
                        return ` ${colNameEsc} ${type} ${colConf.nullable ? "" : "NOT NULL"} ${"defaultValue" in colConf ? ` DEFAULT ${(0, PubSubManager_1.asValue)(colConf.defaultValue)}` : ""} CHECK(${checks})`;
                    }
                    else {
                        throw "Unknown column config: " + JSON.stringify(colConf);
                    }
                };
                const colCreateLines = [];
                const tableHandler = this.dbo[tableName];
                if (tableConf.columns) {
                    (0, prostgles_types_1.getKeys)(tableConf.columns).filter(c => !("joinDef" in tableConf.columns[c])).map(colName => {
                        const colConf = tableConf.columns[colName];
                        /* Add columns to create statement */
                        if (!tableHandler) {
                            colCreateLines.push(getColDef(colName, colConf));
                        }
                        else if (tableHandler && !tableHandler.columns?.find(c => colName === c.name)) {
                            queries.push(`
                ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} 
                ADD COLUMN ${getColDef(colName, colConf)};
              `);
                            if ("references" in colConf && colConf.references) {
                                const { tableName: lookupTable, } = colConf.references;
                                console.log(`TableConfigurator: ${tableName}(${colName})` + " referenced lookup table " + lookupTable);
                            }
                            else {
                                console.log(`TableConfigurator: created/added column ${tableName}(${colName}) `);
                            }
                        }
                    });
                }
                if (colCreateLines.length) {
                    queries.push([
                        `CREATE TABLE ${(0, prostgles_types_1.asName)(tableName)} (`,
                        colCreateLines.join(", \n"),
                        `);`
                    ].join("\n"));
                    console.log("TableConfigurator: Created table: \n" + queries.at(-1));
                }
            }
            if ("constraints" in tableConf && tableConf.constraints) {
                const constraints = await getTableConstraings(this.db, tableName);
                (0, prostgles_types_1.getKeys)(tableConf.constraints).map(constraintName => {
                    if (!constraints.some(c => c.conname === constraintName)) {
                        queries.push(`ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)} ADD CONSTRAINT ${(0, prostgles_types_1.asName)(constraintName)} ${tableConf.constraints[constraintName]} ;`);
                    }
                });
            }
            if ("indexes" in tableConf && tableConf.indexes) {
                (0, prostgles_types_1.getKeys)(tableConf.indexes).map(indexName => {
                    const { concurrently, unique, using, definition, replace } = tableConf.indexes[indexName];
                    if (replace || typeof replace !== "boolean" && tableConf.replaceUniqueIndexes) {
                        queries.push(`DROP INDEX IF EXISTS ${(0, prostgles_types_1.asName)(indexName)}  ;`);
                    }
                    queries.push(`CREATE ${unique ? "UNIQUE" : ""} ${!concurrently ? "" : "CONCURRENTLY"} INDEX ${(0, prostgles_types_1.asName)(indexName)} ON ${(0, prostgles_types_1.asName)(tableName)} ${!using ? "" : ("USING " + using)} (${definition}) ;`);
                });
            }
        }));
        if (queries.length) {
            const q = queries.join("\n");
            console.log("TableConfig: \n", q);
            await this.db.multi(q).catch(err => {
                if (err.position) {
                    const pos = +err.position;
                    if (Number.isInteger(pos)) {
                        return Promise.reject(err.toString() + "\n At:" + q.slice(pos - 50, pos + 50));
                    }
                }
                console.error("TableConfig error: ", err);
                return Promise.reject(err);
            });
        }
    }
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

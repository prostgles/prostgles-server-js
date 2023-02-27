"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseI18N = void 0;
const prostgles_types_1 = require("prostgles-types");
const DboBuilder_1 = require("./DboBuilder");
const PubSubManager_1 = require("./PubSubManager/PubSubManager");
const validation_1 = require("./JSONBValidation/validation");
const validate_jsonb_schema_sql_1 = require("./JSONBValidation/validate_jsonb_schema_sql");
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
                    result = {
                        ...(result ?? {}),
                        ...("info" in colConf && colConf?.info),
                        ...((colConf?.jsonbSchema || colConf?.jsonbSchemaType) && { jsonSchema: (0, validation_1.getJSONBSchemaAsJSONSchema)(params.table, params.col, colConf) })
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
        this.log = (...args) => {
            if (this.prostgles.opts.DEBUG_MODE) {
                console.log("TableConfig: \n", ...args);
            }
        };
        this.config = prostgles.opts.tableConfig;
        this.prostgles = prostgles;
    }
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
        /* Create columns */
        await Promise.all((0, prostgles_types_1.getKeys)(this.config).map(async (tableName) => {
            const tableConf = this.config[tableName];
            if ("columns" in tableConf) {
                const getColDef = (name, colConf) => {
                    const colNameEsc = asName(name);
                    const getColTypeDef = (colConf, pgType) => {
                        const { nullable, defaultValue } = colConf;
                        return `${pgType} ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${(0, PubSubManager_1.asValue)(defaultValue)} ` : ""}`;
                    };
                    const jsonbSchema = (0, prostgles_types_1.isObject)(colConf) ? (("jsonbSchema" in colConf && colConf.jsonbSchema) ? { jsonbSchema: colConf.jsonbSchema, jsonbSchemaType: undefined } :
                        ("jsonbSchemaType" in colConf && colConf.jsonbSchemaType) ? { jsonbSchema: undefined, jsonbSchemaType: colConf.jsonbSchemaType } :
                            undefined) :
                        undefined;
                    if ((0, prostgles_types_1.isObject)(colConf) && "references" in colConf && colConf.references) {
                        const { tableName: lookupTable, columnName: lookupCol = "id" } = colConf.references;
                        return ` ${colNameEsc} ${getColTypeDef(colConf.references, "TEXT")} REFERENCES ${lookupTable} (${lookupCol}) `;
                    }
                    else if (typeof colConf === "string" || "sqlDefinition" in colConf && colConf.sqlDefinition) {
                        return ` ${colNameEsc} ${typeof colConf === "string" ? colConf : colConf.sqlDefinition} `;
                    }
                    else if ((0, prostgles_types_1.isObject)(colConf) && "isText" in colConf && colConf.isText) {
                        let checks = "";
                        const cArr = [];
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
                    else if (jsonbSchema) {
                        const jsonbSchemaStr = (0, PubSubManager_1.asValue)({
                            ...(0, prostgles_types_1.pickKeys)(colConf, ["enum", "nullable", "info"]),
                            ...(jsonbSchema.jsonbSchemaType ? { type: jsonbSchema.jsonbSchemaType } : jsonbSchema.jsonbSchema)
                        }) + "::TEXT";
                        /** Validate default value against jsonbSchema  */
                        const q = `SELECT ${validate_jsonb_schema_sql_1.VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${(0, PubSubManager_1.asValue)(colConf.defaultValue) + "::JSONB"}, ARRAY[${(0, PubSubManager_1.asValue)(name)}]) as v`;
                        if (colConf.defaultValue) {
                            this.log(q);
                            this.dbo.sql(q, {}, { returnType: "row" }).then(row => {
                                if (!row?.v) {
                                    console.error(`Default value (${colConf.defaultValue}) for ${tableName}.${name} does not satisfy the jsonb constraint check: ${q}`);
                                }
                            });
                        }
                        return ` ${colNameEsc} ${getColTypeDef(colConf, "JSONB")} CHECK(${validate_jsonb_schema_sql_1.VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${colNameEsc}, ARRAY[${(0, PubSubManager_1.asValue)(name)}]))`;
                    }
                    else if ("enum" in colConf) {
                        if (!colConf.enum?.length)
                            throw new Error("colConf.enum Must not be empty");
                        const type = colConf.enum.every(v => Number.isFinite(v)) ? "NUMERIC" : "TEXT";
                        const checks = colConf.enum.map(v => `${colNameEsc} = ${(0, PubSubManager_1.asValue)(v)}`).join(" OR ");
                        return ` ${colNameEsc} ${type} ${colConf.nullable ? "" : "NOT NULL"} ${"defaultValue" in colConf ? ` DEFAULT ${(0, PubSubManager_1.asValue)(colConf.defaultValue)}` : ""} CHECK(${checks})`;
                    }
                    else {
                        throw "Unknown column config: " + JSON.stringify(colConf);
                    }
                };
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
                            const fileContent = `CREATE SCHEMA IF NOT EXISTS prostgles;\n ${validate_jsonb_schema_sql_1.validate_jsonb_schema_sql}`;
                            await this.db.any(fileContent);
                        }
                        catch (err) {
                            console.error("Could not install the jsonb validation function due to error: ", err);
                            throw err;
                        }
                    }
                    (0, prostgles_types_1.getKeys)(tableConf.columns).filter(c => {
                        const colDef = tableConf.columns[c];
                        return typeof colDef === "string" || !("joinDef" in colDef);
                    }).forEach(colName => {
                        const colConf = tableConf.columns[colName];
                        /* Add columns to create statement */
                        if (!tableHandler) {
                            colCreateLines.push(getColDef(colName, colConf));
                        }
                        else if (tableHandler && !tableHandler.columns?.find(c => colName === c.name)) {
                            queries.push(`
                ALTER TABLE ${asName(tableName)} 
                ADD COLUMN ${getColDef(colName, colConf)};
              `);
                            if ((0, prostgles_types_1.isObject)(colConf) && "references" in colConf && colConf.references) {
                                const { tableName: lookupTable, } = colConf.references;
                                this.log(`TableConfigurator: ${tableName}(${colName})` + " referenced lookup table " + lookupTable);
                            }
                            else {
                                this.log(`TableConfigurator: created/added column ${tableName}(${colName}) `);
                            }
                        }
                    });
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
            if ("constraints" in tableConf && tableConf.constraints) {
                const constraints = await getTableConstraings(this.db, tableName);
                const constraintNames = (0, prostgles_types_1.getKeys)(tableConf.constraints);
                constraintNames.map(constraintName => {
                    /** Drop constraints with the same name */
                    const existingConstraint = constraints.some(c => c.conname === constraintName);
                    if (existingConstraint) {
                        queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
                    }
                    queries.push(`ALTER TABLE ${asName(tableName)} ADD CONSTRAINT ${asName(constraintName)} ${tableConf.constraints[constraintName]} ;`);
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
            WHERE event_object_table = ` + "${tableName}" + `
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
        }));
        if (queries.length) {
            const q = queries.join("\n");
            this.log("TableConfig: \n", q);
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
//# sourceMappingURL=TableConfig.js.map
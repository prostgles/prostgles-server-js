"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTableColumns = exports.getColumnDefinitionQuery = void 0;
const prostgles_types_1 = require("prostgles-types");
const PubSubManager_1 = require("../PubSubManager/PubSubManager");
const validate_jsonb_schema_sql_1 = require("../JSONBValidation/validate_jsonb_schema_sql");
const getConstraintDefinitionQueries_1 = require("./getConstraintDefinitionQueries");
/**
 * Column create statement for a given config
 */
const getColumnDefinitionQuery = async ({ colConf: colConfRaw, column, db, table }) => {
    const colConf = typeof colConfRaw === "string" ? { sqlDefinition: colConfRaw } : colConfRaw;
    const colNameEsc = (0, prostgles_types_1.asName)(column);
    const getColTypeDef = (colConf, pgType) => {
        const { nullable, defaultValue } = colConf;
        return `${pgType} ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${(0, PubSubManager_1.asValue)(defaultValue)} ` : ""}`;
    };
    const jsonbSchema = ("jsonbSchema" in colConf && colConf.jsonbSchema) ? { jsonbSchema: colConf.jsonbSchema, jsonbSchemaType: undefined } :
        ("jsonbSchemaType" in colConf && colConf.jsonbSchemaType) ? { jsonbSchema: undefined, jsonbSchemaType: colConf.jsonbSchemaType } :
            undefined;
    if ("references" in colConf && colConf.references) {
        const { tableName: lookupTable, columnName: lookupCol = "id" } = colConf.references;
        return ` ${colNameEsc} ${getColTypeDef(colConf.references, "TEXT")} REFERENCES ${lookupTable} (${lookupCol}) `;
    }
    else if ("sqlDefinition" in colConf && colConf.sqlDefinition) {
        return ` ${colNameEsc} ${colConf.sqlDefinition} `;
    }
    else if ("isText" in colConf && colConf.isText) {
        let checks = "";
        const colChecks = [];
        if (colConf.lowerCased) {
            colChecks.push(`${colNameEsc} = LOWER(${colNameEsc})`);
        }
        if (colConf.trimmed) {
            colChecks.push(`${colNameEsc} = BTRIM(${colNameEsc})`);
        }
        if (colChecks.length) {
            checks = `CHECK (${colChecks.join(" AND ")})`;
        }
        return ` ${colNameEsc} ${getColTypeDef(colConf, "TEXT")} ${checks}`;
    }
    else if (jsonbSchema) {
        const jsonbSchemaStr = (0, PubSubManager_1.asValue)({
            ...(0, prostgles_types_1.pickKeys)(colConf, ["enum", "nullable", "info"]),
            ...(jsonbSchema.jsonbSchemaType ? { type: jsonbSchema.jsonbSchemaType } : jsonbSchema.jsonbSchema)
        }) + "::TEXT";
        /** Validate default value against jsonbSchema  */
        const q = `SELECT ${validate_jsonb_schema_sql_1.VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${(0, PubSubManager_1.asValue)(colConf.defaultValue) + "::JSONB"}, ${(0, PubSubManager_1.asValue)({ table, column })}) as v`;
        if (colConf.defaultValue) {
            const failedDefault = (err) => {
                return { msg: `Default value (${colConf.defaultValue}) for ${table}.${column} does not satisfy the jsonb constraint check: ${q}`, err };
            };
            try {
                const row = await db.oneOrNone(q);
                if (!row?.v) {
                    throw "Error";
                }
            }
            catch (e) {
                throw failedDefault(e);
            }
        }
        const namePreffix = 'prostgles_jsonb_';
        const { val: nameEnding } = await db.one("SELECT MD5( ${table} || ${column}  || ${schema}) as val", { table: table, column, schema: jsonbSchemaStr });
        const constraintName = namePreffix + nameEnding;
        const colConstraints = await (0, getConstraintDefinitionQueries_1.getColConstraints)({ db, table, column });
        const existingNonMatchingConstraints = colConstraints.filter(c => c.name.startsWith(namePreffix) && c.name !== constraintName);
        for await (const oldCons of existingNonMatchingConstraints) {
            await db.any(`ALTER TABLE ${(0, prostgles_types_1.asName)(table)} DROP CONSTRAINT ${(0, prostgles_types_1.asName)(oldCons.name)};`);
        }
        return ` ${colNameEsc} ${getColTypeDef(colConf, "JSONB")}, CONSTRAINT ${(0, prostgles_types_1.asName)(constraintName)} CHECK(${validate_jsonb_schema_sql_1.VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${colNameEsc}, ${(0, PubSubManager_1.asValue)({ table, column })} ))`;
    }
    else if ("enum" in colConf) {
        if (!colConf.enum?.length)
            throw new Error("colConf.enum Must not be empty");
        const type = colConf.enum.every(v => Number.isFinite(v)) ? "NUMERIC" : "TEXT";
        const checks = colConf.enum.map(v => `${colNameEsc} = ${(0, PubSubManager_1.asValue)(v)}`).join(" OR ");
        return ` ${colNameEsc} ${type} ${colConf.nullable ? "" : "NOT NULL"} ${"defaultValue" in colConf ? ` DEFAULT ${(0, PubSubManager_1.asValue)(colConf.defaultValue)}` : ""} CHECK(${checks})`;
    }
    else {
        return undefined;
        // throw "Unknown column config: " + JSON.stringify(colConf);
    }
};
exports.getColumnDefinitionQuery = getColumnDefinitionQuery;
const getTableColumns = ({ db, table }) => {
    return db.manyOrNone(`
    SELECT table_name, 
      table_schema, column_name, 
      column_default, udt_name,
      is_nullable = 'YES' as nullable
    FROM information_schema.columns
    WHERE table_name = $1
  `, [table]);
};
exports.getTableColumns = getTableColumns;
//# sourceMappingURL=getColumnDefinitionQuery.js.map
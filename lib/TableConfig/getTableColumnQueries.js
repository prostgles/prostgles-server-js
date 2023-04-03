"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTableColumnQueries = void 0;
const prostgles_types_1 = require("prostgles-types");
const validate_jsonb_schema_sql_1 = require("../JSONBValidation/validate_jsonb_schema_sql");
const getColumnDefinitionQuery_1 = require("./getColumnDefinitionQuery");
const getFutureTableSchema_1 = require("./getFutureTableSchema");
const getTableColumnQueries = async ({ db, tableConf, tableName, tableHandler }) => {
    let newColumnDefs = [];
    const droppedColNames = [];
    const alteredColQueries = [];
    let fullQuery = "";
    let isCreate = false;
    if ("columns" in tableConf && tableConf.columns) {
        const hasJSONBValidation = (0, prostgles_types_1.getKeys)(tableConf.columns).some(c => {
            const cConf = tableConf.columns?.[c];
            return cConf && (0, prostgles_types_1.isObject)(cConf) && (cConf.jsonbSchema || cConf.jsonbSchemaType);
        });
        /** Must install validation function */
        if (hasJSONBValidation) {
            try {
                await db.any(validate_jsonb_schema_sql_1.validate_jsonb_schema_sql);
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
        const colDefs = [];
        for (const colName of columns) {
            const colConf = tableConf.columns[colName];
            /* Get column definition */
            const colDef = await (0, getColumnDefinitionQuery_1.getColumnDefinitionQuery)({ colConf, column: colName, db, table: tableName });
            if (colDef) {
                colDefs.push({ name: colName, def: colDef });
            }
        }
        const columnDefs = colDefs.map(c => c.def);
        if (!colDefs.length) {
            return undefined;
        }
        const ALTERQ = `ALTER TABLE ${(0, prostgles_types_1.asName)(tableName)}`;
        if (!tableHandler) {
            newColumnDefs.push(...colDefs.map(c => c.def));
        }
        else if (tableHandler) {
            const currCols = await (0, getColumnDefinitionQuery_1.getTableColumns)({ db, table: tableName });
            /** Add new columns */
            newColumnDefs = colDefs.filter(nc => !tableHandler.columns?.some(c => nc.name === c.name)).map(c => c.def);
            /** Altered/Dropped columns */
            const { cols: futureCols } = await (0, getFutureTableSchema_1.getFutureTableSchema)({ tableName, columnDefs, constraintDefs: [], db });
            currCols.forEach(c => {
                const newCol = futureCols.find(nc => nc.column_name === c.column_name);
                if (!newCol) {
                    droppedColNames.push(c.column_name);
                }
                else if (newCol.nullable !== c.nullable) {
                    alteredColQueries.push(`${ALTERQ} ALTER COLUMN ${(0, prostgles_types_1.asName)(c.column_name)} ${newCol.nullable ? "SET" : "DROP"} NOT NULL;`);
                }
                else if (newCol.udt_name !== c.udt_name) {
                    alteredColQueries.push(`${ALTERQ} ALTER COLUMN ${(0, prostgles_types_1.asName)(c.column_name)} TYPE ${newCol.udt_name} USING ${(0, prostgles_types_1.asName)(c.column_name)}::${newCol.udt_name};`);
                }
                else if (newCol.column_default !== c.column_default) {
                    const colConfig = colDefs.find(cd => cd.name === c.column_name);
                    if (["serial", "bigserial"].some(t => colConfig?.def.toLowerCase().includes(` ${t}`)) && c.column_default?.toLowerCase().includes("nextval")) {
                        /** Ignore SERIAL/BIGSERIAL <> nextval mismatch */
                    }
                    else {
                        alteredColQueries.push(`${ALTERQ} ALTER COLUMN ${(0, prostgles_types_1.asName)(c.column_name)} ${newCol.column_default === null ? "DROP DEFAULT" : `SET DEFAULT ${newCol.column_default}`};`);
                    }
                }
            });
        }
        if (!tableHandler || tableConf.dropIfExists || tableConf.dropIfExistsCascade) {
            isCreate = true;
            const DROPQ = `DROP TABLE IF EXISTS ${(0, prostgles_types_1.asName)(tableName)}`;
            fullQuery = ([
                ...(tableConf.dropIfExists ? [`${DROPQ};`] : tableConf.dropIfExistsCascade ? [`${DROPQ} CASCADE;`] : []),
                `CREATE TABLE ${(0, prostgles_types_1.asName)(tableName)} (`,
                columnDefs.join(", \n"),
                `);`
            ].join("\n"));
        }
        else {
            fullQuery = [
                ...droppedColNames.map(c => `${ALTERQ} DROP COLUMN ${(0, prostgles_types_1.asName)(c)};`),
                ...newColumnDefs.map(c => `${ALTERQ} ADD COLUMN ${c};`),
                ...alteredColQueries,
            ].join("\n");
        }
        return {
            fullQuery,
            columnDefs,
            isCreate,
            newColumnDefs,
        };
    }
    else {
        return undefined;
    }
};
exports.getTableColumnQueries = getTableColumnQueries;

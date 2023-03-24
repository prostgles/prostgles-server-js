import { asName, pickKeys } from "prostgles-types"; 
import { DB } from "../Prostgles";
import { asValue } from "../PubSubManager/PubSubManager";
import { VALIDATE_SCHEMA_FUNCNAME } from "../JSONBValidation/validate_jsonb_schema_sql";
import { BaseColumnTypes, ColumnConfig } from "./TableConfig";
import pgPromise from "pg-promise"; 

type Args = {
  column: string; 
  colConf: ColumnConfig;
  db: DB; 
  table: string;
};

/**
 * Column create statement for a given config
 */
export const getColumnDefinitionQuery = async ({ colConf: colConfRaw, column, db, table }: Args): Promise<string | undefined> => {
  const colConf = typeof colConfRaw === "string"? { sqlDefinition: colConfRaw } : colConfRaw;
  const colNameEsc = asName(column);
  const getColTypeDef = (colConf: BaseColumnTypes, pgType: "TEXT" | "JSONB") => {
    const { nullable, defaultValue } = colConf;
    return `${pgType} ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${asValue(defaultValue)} ` : ""}`
  }

  const jsonbSchema =
      ("jsonbSchema" in colConf && colConf.jsonbSchema) ? { jsonbSchema: colConf.jsonbSchema, jsonbSchemaType: undefined } :
        ("jsonbSchemaType" in colConf && colConf.jsonbSchemaType) ? { jsonbSchema: undefined, jsonbSchemaType: colConf.jsonbSchemaType } :
          undefined; 
  

  if ("references" in colConf && colConf.references) {

    const { tableName: lookupTable, columnName: lookupCol = "id" } = colConf.references;
    return ` ${colNameEsc} ${getColTypeDef(colConf.references, "TEXT")} REFERENCES ${lookupTable} (${lookupCol}) `;

  } else if ("sqlDefinition" in colConf && colConf.sqlDefinition) {

    return ` ${colNameEsc} ${colConf.sqlDefinition} `;

  } else if ("isText" in colConf && colConf.isText) {
    let checks = "";
    const colChecks: string[] = [];
    if (colConf.lowerCased) {
      colChecks.push(`${colNameEsc} = LOWER(${colNameEsc})`)
    }
    if (colConf.trimmed) {
      colChecks.push(`${colNameEsc} = BTRIM(${colNameEsc})`)
    }
    if (colChecks.length) {
      checks = `CHECK (${colChecks.join(" AND ")})`
    }
    return ` ${colNameEsc} ${getColTypeDef(colConf, "TEXT")} ${checks}`;

  } else if (jsonbSchema) {

    const jsonbSchemaStr = asValue({
      ...pickKeys(colConf, ["enum", "nullable", "info"]),
      ...(jsonbSchema.jsonbSchemaType ? { type: jsonbSchema.jsonbSchemaType } : jsonbSchema.jsonbSchema)
    }) + "::TEXT";

    /** Validate default value against jsonbSchema  */
    const q = `SELECT ${VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${asValue(colConf.defaultValue) + "::JSONB"}, ${asValue({ table, column })}) as v`;
    if (colConf.defaultValue) {

      const failedDefault = (err?: any) => {
        return { msg: `Default value (${colConf.defaultValue}) for ${table}.${column} does not satisfy the jsonb constraint check: ${q}`, err };
      }
      try {
        const row = await db.oneOrNone(q);
        if (!row?.v) {
          throw "Error";
        }
      } catch (e) {
        throw failedDefault(e);
      }
    } 

    return ` ${colNameEsc} ${getColTypeDef(colConf, "JSONB")} CHECK(${VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${colNameEsc}, ${asValue({ table, column })} ))`;

  } else if ("enum" in colConf) {
    if (!colConf.enum?.length) throw new Error("colConf.enum Must not be empty");
    const type = colConf.enum.every(v => Number.isFinite(v)) ? "NUMERIC" : "TEXT";
    const checks = colConf.enum.map(v => `${colNameEsc} = ${asValue(v)}`).join(" OR ");
    return ` ${colNameEsc} ${type} ${colConf.nullable ? "" : "NOT NULL"} ${"defaultValue" in colConf ? ` DEFAULT ${asValue(colConf.defaultValue)}` : ""} CHECK(${checks})`;

  } else {
    return undefined;
    // throw "Unknown column config: " + JSON.stringify(colConf);
  }
}


export type ColumnMinimalInfo = { 
  table_name: string;
  table_schema: string;
  column_name: string;
  column_default: string | null;
  udt_name: string;
  nullable: boolean; 
};
export const getTableColumns = ({ db, table }: { db: DB | pgPromise.ITask<{}>; table: string;}): Promise<ColumnMinimalInfo[]> => {
  return db.manyOrNone(`
    SELECT table_name, 
      table_schema, column_name, 
      column_default, udt_name,
      is_nullable = 'YES' as nullable
    FROM information_schema.columns
    WHERE table_name = $1
  `, [table]);
}
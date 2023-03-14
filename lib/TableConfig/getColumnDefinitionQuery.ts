import { asName, isObject, pickKeys } from "prostgles-types"; 
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
export const getColumnDefinitionQuery = async ({ colConf, column, db, table }: Args): Promise<string> => {
  const colNameEsc = asName(column);
  const getColTypeDef = (colConf: BaseColumnTypes, pgType: "TEXT" | "JSONB") => {
    const { nullable, defaultValue } = colConf;
    return `${pgType} ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${asValue(defaultValue)} ` : ""}`
  }

  const jsonbSchema =
    isObject(colConf) ? (
      ("jsonbSchema" in colConf && colConf.jsonbSchema) ? { jsonbSchema: colConf.jsonbSchema, jsonbSchemaType: undefined } :
        ("jsonbSchemaType" in colConf && colConf.jsonbSchemaType) ? { jsonbSchema: undefined, jsonbSchemaType: colConf.jsonbSchemaType } :
          undefined
    ) :
      undefined;

  if (isObject(colConf) && "references" in colConf && colConf.references) {

    const { tableName: lookupTable, columnName: lookupCol = "id" } = colConf.references;
    return ` ${colNameEsc} ${getColTypeDef(colConf.references, "TEXT")} REFERENCES ${lookupTable} (${lookupCol}) `;

  } else if (typeof colConf === "string" || "sqlDefinition" in colConf && colConf.sqlDefinition) {

    return ` ${colNameEsc} ${typeof colConf === "string" ? colConf : colConf.sqlDefinition} `;

  } else if (isObject(colConf) && "isText" in colConf && colConf.isText) {
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
    const q = `SELECT ${VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${asValue(colConf.defaultValue) + "::JSONB"}, ARRAY[${asValue(column)}]) as v`;
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
    const namePreffix = 'prostgles_jsonb_' as const;
    const { val: nameEnding } = await db.one("SELECT MD5( ${table} || ${column}  || ${schema}) as val", { table: table, column, schema: jsonbSchemaStr });
    const constraintName = namePreffix + nameEnding;
    const colConstraints = await getColConstraints({ db, table, column });
    const existingNonMatchingConstraints = colConstraints.filter(c => c.name.startsWith(namePreffix) && c.name !== constraintName);
    for await (const oldCons of existingNonMatchingConstraints) {
      await db.any(`ALTER TABLE ${asName(table)} DROP CONSTRAINT ${asName(oldCons.name)};`);
    }

    return ` ${colNameEsc} ${getColTypeDef(colConf, "JSONB")}, CONSTRAINT ${asName(constraintName)} CHECK(${VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${colNameEsc}, ARRAY[${asValue(column)}]))`;

  } else if ("enum" in colConf) {
    if (!colConf.enum?.length) throw new Error("colConf.enum Must not be empty");
    const type = colConf.enum.every(v => Number.isFinite(v)) ? "NUMERIC" : "TEXT";
    const checks = colConf.enum.map(v => `${colNameEsc} = ${asValue(v)}`).join(" OR ");
    return ` ${colNameEsc} ${type} ${colConf.nullable ? "" : "NOT NULL"} ${"defaultValue" in colConf ? ` DEFAULT ${asValue(colConf.defaultValue)}` : ""} CHECK(${checks})`;

  } else {
    throw "Unknown column config: " + JSON.stringify(colConf);
  }
}

export type ColConstraint = {
  name: string;
  table: string;
  type: "c" | "p" | "u" | "f";
  cols: Array<string>;
  definition: string;
  schema: string;
}
type ColConstraintsArgs = {
  db: DB | pgPromise.ITask<{}>;
  table?: string;
  column?: string;
  types?: ColConstraint["type"][];
}
export const getColConstraintsQuery = ({ column, table, types }: Omit<ColConstraintsArgs, "db">) => {
  let query = `
    SELECT *
    FROM (             
      SELECT distinct c.conname as name, c.contype as type,
        pg_get_constraintdef(c.oid) as definition, 
        nsp.nspname as schema,
      (SELECT r.relname from pg_class r where r.oid = c.conrelid) as "table", 
      (SELECT array_agg(attname::text) from pg_attribute 
      where attrelid = c.conrelid and ARRAY[attnum] <@ c.conkey) as cols
      -- (SELECT array_agg(attname::text) from pg_attribute 
      -- where attrelid = c.confrelid and ARRAY[attnum] <@ c.confkey) as fcols, 
      -- (SELECT r.relname from pg_class r where r.oid = c.confrelid) as ftable
      FROM pg_catalog.pg_constraint c
      INNER JOIN pg_catalog.pg_class rel
      ON rel.oid = c.conrelid
      INNER JOIN pg_catalog.pg_namespace nsp
      ON nsp.oid = connamespace
    ) t   
    WHERE TRUE 
  `;
  if (table) query += `\nAND "table" = ${asValue(table)}`;
  if (column) query += `\nAND cols @> ARRAY[${asValue(column)}]`;
  if (types?.length) query += `\nAND type IN (${types.map(v => asValue(v)).join(", ")})`;
  return query;
}
export const getColConstraints = ({ db, column, table, types }: ColConstraintsArgs ): Promise<ColConstraint[]>  => {
  
  return db.manyOrNone(getColConstraintsQuery({ column, table, types }));
}
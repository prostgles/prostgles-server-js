import { asName, pickKeys } from "prostgles-types";
import type { DB } from "../Prostgles";
import { asValue } from "../PubSubManager/PubSubManagerUtils";
import { VALIDATE_SCHEMA_FUNCNAME } from "../JSONBSchemaValidation/validateJSONBSchemaSQL";
import type { BaseColumnTypes, ColumnConfig } from "./TableConfig";
import type pgPromise from "pg-promise";

type Args = {
  column: string;
  escapedColumnName?: string;
  colConf: ColumnConfig;
  db: DB;
  table: string;
  excludeName?: boolean;
};

/**
 * Column create statement for a given config
 */
export const getColumnSQLDefinitionQuery = async ({
  colConf: colConfRaw,
  column,
  escapedColumnName,
  db,
  table,
  excludeName,
}: Args): Promise<string | undefined> => {
  const colConf = typeof colConfRaw === "string" ? { sqlDefinition: colConfRaw } : colConfRaw;
  const colNameEsc = escapedColumnName ?? asName(column);
  const getColTypeDef = (colConf: BaseColumnTypes, pgType: "TEXT" | "JSONB") => {
    const { nullable, defaultValue } = colConf;
    return `${pgType} ${!nullable ? " NOT NULL " : ""} ${defaultValue ? ` DEFAULT ${asValue(defaultValue)} ` : ""}`;
  };

  const getDefinition = async () => {
    const jsonbSchema =
      "jsonbSchema" in colConf && colConf.jsonbSchema ?
        { jsonbSchema: colConf.jsonbSchema, jsonbSchemaType: undefined }
      : "jsonbSchemaType" in colConf && colConf.jsonbSchemaType ?
        { jsonbSchema: undefined, jsonbSchemaType: colConf.jsonbSchemaType }
      : undefined;

    const defaultValueSQL =
      colConf.defaultValue !== undefined ? ` DEFAULT ${asValue(colConf.defaultValue)}` : "";
    if (jsonbSchema) {
      const jsonbSchemaStr =
        asValue({
          ...pickKeys(colConf, ["enum", "nullable", "info"]),
          ...(jsonbSchema.jsonbSchemaType ?
            { type: jsonbSchema.jsonbSchemaType }
          : jsonbSchema.jsonbSchema),
        }) + "::TEXT";

      /** Validate default value against jsonbSchema  */
      const validationQuery = `SELECT ${VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${asValue(colConf.defaultValue) + "::JSONB"}, ${asValue({ table, column })}) as v`;
      if (colConf.defaultValue !== undefined) {
        try {
          const row = await db.oneOrNone<{ v?: null | boolean }>(validationQuery);
          if (!row?.v) {
            throw "Error";
          }
        } catch (e) {
          throw {
            msg: `Default value (${colConf.defaultValue}) for ${table}.${column} does not satisfy the jsonb constraint check: ${validationQuery}`,
            err: e,
          };
        }
      }

      return `${getColTypeDef(colConf, "JSONB")} CHECK(${VALIDATE_SCHEMA_FUNCNAME}(${jsonbSchemaStr}, ${colNameEsc}, ${asValue({ table, column })} ))`;
    } else if ("references" in colConf && colConf.references) {
      const {
        tableName: lookupTable,
        columnName: lookupCol = "id",
        onDelete,
        onUpdate,
      } = colConf.references;
      return `${getColTypeDef(colConf, "TEXT")} ${defaultValueSQL} REFERENCES ${lookupTable} (${lookupCol}) ${onDelete ? ` ON DELETE ${onDelete}` : ""} ${onUpdate ? ` ON UPDATE ${onUpdate}` : ""}`;
    } else if ("sqlDefinition" in colConf && colConf.sqlDefinition) {
      return `${colConf.sqlDefinition} `;
    } else if ("isText" in colConf && colConf.isText) {
      let checks = "";
      const colChecks: string[] = [];
      if (colConf.lowerCased) {
        colChecks.push(`${colNameEsc} = LOWER(${colNameEsc})`);
      }
      if (colConf.trimmed) {
        colChecks.push(`${colNameEsc} = BTRIM(${colNameEsc})`);
      }
      if (colChecks.length) {
        checks = `CHECK (${colChecks.join(" AND ")})`;
      }
      return `${getColTypeDef(colConf, "TEXT")} ${checks}`;
    } else if ("enum" in colConf) {
      if (!colConf.enum?.length) throw new Error("colConf.enum Must not be empty");
      const type = colConf.enum.every((v) => Number.isFinite(v)) ? "NUMERIC" : "TEXT";
      const checks = colConf.enum.map((v) => `${colNameEsc} = ${asValue(v)}`).join(" OR ");
      return `${type} ${colConf.nullable ? "" : "NOT NULL"} ${defaultValueSQL} CHECK(${checks})`;
    } else {
      return undefined;
      // throw "Unknown column config: " + JSON.stringify(colConf);
    }
  };
  const definition = await getDefinition();
  if (!definition) return undefined;
  return excludeName ? definition : `${colNameEsc} ${definition}`;
};

export type ColumnMinimalInfo = {
  table_name: string;
  table_schema: string;
  column_name: string;
  column_default: string | null;
  udt_name: string;
  nullable: boolean;
};
export const getTableColumns = ({
  db,
  table,
}: {
  db: DB | pgPromise.ITask<{}>;
  table: string;
}): Promise<ColumnMinimalInfo[]> => {
  return db.manyOrNone(
    `
    SELECT table_name, 
      table_schema, column_name, 
      column_default, udt_name,
      is_nullable = 'YES' as nullable
    FROM information_schema.columns
    WHERE table_name = $1
  `,
    [table]
  );
};

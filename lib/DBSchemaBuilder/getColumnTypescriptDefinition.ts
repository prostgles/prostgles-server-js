import {
  getJSONBSchemaTSTypes,
  isDefined,
  isObject,
  postgresToTsType,
  type JSONB,
  type TableSchema,
} from "prostgles-types";
import type { TableSchemaColumn } from "../DboBuilder/DboBuilder";
import { escapeTSNames } from "../utils/utils";
import type { TableConfig } from "../TableConfig/TableConfig";
import { getColumnConfig } from "../TableConfig/getColumnConfig";

export const getColumnTypescriptDefinition = ({
  config,
  tablesOrViews,
  tableOrView,
  column,
}: {
  config: TableConfig | undefined;
  tablesOrViews: TableSchema[];
  tableOrView: TableSchema;
  column: TableSchema["columns"][number];
}) => {
  /**
   * Columns that are nullable or have default values can be ommitted from an insert
   * Non nullable columns with default values cannot containt null values in an insert so they must contain a valid value or be omitted
   */

  const dataType = getDataType({
    config,
    tablesOrViews,
    tableOrView,
    column,
  });
  const { name, is_nullable, has_default } = column;

  return `${escapeTSNames(name)}${is_nullable || has_default ? "?" : ""}: ${dataType}`;
};

export const getDataType = ({
  config,
  tablesOrViews,
  tableOrView,
  column,
}: {
  config: TableConfig | undefined;
  tablesOrViews: TableSchema[];
  tableOrView: TableSchema;
  column: TableSchema["columns"][number];
}) => {
  const typeFromUdtName: string =
    (column.is_nullable ? "null | " : "") + getColTypeForDBSchema(column.udt_name) + ";";

  const buildEnumTypeDefinition = (enumVals: any[] | readonly any[], nullable: boolean) => {
    const types = enumVals.map((t) => (typeof t === "number" ? t : JSON.stringify(t)));
    if (nullable) {
      types.unshift("null");
    }
    return types.join(" | ");
  };

  const tableConfig = config && config[tableOrView.name];
  if (tableConfig && "isLookupTable" in tableConfig && column.is_pkey) {
    const enumValus = Object.keys(tableConfig.isLookupTable.values);
    return buildEnumTypeDefinition(enumValus, !!column.is_nullable);
  }

  const colConf = config && getColumnConfig(config, tableOrView.name, column.name);
  if (!colConf || !isObject(colConf)) {
    return typeFromUdtName;
  }

  if (colConf.jsonbSchema || colConf.jsonbSchemaType) {
    const schema: JSONB.JSONBSchema = colConf.jsonbSchema || {
      ...colConf,
      type: colConf.jsonbSchemaType,
    };
    return getJSONBSchemaTSTypes(schema, { nullable: colConf.nullable }, "      ", tablesOrViews);
  }

  if ("enum" in colConf) {
    if (!colConf.enum) throw "colConf.enum missing";
    return buildEnumTypeDefinition(colConf.enum, !!colConf.nullable);
  }

  /** When referencing a isLookupTable table we add the isLookupTable.values as enums */
  if (("references" in colConf && colConf.references) || column.references?.length) {
    const lookupTableConfig =
      colConf.references ?
        config[colConf.references.tableName]
      : column.references
          ?.map((ref) => {
            const refTableConfig = config[ref.ftable];
            if (refTableConfig && "isLookupTable" in refTableConfig) {
              return refTableConfig;
            }
          })
          .find(isDefined);
    if (lookupTableConfig && "isLookupTable" in lookupTableConfig) {
      const enumValus = Object.keys(lookupTableConfig.isLookupTable.values);
      return buildEnumTypeDefinition(enumValus, !!colConf.nullable);
    }
  }

  return typeFromUdtName;
};

const getColTypeForDBSchema = (udt_name: TableSchemaColumn["udt_name"]): string => {
  if (udt_name === "interval") {
    const units = ["years", "months", "days", "hours", "minutes", "seconds", "milliseconds"];

    return `{ ${units.map((u) => `${u}?: number;`).join(" ")} }`;
  }

  return postgresToTsType(udt_name);
};

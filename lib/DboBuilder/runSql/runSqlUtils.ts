import type pg from "pg-promise/typescript/pg-subset";
import { postgresToTsType, type PG_COLUMN_UDT_DATA_TYPE } from "prostgles-types";
import type { DB } from "../../Prostgles";

export const getDbTypes = async (db: DB) => {
  const dataTypes = await db.any<{
    oid: number;
    typname: PG_COLUMN_UDT_DATA_TYPE;
  }>("SELECT oid, typname FROM pg_type");
  const userTables = await db.any<{
    relid: number;
    relname: string;
    schemaname: string;
    pkey_columns: string[] | null;
  }>(`
    SELECT 
      relid, 
      relname, 
      schemaname, 
      array_to_json(array_agg(c.column_name) FILTER (WHERE c.column_name IS NOT NULL)) as pkey_columns
    FROM pg_catalog.pg_statio_user_tables t
    LEFT JOIN (
      SELECT a.attname as column_name, i.indrelid as table_oid
      FROM   pg_index i
      JOIN   pg_attribute a ON a.attrelid = i.indrelid
        AND a.attnum = ANY(i.indkey)
      WHERE i.indisprimary
    ) c
    ON t.relid = c.table_oid
    GROUP BY relid, relname, schemaname
  `);
  const dataTypesMap = new Map(dataTypes.map((dt) => [Number(dt.oid), dt]));
  const userTablesMap = new Map(userTables.map((t) => [Number(t.relid), t]));
  const userTableColumns = await db.any<{
    relid: number;
    schemaname: string;
    relname: string;
    column_name: string;
    udt_name: string;
    ordinal_position: number;
  }>(`
    SELECT t.relid, t.schemaname, t.relname, c.column_name, c.udt_name, c.ordinal_position
    FROM information_schema.columns c
    INNER JOIN pg_catalog.pg_statio_user_tables t
    ON  c.table_schema = t.schemaname AND c.table_name = t.relname 
  `);
  const userTableColumnsMap = new Map(
    userTableColumns.map((c) => [[c.relid, c.ordinal_position].join("-"), c]),
  );
  return { dataTypesMap, userTablesMap, userTableColumnsMap };
};

export const getDetailedFieldInfo = (
  { dataTypesMap, userTablesMap, userTableColumnsMap }: Awaited<ReturnType<typeof getDbTypes>>,
  fields: pg.IColumn[],
) => {
  return fields.map((f) => {
    const dataType = dataTypesMap.get(+f.dataTypeID)?.typname ?? "text",
      table = userTablesMap.get(+f.tableID),
      column = userTableColumnsMap.get([f.tableID, f.columnID].join("-")),
      tsDataType = postgresToTsType(dataType);

    return {
      ...f,
      tsDataType,
      dataType,
      udt_name: dataType,
      tableName: table?.relname,
      tableSchema: table?.schemaname,
      columnName: column?.column_name,
    };
  });
};

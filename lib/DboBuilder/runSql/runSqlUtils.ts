import type pg from "pg-promise/typescript/pg-subset";
import { postgresToTsType, type PG_COLUMN_UDT_DATA_TYPE } from "prostgles-types";
import type { DB } from "../../Prostgles";

export const getDbTypes = async (db: DB) => {
  const DATA_TYPES = await db.any<{
    oid: number;
    typname: PG_COLUMN_UDT_DATA_TYPE;
  }>("SELECT oid, typname FROM pg_type");
  const USER_TABLES = await db.any<{
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
  const USER_TABLE_COLUMNS = await db.any<{
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
  return { DATA_TYPES, USER_TABLES, USER_TABLE_COLUMNS };
};

export const getDetailedFieldInfo = (
  { DATA_TYPES, USER_TABLES, USER_TABLE_COLUMNS }: Awaited<ReturnType<typeof getDbTypes>>,
  fields: pg.IColumn[],
) => {
  return fields.map((f) => {
    const dataType = DATA_TYPES.find((dt) => +dt.oid === +f.dataTypeID)?.typname ?? "text",
      table = USER_TABLES.find((t) => +t.relid === +f.tableID),
      column = USER_TABLE_COLUMNS.find(
        (c) => +c.relid === +f.tableID && c.ordinal_position === f.columnID,
      ),
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

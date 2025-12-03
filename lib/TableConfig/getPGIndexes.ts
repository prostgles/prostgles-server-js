import type { DB } from "../Prostgles";

type PGIndex = {
  schemaname: string;
  indexname: string;
  indexdef: string;
  escaped_identifier: string;
  type: string;
  owner: string;
  tablename: string;
  persistence: string;
  access_method: string;
  size: string;
  description: string | null;
};
export const getPGIndexes = async (
  db: DB,
  tableName: string,
  schema: string,
): Promise<PGIndex[]> => {
  const indexQuery = `
    SELECT n.nspname as schemaname,
      c.relname as indexname,
      pg_get_indexdef(c.oid) as indexdef,
      format('%I', c.relname) as escaped_identifier,
      CASE c.relkind WHEN 'r' 
        THEN 'table' WHEN 'v' 
        THEN 'view' WHEN 'm' 
        THEN 'materialized view' 
        WHEN 'i' THEN 'index' 
        WHEN 'S' THEN 'sequence' WHEN 's' THEN 'special' 
        WHEN 't' THEN 'TOAST table' WHEN 'f' THEN 'foreign table' 
        WHEN 'p' THEN 'partitioned table' WHEN 'I' THEN 'partitioned index' END as "type",
      pg_catalog.pg_get_userbyid(c.relowner) as "owner",
      c2.relname as tablename,
      CASE c.relpersistence WHEN 'p' THEN 'permanent' WHEN 't' THEN 'temporary' 
      WHEN 'u' THEN 'unlogged' END as "persistence",
      am.amname as "access_method",
      pg_catalog.pg_size_pretty(pg_catalog.pg_table_size(c.oid)) as "size",
      pg_catalog.obj_description(c.oid, 'pg_class') as "description"
    FROM pg_catalog.pg_class c
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_am am ON am.oid = c.relam
        LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
        LEFT JOIN pg_catalog.pg_class c2 ON i.indrelid = c2.oid
    WHERE c.relkind IN ('i','I','')
          AND n.nspname <> 'pg_catalog'
          AND n.nspname !~ '^pg_toast'
          AND n.nspname <> 'information_schema'
      AND pg_catalog.pg_table_is_visible(c.oid)
    AND c2.relname = \${tableName}
    AND n.nspname = \${schema}
    ORDER BY 1,2;
    `;
  return db.any(indexQuery, { tableName, schema });
};

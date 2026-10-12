import type { DB } from "../Prostgles";

type PGIndex = {
  indexname: string;
  indexdef: string;
  unique: boolean;
  description: string | null;
};
export const getPGIndexes = async (
  db: Pick<DB, "any">,
  tableName: string,
): Promise<PGIndex[]> => {
  const indexQuery = `
    SELECT c.relname as indexname,
      -- Compare the definition independently of the inspection table/index names.
      substr(pg_get_indexdef(c.oid), length(format('CREATE %sINDEX %I ON %s%I.%I ',
        CASE WHEN i.indisunique THEN 'UNIQUE ' ELSE '' END, c.relname,
        CASE WHEN c2.relkind = 'p' THEN 'ONLY ' ELSE '' END,
        CASE WHEN n.oid = pg_my_temp_schema() THEN 'pg_temp' ELSE n.nspname END, c2.relname
      )) + 1) as indexdef,
      i.indisunique as unique,
      pg_catalog.obj_description(c.oid, 'pg_class') as "description"
    FROM pg_catalog.pg_class c
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
        LEFT JOIN pg_catalog.pg_class c2 ON i.indrelid = c2.oid
    WHERE i.indrelid = to_regclass(quote_ident(\${tableName}))
    ORDER BY c.relname;
    `;
  return db.any(indexQuery, { tableName });
};

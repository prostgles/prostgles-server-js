import { DBorTx } from "../Prostgles";
import { ProstglesInitOptions } from "../ProstglesTypes";
import { getSchemaFilter } from "./getTablesForSchemaPostgresSQL";

export const getMaterialViews = (db: DBorTx, schema: ProstglesInitOptions["schemaFilter"]) => {
  const { sql, schemaNames } = getSchemaFilter(schema);

  const query = `
    SELECT 
      c.oid,
      schema,
      escaped_identifier,
      true as is_view,
      true as is_mat_view,
      obj_description(c.oid) as comment,
      c.table_name as name,
      definition as view_definition,
      jsonb_build_object(
        'insert', FALSE,
        'select', TRUE,
        'update', FALSE,
        'delete', FALSE
      ) as privileges,
      json_agg(json_build_object(
        'name', column_name,
        'table_oid', c.oid,
        'is_pkey', false,
        'data_type', data_type,
        'udt_name', udt_name,
        'element_udt_name',
            CASE WHEN LEFT(udt_name, 1) = '_' 
            THEN RIGHT(udt_name, -1) END,
        'element_type',
            CASE WHEN RIGHT(data_type, 2) = '[]' 
            THEN LEFT(data_type, -2) END,
        'is_nullable', nullable,
        'is_generated', true,
        'references', null,
        'has_default', false,
        'column_default', null,
        'is_updatable', false,
        'privileges', $$ { "SELECT": true } $$::jsonb
      )) as columns
    FROM pg_catalog.pg_matviews m
    INNER JOIN (
      SELECT 
        t.oid,
        CASE WHEN current_schema() = s.nspname 
            THEN format('%I', t.relname) 
            ELSE format('%I.%I', s.nspname, t.relname) 
          END as escaped_identifier,
        t.relname as table_name,
        s.nspname as schema,
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        typname as udt_name,
        a.attnotnull as nullable,
        a.attnum as ordinal_position,
        col_description(t.oid, attnum) as comment
      FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class t on a.attrelid = t.oid
        JOIN pg_catalog.pg_namespace s on t.relnamespace = s.oid
        JOIN pg_catalog.pg_type pt ON pt.oid = a.atttypid
      WHERE a.attnum > 0 
        AND NOT a.attisdropped
        AND relkind = 'm'
      ORDER BY a.attnum
    ) c
    ON matviewname = table_name
    AND schemaname = schema
    WHERE schema ${sql}
    GROUP BY c.oid, escaped_identifier, c.table_name, schema, definition
  `;

  /** TODO: check privileges 



select 
    coalesce(nullif(s[1], ''), 'public') as grantee, 
    s[2] as privileges
from 
    pg_class c
    join pg_namespace n on n.oid = relnamespace
    join pg_roles r on r.oid = relowner,
    unnest(coalesce(relacl::text[], format('{%s=arwdDxt/%s}', rolname, rolname)::text[])) acl, 
    regexp_split_to_array(acl, '=|/') s
where nspname = 'public' and relname = 'test_view';


  */

  return db.any(query, { schemaNames });
};

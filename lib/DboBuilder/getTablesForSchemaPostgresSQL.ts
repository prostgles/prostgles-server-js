import { SQLResult } from "prostgles-types";
import { DboBuilder, TableSchemaColumn, TableSchema } from "../DboBuilder";
import { asValue } from "../PubSubManager/PubSubManager";

// TODO: Add a onSocketConnect timeout for this query. Reason: this query gets blocked by prostgles.app_triggers from PubSubManager.addTrigger in some cases (pg_dump locks that table)
export async function getTablesForSchemaPostgresSQL({ db, runSQL }: DboBuilder, schema = "public"): Promise<TableSchema[]> {
  const query =
    `
    SELECT 
    jsonb_build_object(
      'insert', TRUE,
      'select', TRUE,
      'update', TRUE,
      'delete', EXISTS (
          SELECT 1 
          FROM information_schema.role_table_grants rg
          WHERE rg.table_name = t.table_name
          AND rg.privilege_type = 'DELETE'
      )
    ) as privileges
    , t.table_schema as schema, t.table_name as name 
    , COALESCE(cc.columns, '[]'::JSONB) as columns 
    , t.oid
    , t.is_view 
    , t.view_definition 
    , array_to_json(vr.table_names) as parent_tables
    , obj_description(t.oid::regclass) as comment
  FROM ( 
    SELECT table_name,
      table_schema,
      oid,
      is_view,
      CASE WHEN is_view THEN pg_get_viewdef(format('%I.%I', table_schema, table_name)::REGCLASS, true) END as view_definition 
    FROM (
      SELECT table_name, table_schema, table_type = 'VIEW' as is_view, regclass(table_schema || '.' || table_name)::oid as oid
      FROM information_schema.tables 
/* TODO - add support for materialized views
      UNION ALL 
      SELECT table_name, table_schema
      FROM (
        SELECT relname as table_name, nspname as table_schema, true as is_view
        FROM pg_catalog.pg_class AS _c
        JOIN pg_catalog.pg_namespace AS _ns
          ON _c.relnamespace = _ns.oid 
        WHERE relkind IN ( 'm' )
      ) materialized_views
*/
    ) tables_matviews
    WHERE table_schema = ${asValue(schema)}
  ) t  
  LEFT join (
      SELECT table_schema, table_name
      , jsonb_agg((SELECT x FROM (
          SELECT ccc.column_name as name, 
          ccc.data_type, 
          ccc.udt_name, 
          ccc.element_type,
          ccc.element_udt_name,
          ccc.is_pkey, 
          ccc.comment, 
          ccc.ordinal_position, 
          ccc.is_nullable = 'YES' as is_nullable,
          ccc.is_updatable,
          ccc.references,
          ccc.has_default,
          ccc.column_default,
          COALESCE(ccc.privileges, '[]'::JSON) as privileges
      ) as x) ORDER BY ccc.ordinal_position ) as columns 
      FROM (
          SELECT  c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name
          , e.data_type as element_type
          , e.udt_name as element_udt_name
          ,  col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) as comment
          --, CASE WHEN fc.ftable IS NOT NULL THEN row_to_json((SELECT t FROM (SELECT fc.ftable, fc.fcols, fc.cols) t)) END as references
          , fc.references
          , c.is_identity = 'YES' OR EXISTS ( 
              SELECT 1    
              FROM information_schema.table_constraints as tc 
              JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema  
              WHERE kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type IN ('PRIMARY KEY') 
          ) as is_pkey
          , c.ordinal_position
          , COALESCE(c.column_default IS NOT NULL OR c.identity_generation = 'ALWAYS', false) as has_default
          , c.column_default
          , format('%I.%I', c.table_schema, c.table_name)::regclass::oid AS table_oid
          , c.is_nullable
            /* generated always and view columns cannot be updated */
          , COALESCE(c.is_updatable, 'YES') = 'YES' AND COALESCE(c.is_generated, '') != 'ALWAYS' AND COALESCE(c.identity_generation, '') != 'ALWAYS' as is_updatable
          , cp.privileges
          FROM information_schema.columns c    
          LEFT JOIN (SELECT * FROM information_schema.element_types )   e  
              ON ((c.table_catalog, c.table_schema, c.table_name, 'TABLE', c.dtd_identifier)  
              = (e.object_catalog, e.object_schema, e.object_name, e.object_type, e.collection_type_identifier)
          )
          LEFT JOIN (
              SELECT table_schema, table_name, column_name, json_agg(row_to_json((SELECT t FROM (SELECT cpp.privilege_type, cpp.is_grantable ) t))) as privileges
              FROM information_schema.column_privileges cpp
              GROUP BY table_schema, table_name, column_name
          ) cp
              ON c.table_name = cp.table_name AND c.column_name = cp.column_name
          LEFT JOIN (
              --SELECT *
              SELECT "table", unnest(ft.cols) as col, jsonb_agg(row_to_json((SELECT t FROM (SELECT ftable, fcols, cols) t))) as references
              FROM (
                SELECT 
                  (SELECT r.relname from pg_class r where r.oid = c.conrelid) as table, 
                  (SELECT array_agg(attname::text) from pg_attribute 
                  where attrelid = c.conrelid and ARRAY[attnum] <@ c.conkey) as cols, 
                  (SELECT array_agg(attname::text) from pg_attribute 
                  where attrelid = c.confrelid and ARRAY[attnum] <@ c.confkey) as fcols, 
                  (SELECT r.relname from pg_class r where r.oid = c.confrelid) as ftable
                FROM pg_constraint c 
              ) ft
              WHERE ft.table IS NOT NULL 
              AND ft.ftable IS NOT NULL 
                  --  c.confrelid = 'users'::regclass::oid
              GROUP BY "table",  unnest(cols)
          ) fc 
          ON fc.table = c.table_name
          AND c.column_name::text = fc.col
      ) ccc
      GROUP BY table_schema, table_name
  ) cc  
  ON t.table_name = cc.table_name  
  AND t.table_schema = cc.table_schema  
  LEFT JOIN ( 
      SELECT cl_r.relname as view_name, array_agg(DISTINCT cl_d.relname) AS table_names 
      FROM pg_rewrite AS r 
      JOIN pg_class AS cl_r ON r.ev_class=cl_r.oid 
      JOIN pg_depend AS d ON r.oid=d.objid 
      JOIN pg_class AS cl_d ON d.refobjid=cl_d.oid 
      WHERE cl_d.relkind IN ('r','v') 
      AND cl_d.relname <> cl_r.relname 
      GROUP BY cl_r.relname 
  ) vr 
  ON t.table_name = vr.view_name 
  GROUP BY t.table_schema, t.table_name, t.is_view, t.view_definition, vr.table_names , t.oid, cc.columns
  ORDER BY schema, name
    `;
    
  let result: TableSchema[] = await db.any(query, { schema });

  result = await Promise.all(result
    .map(async tbl => {
      tbl.privileges.select = tbl.columns.some(c => c.privileges.some(p => p.privilege_type === "SELECT"));
      tbl.privileges.insert = tbl.columns.some(c => c.privileges.some(p => p.privilege_type === "INSERT"));
      tbl.privileges.update = tbl.columns.some(c => c.privileges.some(p => p.privilege_type === "UPDATE"));
      
      /** Get view reference cols (based on parent table) */
      let viewFCols: Pick<TableSchemaColumn, "name" | "references">[] = [];
      if(tbl.is_view){
        try {
          const view_definition = tbl.view_definition?.endsWith(";")? tbl.view_definition.slice(0, -1) : tbl.view_definition;
          const { fields } = await runSQL(`SELECT * FROM \n ( ${view_definition!} \n) t LIMIT 0`, {}, {}, undefined) as SQLResult<undefined>;
          const ftables = result.filter(r => fields.some(f => f.tableID === r.oid));
          ftables.forEach(ft => {
            const fFields = fields.filter(f => f.tableID === ft.oid);
            const pkeys = ft.columns.filter(c => c.is_pkey);
            const fFieldPK = fFields.filter(ff => pkeys.some(p => p.name === ff.columnName));
            const refCols = pkeys.length && fFieldPK.length === pkeys.length? fFieldPK : fFields.filter(ff => !["json", "jsonb", "xml"].includes(ff.udt_name));
            const _fcols: typeof viewFCols = refCols.map(ff => {
              const d: Pick<TableSchemaColumn, "name" | "references"> = {
                name: ff.columnName!,
                references: [{
                  ftable: ft.name,
                  fcols: [ff.columnName!],
                  cols: [ff.name]
                }]
              }
              return d;
            })
            viewFCols = [
              ...viewFCols,
              ..._fcols 
            ];
          });
        } catch(err){
          console.error(err);
        }
      }

      tbl.columns = tbl.columns.map(col => {
        if (col.has_default) {
          /** Hide pkey default value */
          col.column_default = (col.udt_name !== "uuid" && !col.is_pkey && !col.column_default.startsWith("nextval(")) ? col.column_default : null;
        }

        const viewFCol = viewFCols?.find(fc => fc.name === col.name)
        if(viewFCol){
          col.references = viewFCol.references;
        }

        return col;

      })//.slice(0).sort((a, b) => a.name.localeCompare(b.name))
      // .sort((a, b) => a.ordinal_position - b.ordinal_position)

      return tbl;
    }));
 
  return result;
}
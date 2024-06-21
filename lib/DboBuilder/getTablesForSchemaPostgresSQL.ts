import { SQLResult, asName } from "prostgles-types";
import { omitKeys, tryCatch } from "prostgles-types/dist/util";
import { DboBuilder } from "../DboBuilder/DboBuilder";
import { DBorTx } from "../Prostgles";
import { clone } from "../utils";
import { TableSchema, TableSchemaColumn } from "./DboBuilderTypes";
import { ProstglesInitOptions } from "../ProstglesTypes";

const getMaterialViews = (db: DBorTx, schema: ProstglesInitOptions["schema"]) => {
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
}

export const getSchemaFilter = (schema: ProstglesInitOptions["schema"] = { public: 1 }) => {
  const schemaNames = Object.keys(schema);
  const isInclusive = Object.values(schema).every(v => v);
  if(!schemaNames.length){
    throw "Must specify at least one schema";
  }

  return {
    sql: ` ${isInclusive? "" : "NOT "}IN (\${schemaNames:csv})`,
    schemaNames,
  }
}

// TODO: Add a onSocketConnect timeout for this query. 
// Reason: this query gets blocked by prostgles.app_triggers from PubSubManager.addTrigger in some cases (pg_dump locks that table)
export async function getTablesForSchemaPostgresSQL(
  { db, runSQL }: DboBuilder, 
  schema: ProstglesInitOptions["schema"]
): Promise<{
  result: TableSchema[];
  durations: Record<string, number>;
}> {
  const { sql, schemaNames } = getSchemaFilter(schema);

  return db.tx(async t => {

    /**
     * Multiple queries to reduce load on low power machines
     */
    const getFkeys = await tryCatch(async () => {

      const fkeys: { 
        oid: number;
        ftable: string;
        cols: string[];
        fcols: string[];
      }[] = await t.any(`
      WITH pg_class_schema AS (
        SELECT  c.oid, c.relname, nspname as schema
            ,CASE WHEN current_schema() = nspname 
              THEN format('%I', c.relname) 
              ELSE format('%I.%I', nspname, c.relname) 
            END as escaped_identifier
        FROM pg_catalog.pg_class AS c
        LEFT JOIN pg_catalog.pg_namespace AS ns
          ON c.relnamespace = ns.oid
        WHERE nspname ${sql}
      ), fk AS (
        SELECT conrelid as oid
          , escaped_identifier as ftable
          , array_agg(DISTINCT c1.attname::text) as cols
          , array_agg(DISTINCT c2.attname::text) as fcols
        FROM pg_catalog.pg_constraint c
        INNER JOIN pg_class_schema pc
          ON confrelid = pc.oid
        LEFT JOIN pg_attribute c1
        ON c1.attrelid = c.conrelid and ARRAY[c1.attnum] <@ c.conkey
        LEFT JOIN pg_attribute c2
        ON c2.attrelid = c.confrelid and ARRAY[c2.attnum] <@ c.confkey
        WHERE contype = 'f'
        GROUP BY conrelid,  conname, pc.escaped_identifier
      )
      SELECT * FROM  fk
      `, { schemaNames });

      return { fkeys };
    });
    if(getFkeys.error !== undefined){
      throw getFkeys.error;
    }
  
    const badFkey = getFkeys.fkeys!.find(r => r.fcols.includes(null as any));
    if(badFkey){
      throw `Invalid table column schema. Null or empty fcols for ${JSON.stringify(getFkeys.fkeys)}`;
    }

    const getTVColumns = await tryCatch(async () => {
      const columns: (TableSchemaColumn & { table_oid: number; })[] = await t.any(`
          SELECT
            table_oid
              , ccc.column_name as name ,
              ccc.data_type, 
              ccc.udt_name, 
              ccc.element_type,
              ccc.element_udt_name,
              ccc.is_pkey, 
              col_description(table_oid, ordinal_position) as comment,
              ccc.ordinal_position, 
              ccc.is_nullable = 'YES' as is_nullable,
              ccc.is_updatable,
              ccc.is_generated,
              null as references,
              ccc.has_default,
              ccc.column_default
              , COALESCE(ccc.privileges, '[]'::JSON) as privileges
          FROM (
            SELECT  c.table_schema, c.table_name, c.column_name, c.data_type, c.udt_name
            , e.data_type as element_type
            , e.udt_name as element_udt_name
            , format('%I.%I', c.table_schema, c.table_name)::regclass::oid as table_oid
            --, fc.references
            , c.is_identity = 'YES' OR has_pkey IS TRUE as is_pkey
            , c.ordinal_position
            , COALESCE(c.column_default IS NOT NULL OR c.identity_generation = 'ALWAYS', false) as has_default
            , c.column_default
            , c.is_nullable
            , CASE WHEN c.is_generated = 'ALWAYS' THEN true ELSE false END as is_generated
              /* generated always and view columns cannot be updated */
            , COALESCE(c.is_updatable, 'YES') = 'YES' AND COALESCE(c.is_generated, '') != 'ALWAYS' AND COALESCE(c.identity_generation, '') != 'ALWAYS' as is_updatable
            , cp.privileges
            FROM information_schema.columns c    
            LEFT JOIN information_schema.element_types  e  
                ON ((c.table_catalog, c.table_schema, c.table_name, 'TABLE', c.dtd_identifier)  
                = (e.object_catalog, e.object_schema, e.object_name, e.object_type, e.collection_type_identifier)
            )
            LEFT JOIN (
              SELECT DISTINCT tc.table_schema, tc.table_name, kcu.column_name, true as has_pkey
                FROM information_schema.table_constraints as tc 
                JOIN information_schema.key_column_usage AS kcu 
                  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema  
                WHERE tc.constraint_type IN ('PRIMARY KEY') 
                AND tc.table_schema ${sql}
              ) pkeys
              ON  
                pkeys.table_schema = c.table_schema 
                AND pkeys.table_name = c.table_name
                AND pkeys.column_name = c.column_name 
            LEFT JOIN (
              SELECT table_schema, table_name, column_name
                , (json_object_agg(privilege_type, true)) as privileges
                FROM information_schema.column_privileges cpp
                WHERE table_schema ${sql}
                GROUP BY table_schema, table_name, column_name
              ) cp
              ON c.table_schema = cp.table_schema AND c.table_name = cp.table_name AND c.column_name = cp.column_name
          ) ccc
          WHERE table_schema ${sql}
          ORDER BY table_oid, ordinal_position
      `, { schemaNames });

      return { columns };
    });
    if(getTVColumns.error || !getTVColumns.columns){
      throw getTVColumns.error ?? "No columns";
    }

    const getViewParentTables = await tryCatch(async () => {
      const parent_tables: { oid: number; table_names: string[]; }[] = await t.any(`
        SELECT cl_r.oid, cl_r.relname as view_name, array_agg(DISTINCT cl_d.relname) AS table_names 
        FROM pg_rewrite AS r 
        JOIN pg_class AS cl_r ON r.ev_class = cl_r.oid 
        JOIN pg_depend AS d ON r.oid = d.objid 
        JOIN pg_class AS cl_d ON d.refobjid = cl_d.oid 
        WHERE cl_d.relkind IN ('r','v') 
        AND cl_d.relname <> cl_r.relname 
        GROUP BY cl_r.oid, cl_r.relname
      `);
      return { parent_tables }
    });
    const getTablesAndViews = await tryCatch(async () => {

      const query = `
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
          , t.table_schema as schema
          , t.table_name as name
          , CASE WHEN current_schema() = t.table_schema 
              THEN format('%I', t.table_name) 
              ELSE format('%I.%I', t.table_schema, t.table_name) 
            END as escaped_identifier
          , t.oid
          , t.is_view 
          , CASE WHEN is_view THEN pg_get_viewdef(oid, true) END as view_definition 
          , obj_description(t.oid::regclass) as comment
        FROM ( 
          SELECT table_name
          , table_schema, table_type = 'VIEW' as is_view
          , format('%I.%I', table_schema, table_name)::REGCLASS::oid as oid
          FROM information_schema.tables 
          WHERE table_schema ${sql}
        ) t
        --GROUP BY t.table_schema, t.table_name, t.is_view, t.view_definition, t.oid
        ORDER BY schema, name
        `;
      const tablesAndViews = (await t.any(query, { schemaNames }) as TableSchema[]).map(table => {
        table.columns = clone(getTVColumns.columns).filter(c => c.table_oid === table.oid).map(c => omitKeys(c, ["table_oid"])) ?? [];
        table.parent_tables = getViewParentTables.parent_tables?.find(vr => vr.oid === table.oid)?.table_names ?? [];
        return table;
      });
      return { tablesAndViews };
    });
    if(getTablesAndViews.error || !getTablesAndViews.tablesAndViews){
      throw getTablesAndViews.error ?? "No tablesAndViews";
    }
      
    const getMaterialViewsReq = await tryCatch(async () => {
      const materialViews = await getMaterialViews(t, schema);
      return { materialViews }
    });
    if(getMaterialViewsReq.error || !getMaterialViewsReq.materialViews){
      throw getMaterialViewsReq.error ?? "No materialViews";
    }

    const getHyperTablesReq = await tryCatch(async () => {
      const hyperTables = await getHyperTables(t);
      return { hyperTables };
    });
    if(getHyperTablesReq.error){
      console.error(getHyperTablesReq.error);
    }
  
    let result = getTablesAndViews.tablesAndViews.concat(getMaterialViewsReq.materialViews);
    result = await Promise.all(result
      .map(async table => {
        table.name = table.escaped_identifier;
        /** This is used to prevent bug of table schema not sent */
        const allowAllIfNoColumns = !table.columns?.length? true : undefined;
        table.privileges.select = allowAllIfNoColumns ?? table.columns.some(c => c.privileges.SELECT);
        table.privileges.insert = allowAllIfNoColumns ?? table.columns.some(c => c.privileges.INSERT);
        table.privileges.update = allowAllIfNoColumns ?? table.columns.some(c => c.privileges.UPDATE);
        table.columns = table.columns.map(c => {
          const refs = getFkeys.fkeys!.filter(fc => fc.oid === table.oid && fc.cols.includes(c.name));
          if(refs.length) c.references = refs.map(_ref => {
            const ref = { ..._ref };
            //@ts-ignore
            delete ref.oid;
            return ref;
          });
          return c;
        });
  
        /** Get view reference cols (based on parent table) */
        let viewFCols: Pick<TableSchemaColumn, "name" | "references">[] = [];
        if(table.is_view){
          try {
            const view_definition = table.view_definition?.endsWith(";")? table.view_definition.slice(0, -1) : table.view_definition;
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
  
        table.columns = table.columns.map(col => {
          if (col.has_default) {
            /** Hide pkey default value */
            col.column_default = (col.udt_name !== "uuid" && !col.is_pkey && !col.column_default.startsWith("nextval(")) ? col.column_default : null;
          }
  
          const viewFCol = viewFCols?.find(fc => fc.name === col.name)
          if(viewFCol){
            col.references = viewFCol.references;
          }
  
          return col;
  
        });
        table.isHyperTable = getHyperTablesReq.hyperTables?.includes(table.name);
  
        return table;
      }));
   
    const res = {
      result,
      durations: {
        matv: getMaterialViewsReq.duration,
        columns: getTVColumns.duration,
        tablesAndViews: getTablesAndViews.duration,
        fkeys: getFkeys.duration,
        getHyperTbls: getHyperTablesReq.duration,
        viewParentTbls: getViewParentTables.duration,
      }
    };

    return res;
  });
}

/**
 * Used to check for Timescale Bug
 */
const getHyperTables = async (db: DBorTx): Promise<string[] | undefined> => {
  const schema = "_timescaledb_catalog";
  const res = await db.oneOrNone("SELECT EXISTS( \
      SELECT * \
      FROM information_schema.tables \
      WHERE 1 = 1 \
          AND table_schema = ${schema} \
          AND table_name = 'hypertable' \
    );", { schema });
  if (res.exists) {
    const tables: {table_name: string}[] = await db.any("SELECT table_name FROM " + asName(schema) + ".hypertable;");
    return tables.map(t => t.table_name);
  }
  return undefined;
}
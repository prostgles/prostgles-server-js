import type pgPromise from "pg-promise";

export const getSchemaForTableConfig = async (t: pgPromise.ITask<{}>) => {
  const getTableIdent = (schemaRelname: string) =>
    `format('%I.%I', ${schemaRelname}) as table_ident`;

  const tablesInCurrentSchemaFilter = `
      t.table_type = 'BASE TABLE'
      AND t.table_schema = current_schema()
      AND NOT EXISTS (
        /* EXCLUDE TABLES OWNED BY EXTENSIONS */
        SELECT
            ext.extname AS extension_name,
            n.nspname AS table_schema,
            c.relname AS table_name
        FROM
            pg_depend d
        JOIN
            pg_extension ext ON d.refobjid = ext.oid -- Object depends on this extension
        JOIN
            pg_class c ON d.objid = c.oid           -- The dependent object (e.g., table)
        JOIN
            pg_namespace n ON c.relnamespace = n.oid -- Get the schema name of the object
        WHERE
            d.deptype = 'e'        -- Dependency type 'e' means the object is owned by the extension
            AND c.relkind = 'r'    -- 'r' means it's a regular table (relation)
            AND n.nspname = t.table_schema
            AND c.relname = t.table_name 
      )
      `;
  const tablesAndColumns = await t.manyOrNone<{
    table_ident: string;
    table_name: string;
    table_schema: string;
    columns:
      | null
      | {
          table_ident: string;
          table_name: string;
          table_schema: string;
          column_name: string;
          column_name_escaped: string;
          column_default: string | null;
          character_maximum_length: number | null;
          numeric_precision: number | null;
          numeric_scale: number | null;
          udt_name: string;
          is_nullable: boolean;
          ordinal_position: number;
        }[];
    triggers:
      | null
      | {
          trigger_def: string;
          function_def: string;
        }[];
    constraints: null | {
      conname: string;
      definition: string;
      contype: "c" | "f" | "p" | "u";
      columns: null | string[];
    };
    indexes:
      | null
      | {
          indexname: string;
          indexdef: string;
        }[];
  }>(`
    WITH
      cols AS (
        SELECT 
          table_schema,
          table_name,
          column_name,
          quote_ident(column_name) as column_name_escaped,
          udt_name,
          is_nullable = 'YES' as is_nullable,
          column_default,
          character_maximum_length, 
          numeric_precision, 
          numeric_scale,
          c.ordinal_position
        FROM
          information_schema.columns c
      )
    SELECT
      ${getTableIdent("t.table_schema, t.table_name")},
      t.table_schema,
      t.table_name,
      c.columns,
      trg.triggers,
      idx.indexes
    FROM information_schema.tables t
    LEFT JOIN LATERAL (
      SELECT
        t.table_schema,
        t.table_name,
        jsonb_agg(to_jsonb(c.*) ORDER BY c.ordinal_position) as columns
      FROM cols c
      WHERE t.table_schema = c.table_schema
        AND t.table_name = c.table_name
      GROUP BY 1, 2
    ) c 
      ON TRUE
    LEFT JOIN LATERAL (
     SELECT  
        jsonb_agg(jsonb_build_object(
          'trigger_def', pg_get_triggerdef(pt.oid),
          'function_def', CASE WHEN pg_catalog.starts_with(action_statement, 'EXECUTE FUNCTION ') THEN pg_get_functiondef(RIGHT(action_statement, -17 )::regprocedure) ELSE '' END
          )) as triggers
      FROM  information_schema.triggers trg
      LEFT JOIN pg_catalog.pg_trigger pt
      ON trg.trigger_name = pt.tgname
      WHERE trg.trigger_schema = t.table_schema
        AND event_object_table = t.table_name 
      GROUP BY trigger_schema, event_object_table
    ) trg
      ON TRUE
    LEFT JOIN LATERAL (
      SELECT 
        conname,
        pg_get_constraintdef(c.oid) as definition,
        c.contype
      FROM
        pg_catalog.pg_constraint c
        INNER JOIN pg_catalog.pg_class rel ON rel.oid = c.conrelid
        INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = connamespace
      LEFT JOIN LATERAL (
        SELECT array_agg(column_name) as columns
        FROM information_schema.constraint_column_usage cu
        WHERE cu.constraint_name = c.conname
        GROUP BY table_schema, table_schema
      ) cu ON TRUE
      WHERE t.table_name = rel.relname
        AND t.table_schema = nsp.nspname
    ) con ON TRUE
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_strip_nulls(to_jsonb(c.*))) as indexes
      FROM (SELECT indexname, indexdef FROM pg_indexes)
      WHERE t.table_schema = schemaname 
      AND t.table_name = tablename
    ) idx ON TRUE
    WHERE ${tablesInCurrentSchemaFilter}
    ;`);

  return tablesAndColumns;
};
export type SchemaInfo = Awaited<ReturnType<typeof getSchemaForTableConfig>>;

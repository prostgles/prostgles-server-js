import { SQLResult, asName } from "prostgles-types";
import { omitKeys, tryCatchV2 } from "prostgles-types/dist/util";
import { DboBuilder } from "../DboBuilder/DboBuilder";
import { DBorTx } from "../Prostgles";
import { ProstglesInitOptions } from "../ProstglesTypes";
import { clone } from "../utils";
import { TableSchema, TableSchemaColumn } from "./DboBuilderTypes";
import { getFkeys } from "./getFkeys";
import { getMaterialViews } from "./getMaterialViews";

export const getSchemaFilter = (schema: ProstglesInitOptions["schemaFilter"] = { public: 1 }) => {
  const schemaNames = Object.keys(schema);
  const isInclusive = Object.values(schema).every((v) => v);
  if (!schemaNames.length) {
    throw "Must specify at least one schema";
  }

  return {
    sql: ` ${isInclusive ? "" : "NOT "}IN (\${schemaNames:csv})`,
    schemaNames,
  };
};

// TODO: Add a onSocketConnect timeout for this query.
//  Reason: this query gets blocked by prostgles.app_triggers from PubSubManager.addTrigger in some cases (pg_dump locks that table)
export async function getTablesForSchemaPostgresSQL(
  { db, runSQL }: Pick<DboBuilder, "db" | "runSQL">,
  schemaFilter: ProstglesInitOptions["schemaFilter"]
): Promise<{
  result: TableSchema[];
  durations: Record<string, number>;
}> {
  const { sql, schemaNames } = getSchemaFilter(schemaFilter);

  return db.tx(async (t) => {
    /**
     * Multiple queries to reduce load on low power machines
     */
    const {
      data: { fkeys },
      duration: fkeysResponseDuration,
    } = await getFkeys(t, { sql, schemaNames });

    const uniqueColsReq = await tryCatchV2(async () => {
      const res: {
        table_name: string;
        table_schema: string;
        index_name: string;
        column_names: string[];
      }[] = await t.any(`
        select
            t.relname as table_name,
            (SELECT pnm.nspname FROM pg_catalog.pg_namespace pnm WHERE pnm.oid =  i.relnamespace) as table_schema,
            i.relname as index_name,
            array_agg(a.attname)::_TEXT as column_names
        from
            pg_class t,
            pg_class i,
            pg_index ix,
            pg_attribute a
        where
            t.oid = ix.indrelid
            and i.oid = ix.indexrelid
            and a.attrelid = t.oid
            and a.attnum = ANY(ix.indkey)
            and t.relkind = 'r'
            and ix.indisunique
        group by 1,2,3
        order by
            t.relname,
            i.relname;
      `);

      return res;
    });

    if (uniqueColsReq.error) {
      throw uniqueColsReq.error;
    }

    const badFkey = fkeys.find((r) => r.fcols.find((fc) => typeof fc !== "string"));
    if (badFkey) {
      throw `Invalid table column schema. Null or empty fcols for ${JSON.stringify(fkeys)}`;
    }

    const getTVColumns = await tryCatchV2(async () => {
      const columnsWithNullProps = await t.manyOrNone<TableSchemaColumn & { table_oid: number }>(
        `
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
              ccc.character_maximum_length, 
              ccc.numeric_precision, 
              ccc.numeric_scale,
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
            , c.character_maximum_length
            , c.numeric_precision
            , c.numeric_scale
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
      `,
        { schemaNames }
      );

      const columns = columnsWithNullProps.map((col) => {
        (["character_maximum_length", "numeric_precision", "numeric_scale"] as const).forEach(
          (key) => {
            if (col[key] === null || col[key] === undefined) {
              delete col[key];
            }
          }
        );
        return col;
      });
      return { columns };
    });
    if (getTVColumns.error) {
      throw getTVColumns.error ?? "No columns";
    }

    const getViewParentTables = await tryCatchV2(async () => {
      const parent_tables = await t.manyOrNone<{ oid: number; table_names: string[] }>(`
        SELECT cl_r.oid, cl_r.relname as view_name, array_agg(DISTINCT cl_d.relname) AS table_names 
        FROM pg_rewrite AS r 
        JOIN pg_class AS cl_r ON r.ev_class = cl_r.oid 
        JOIN pg_depend AS d ON r.oid = d.objid 
        JOIN pg_class AS cl_d ON d.refobjid = cl_d.oid 
        WHERE cl_d.relkind IN ('r','v') 
        AND cl_d.relname <> cl_r.relname 
        GROUP BY cl_r.oid, cl_r.relname
      `);
      return { parent_tables };
    });
    const getTablesAndViews = await tryCatchV2(async () => {
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
      const tablesAndViews = (await t.any(query, { schemaNames })).map((table: TableSchema) => {
        table.columns = clone(getTVColumns.data!.columns)
          .filter((c) => c.table_oid === table.oid)
          .map((c) => omitKeys(c, ["table_oid"]));
        table.parent_tables =
          getViewParentTables.data?.parent_tables.find((vr) => vr.oid === table.oid)?.table_names ??
          [];
        return table;
      });
      return { tablesAndViews };
    });
    if (getTablesAndViews.error) {
      throw getTablesAndViews.error ?? "No tablesAndViews";
    }

    const getMaterialViewsReq = await tryCatchV2(async () => {
      const materialViews = await getMaterialViews(t, schemaFilter);
      return { materialViews };
    });
    if (getMaterialViewsReq.error) {
      throw getMaterialViewsReq.error ?? "No materialViews";
    }

    const getHyperTablesReq = await tryCatchV2(async () => {
      const hyperTables = await getHyperTables(t);
      return { hyperTables };
    });
    if (getHyperTablesReq.error) {
      console.error(getHyperTablesReq.error);
    }

    let result = getTablesAndViews.data!.tablesAndViews.concat(
      getMaterialViewsReq.data!.materialViews
    );
    result = await Promise.all(
      result.map(async (table) => {
        table.name = table.escaped_identifier;
        /** This is used to prevent bug of table schema not sent */
        const allowAllIfNoColumns = !table.columns.length ? true : undefined;
        table.privileges.select =
          allowAllIfNoColumns ?? table.columns.some((c) => c.privileges.SELECT);
        table.privileges.insert =
          allowAllIfNoColumns ?? table.columns.some((c) => c.privileges.INSERT);
        table.privileges.update =
          allowAllIfNoColumns ?? table.columns.some((c) => c.privileges.UPDATE);
        table.columns = table.columns.map((c) => {
          const refs = fkeys.filter((fc) => fc.oid === table.oid && fc.cols.includes(c.name));
          if (refs.length)
            c.references = refs.map((_ref) => {
              const ref = { ..._ref };
              //@ts-ignore
              delete ref.oid;
              return ref;
            });
          return c;
        });

        /** Get view reference cols (based on parent table) */
        let viewFCols: Pick<TableSchemaColumn, "name" | "references">[] = [];
        if (table.is_view && table.view_definition) {
          try {
            const view_definition =
              table.view_definition.endsWith(";") ?
                table.view_definition.slice(0, -1)
              : table.view_definition;
            const { fields } = (await runSQL(
              `SELECT * FROM \n ( ${view_definition} \n) t LIMIT 0`,
              {},
              {},
              undefined
            )) as SQLResult<undefined>;
            const ftables = result.filter((r) => fields.some((f) => f.tableID === r.oid));
            ftables.forEach((ft) => {
              const fFields = fields.filter((f) => f.tableID === ft.oid);
              const pkeys = ft.columns.filter((c) => c.is_pkey);
              const fFieldPK = fFields.filter((ff) => pkeys.some((p) => p.name === ff.columnName));
              const refCols =
                pkeys.length && fFieldPK.length === pkeys.length ?
                  fFieldPK
                : fFields.filter((ff) => !["json", "jsonb", "xml"].includes(ff.udt_name));
              const _fcols: typeof viewFCols = refCols.map((ff) => {
                const d: Pick<TableSchemaColumn, "name" | "references"> = {
                  name: ff.columnName!,
                  references: [
                    {
                      ftable: ft.name,
                      fcols: [ff.columnName!],
                      cols: [ff.name],
                    },
                  ],
                };
                return d;
              });
              viewFCols = [...viewFCols, ..._fcols];
            });
          } catch (err) {
            console.error(err);
          }
        }

        table.columns = table.columns.map((col) => {
          if (col.has_default) {
            /** Hide pkey default value */
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            col.column_default =
              (
                col.udt_name !== "uuid" &&
                !col.is_pkey &&
                !`${col.column_default}`.startsWith("nextval(")
              ) ?
                col.column_default
              : null;
          }

          const viewFCol = viewFCols.find((fc) => fc.name === col.name);
          if (viewFCol) {
            col.references = viewFCol.references;
          }

          return col;
        });
        table.isHyperTable = getHyperTablesReq.data!.hyperTables?.includes(table.name);

        table.uniqueColumnGroups = uniqueColsReq.data
          ?.filter((r) => r.table_name === table.name && r.table_schema === table.schema)
          .map((r) => r.column_names);

        return table;
      })
    );

    const res = {
      result,
      durations: {
        matv: getMaterialViewsReq.duration,
        columns: getTVColumns.duration,
        tablesAndViews: getTablesAndViews.duration,
        fkeys: fkeysResponseDuration,
        getHyperTbls: getHyperTablesReq.duration,
        viewParentTbls: getViewParentTables.duration,
      },
    };

    return res;
  });
}

/**
 * Used to check for Timescale Bug
 */
const getHyperTables = async (db: DBorTx): Promise<string[] | undefined> => {
  const schema = "_timescaledb_catalog";
  const res: {
    exists: boolean;
  } | null = await db.oneOrNone(
    "SELECT EXISTS( \
      SELECT * \
      FROM information_schema.tables \
      WHERE 1 = 1 \
          AND table_schema = ${schema} \
          AND table_name = 'hypertable' \
    );",
    { schema }
  );
  if (res?.exists) {
    const tables: { table_name: string }[] = await db.any(
      "SELECT table_name FROM " + asName(schema) + ".hypertable;"
    );
    return tables.map((t) => t.table_name);
  }
  return undefined;
};

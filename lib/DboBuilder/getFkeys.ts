import type pgPromise from "pg-promise";
import { tryCatchV2 } from "prostgles-types";
import type { getSchemaFilter } from "./getTablesForSchemaPostgresSQL";

export const getFkeys = async (
  t: pgPromise.ITask<{}>,
  { schemaNames, sql }: ReturnType<typeof getSchemaFilter>
) => {
  const getFkeys = await tryCatchV2(async () => {
    const fkeys: {
      oid: number;
      ftable: string;
      cols: string[];
      fcols: string[];
    }[] = await t.any(
      ` 
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
          , array_agg(c1.attname::text ORDER BY ordinality) as cols
          , array_agg(c2.attname::text ORDER BY ordinality) as fcols
        FROM pg_catalog.pg_constraint c
        INNER JOIN pg_class_schema pc
          ON confrelid = pc.oid
        CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY as key_pairs(attnum, fkattnum, ordinality)
        LEFT JOIN pg_attribute c1
          ON c1.attrelid = c.conrelid and c1.attnum = key_pairs.attnum
        LEFT JOIN pg_attribute c2
          ON c2.attrelid = c.confrelid and c2.attnum = key_pairs.fkattnum
        WHERE contype = 'f' 
        GROUP BY conrelid, conname, pc.escaped_identifier
      )
      SELECT * FROM fk
    `,
      { schemaNames }
    );

    return { fkeys };
  });
  if (getFkeys.hasError) {
    throw getFkeys.error;
  }

  return getFkeys;
};

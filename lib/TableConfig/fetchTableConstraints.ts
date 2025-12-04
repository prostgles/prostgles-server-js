import type pgPromise from "pg-promise";
import type { DB } from "../Prostgles";
import { asValue } from "../PubSubManager/PubSubManagerUtils";

export type PGConstraint = {
  name: string;
  table: string;
  type: "c" | "p" | "u" | "f";
  cols: Array<string>;
  definition: string;
  schema: string;
};
export const fetchTableConstraints = ({
  db,
  column,
  table,
  types,
}: ColConstraintsArgs): Promise<PGConstraint[]> => {
  return db.manyOrNone(getColConstraintsQuery({ column, table, types }));
};

type ColConstraintsArgs = {
  db: DB | pgPromise.ITask<{}>;
  table?: string;
  column?: string;
  types?: PGConstraint["type"][];
};
const getColConstraintsQuery = ({ column, table, types }: Omit<ColConstraintsArgs, "db">) => {
  let query = `
    SELECT *
    FROM (             
      SELECT distinct c.conname as name, c.contype as type,
        pg_get_constraintdef(c.oid) as definition, 
        nsp.nspname as schema,
      (SELECT r.relname from pg_class r where r.oid = c.conrelid) as "table", 
      (SELECT array_agg(attname::text) from pg_attribute 
      where attrelid = c.conrelid and ARRAY[attnum] <@ c.conkey) as cols
      -- (SELECT array_agg(attname::text) from pg_attribute 
      -- where attrelid = c.confrelid and ARRAY[attnum] <@ c.confkey) as fcols, 
      -- (SELECT r.relname from pg_class r where r.oid = c.confrelid) as ftable
      FROM pg_catalog.pg_constraint c
      INNER JOIN pg_catalog.pg_class rel
      ON rel.oid = c.conrelid
      INNER JOIN pg_catalog.pg_namespace nsp
      ON nsp.oid = connamespace
    ) t   
    WHERE TRUE 
  `;
  if (table) query += `\nAND "table" = ${asValue(table)}`;
  if (column) query += `\nAND cols @> ARRAY[${asValue(column)}]`;
  if (types?.length) query += `\nAND type IN (${types.map((v) => asValue(v)).join(", ")})`;
  return query;
};

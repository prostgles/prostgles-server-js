import pgPromise from "pg-promise";
import { asName } from "prostgles-types";
import { DB } from "../Prostgles";
import { asValue } from "../PubSubManager/PubSubManager";
import { TableConfig } from "./TableConfig";

type Args = {
  tableName: string;
  tableConf: TableConfig[string];
  // tableConf: BaseTableDefinition<LANG_IDS> & (TableDefinition<LANG_IDS> | LookupTableDefinition<LANG_IDS>)
};

export type ConstraintDef = {
  /**
   * Named constraints are used to show a relevant error message
   */
  name?: string;
  content: string;
  alterQuery: string;
};
export const getConstraintDefinitionQueries = ({
  tableConf,
  tableName,
}: Args): ConstraintDef[] | undefined => {
  if ("constraints" in tableConf && tableConf.constraints) {
    const { constraints } = tableConf;

    if (Array.isArray(constraints)) {
      return constraints.map((c) => ({
        content: c,
        alterQuery: `ALTER TABLE ${asName(tableName)} ADD ${c}`,
      }));
    } else {
      const constraintNames = Object.keys(constraints);
      return constraintNames.map((constraintName) => {
        const _cnstr = constraints[constraintName]!;
        const constraintDef =
          typeof _cnstr === "string" ? _cnstr : `${_cnstr.type} (${_cnstr.content})`;

        /** Drop constraints with the same name */
        // const existingConstraint = constraints.some(c => c.conname === constraintName);
        // if(existingConstraint){
        //   if(canDrop) queries.push(`ALTER TABLE ${asName(tableName)} DROP CONSTRAINT ${asName(constraintName)};`);
        // }

        const alterQuery = `ALTER TABLE ${asName(tableName)} ADD CONSTRAINT ${asName(constraintName)} ${constraintDef};`;

        return { name: constraintName, alterQuery, content: constraintDef };
      });
    }
  }
};

export type ColConstraint = {
  name: string;
  table: string;
  type: "c" | "p" | "u" | "f";
  cols: Array<string>;
  definition: string;
  schema: string;
};
type ColConstraintsArgs = {
  db: DB | pgPromise.ITask<{}>;
  table?: string;
  column?: string;
  types?: ColConstraint["type"][];
};
export const getColConstraintsQuery = ({
  column,
  table,
  types,
}: Omit<ColConstraintsArgs, "db">) => {
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
export const getColConstraints = ({
  db,
  column,
  table,
  types,
}: ColConstraintsArgs): Promise<ColConstraint[]> => {
  return db.manyOrNone(getColConstraintsQuery({ column, table, types }));
};

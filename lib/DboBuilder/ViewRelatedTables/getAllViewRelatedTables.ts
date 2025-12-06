import type { DBHandlerServer } from "../DboBuilder";

export const getAllViewRelatedTables = async (dbo: DBHandlerServer, viewName: string) => {
  const tables = await dbo.sql!(
    `
    SELECT DISTINCT 
        vcu.table_name, 
        vcu.table_schema,
        c.oid AS table_oid
    FROM information_schema.view_column_usage vcu
    JOIN pg_class c ON c.relname = vcu.table_name
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = vcu.table_schema
    WHERE vcu.view_name = \${viewName}
  `,
    { viewName },
    { returnType: "rows" }
  );

  return tables as {
    table_name: string;
    table_schema: string;
    table_oid: number;
  }[];
};

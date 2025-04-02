import { as } from "pg-promise";
import { isDefined } from "prostgles-types";
import { getFileManagerSchema } from "../FileManager/initFileManager";
import type { DB } from "../initProstgles";
import { getColumnDefinitionQuery } from "./getColumnDefinitionQuery";
import { getConstraintDefinitionQueries } from "./getConstraintDefinitionQueries";
import { tableConfigWithMigrations, type SchemaRelatedOptions } from "./getCreateSchemaQueries";
import type { TableConfig } from "./TableConfig";
import { getSchemaUtils } from "./tableConfigSchemaUtils";

export const getTableConfigSchemaQueries = async (
  opts: SchemaRelatedOptions,
  { asName, db }: Pick<Awaited<ReturnType<typeof getSchemaUtils>>, "asName" | "db">
) => {
  const fileTableSchema = getFileManagerSchema(opts);
  const fileTableSchemaQuery = fileTableSchema?.queries.join("\n") ?? "";
  const migrations = await tableConfigWithMigrations(db, opts, fileTableSchemaQuery);

  const config: TableConfig = migrations.config ?? {};

  const uniqueColumnAndTableNames = Array.from(
    new Set(
      Object.entries(config).flatMap(([tname, tableConf]) => {
        if ("columns" in tableConf && tableConf.columns) {
          return [tname, ...Object.keys(tableConf.columns)];
        }
        return [tname];
      })
    )
  );

  /** Avoid using double quotes when not required to ensure the jsonb validation checks do not include unnecessary quotes */
  const { escapedTableNameMapObj } = await db.one<{
    escapedTableNameMapObj: Record<string, string>;
  }>(
    `
    SELECT jsonb_object_agg(tblname, quote_ident(tblname)) as "escapedTableNameMapObj"
    FROM unnest(ARRAY[\${keys:csv}]) as tblname
    `,
    { keys: uniqueColumnAndTableNames.concat("prevent_empty_array_error") }
  );

  let triggerQueries: string[] = [];
  let constraintQueries: string[] = [];
  let indexQueries: string[] = [];
  let tableQueries: string[] = [];
  const tableDefs: Record<string, Record<string, string>> = {};
  for (const [tableNameRaw, tableConf] of Object.entries(config)) {
    const tableName = escapedTableNameMapObj[tableNameRaw] || asName(tableNameRaw);
    triggerQueries = [...triggerQueries, ...getTriggerQueries(tableName, tableConf, asName)];
    constraintQueries = [...constraintQueries, ...getConstraintQueries(tableName, tableConf)];
    indexQueries = [...indexQueries, ...getIndexQueries(tableName, tableConf, asName)];
    const _tableQueries = await getTableQueries(
      tableName,
      tableConf,
      asName,
      escapedTableNameMapObj,
      db
    );
    if (_tableQueries) {
      tableQueries = [...tableQueries, ..._tableQueries.queries];
      tableDefs[tableName] = _tableQueries.colDefs;
    }
  }

  const dropTableQueries = Object.entries(config)
    .flatMap(([tableNameRaw, tableConf]) => {
      const tableName = escapedTableNameMapObj[tableNameRaw] || asName(tableNameRaw);
      if (tableConf.dropIfExists) {
        return [`DROP TABLE IF EXISTS ${tableName};`];
      }
      if (tableConf.dropIfExistsCascade) {
        return [`DROP TABLE IF EXISTS ${tableName} CASCADE;`];
      }
    })
    .filter(isDefined);

  return {
    dropTableQueries,
    fileTableSchemaQuery,
    tableQueries,
    constraintQueries,
    indexQueries,
    triggerQueries,
    tableDefs,
    ...migrations,
  };
};
const getTableQueries = async (
  tableName: string,
  tableConf: TableConfig[string],
  asName: (v: string) => string,
  escapedTableNameMapObj: Record<string, string>,
  db: DB
) => {
  if ("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable.values).length) {
    const { isLookupTable } = tableConf;

    const rows: Record<string, string | number>[] = Object.entries(isLookupTable.values).map(
      ([id, otherColumns]) => ({
        id,
        ...otherColumns,
      })
    );

    const allColumns = Object.keys(rows[0]!);
    const nonIdColumns = allColumns.filter((k) => k !== "id");
    const colDefs: Record<string, string> = {
      id: "TEXT PRIMARY KEY",
      ...nonIdColumns.reduce((acc, k) => ({ ...acc, [k]: "TEXT" }), {}),
    };
    const createQuery = [
      `CREATE TABLE ${tableName} (`,
      Object.entries(colDefs)
        .map(([col, def]) => `${col} ${def}`)
        .join(",\n "),
      `);`,
    ].join("\n");

    const dataQuerys = rows.map((row) => {
      const values = allColumns.map((key) => row[key]);
      return as.format(
        `INSERT INTO ${tableName}  (${allColumns.map((t) => asName(t)).join(", ")})  ` +
          " VALUES (${values:csv}) ON CONFLICT DO NOTHING;",
        { values }
      );
    });
    const queries = [createQuery, ...dataQuerys];
    return {
      queries,
      colDefs,
    };
  } else if ("columns" in tableConf && tableConf.columns) {
    const { columns } = tableConf;
    const colDefs: Record<string, string> = {};
    for (const [column, colConf] of Object.entries(columns)) {
      const escapedColumnName = escapedTableNameMapObj[column];
      const colDef = await getColumnDefinitionQuery({
        column,
        escapedColumnName,
        colConf,
        db,
        table: tableName,
      });
      if (colDef) {
        colDefs[escapedColumnName ?? column] = colDef;
      }
    }
    const colSection = Object.entries(colDefs)
      .map(([col, def]) => `${col} ${def}`)
      .join(",\n ");
    const queries = [[`CREATE TABLE ${tableName} (`, colSection, `);`].join("\n")];
    return { queries, colDefs };
  }
};

const getConstraintQueries = (tableName: string, tableConf: TableConfig[string]) => {
  if ("constraints" in tableConf) {
    return (
      getConstraintDefinitionQueries({
        tableConf,
        tableName,
      })?.map((c) => c.alterQuery) ?? []
    );
  }
  return [];
};

const getIndexQueries = (
  tableName: string,
  tableConf: TableConfig[string],
  asName: (v: string) => string
) => {
  if ("indexes" in tableConf && tableConf.indexes) {
    /*
      CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] [ [ IF NOT EXISTS ] name ] ON [ ONLY ] table_name [ USING method ]
        ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass [ ( opclass_parameter = value [, ... ] ) ] ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
        [ INCLUDE ( column_name [, ...] ) ]
        [ NULLS [ NOT ] DISTINCT ]
        [ WITH ( storage_parameter [= value] [, ... ] ) ]
        [ TABLESPACE tablespace_name ]
        [ WHERE predicate ]
    */
    return Object.entries(tableConf.indexes).flatMap(
      ([indexName, { columns, concurrently, replace, unique, using, where = "" }]) => {
        const query =
          [
            "CREATE",
            unique && "UNIQUE",
            concurrently && "CONCURRENTLY",
            `INDEX ${asName(indexName)} ON ${tableName}`,
            using && "USING " + using,
            `(${columns})`,
            where && `WHERE ${where}`,
          ]
            .filter((v) => v)
            .join(" ") + ";";
        if (replace || (typeof replace !== "boolean" && tableConf.replaceUniqueIndexes)) {
          return [`DROP INDEX IF EXISTS ${asName(indexName)};`, query];
        }
        return [query];
      }
    );
  }
  return [];
};
const getTriggerQueries = (
  tableName: string,
  tableConfig: TableConfig[string],
  asName: (v: string) => string
) => {
  const { triggers } = tableConfig;
  if (!triggers) return [];
  return Object.entries(triggers).flatMap(([triggerFuncName, trigger]) => {
    const funcNameParsed = asName(triggerFuncName);
    const queries: string[] = [
      `
        CREATE OR REPLACE FUNCTION ${funcNameParsed}()
          RETURNS trigger
          LANGUAGE plpgsql
        AS
        $$

          ${trigger.query}
        
        $$;
      `,
    ];

    trigger.actions.forEach((action) => {
      const triggerActionName = triggerFuncName + "_" + action;

      const triggerActionNameParsed = asName(triggerActionName);

      const newTableName = action !== "delete" ? "NEW TABLE AS new_table" : "";
      const oldTableName = action !== "insert" ? "OLD TABLE AS old_table" : "";
      const transitionTables =
        trigger.forEach === "row" ? "" : `REFERENCING ${newTableName} ${oldTableName}`;
      queries.push(`
          CREATE TRIGGER ${triggerActionNameParsed}
          ${trigger.type} ${action} ON ${tableName}
          ${transitionTables}
          FOR EACH ${trigger.forEach}
          EXECUTE PROCEDURE ${funcNameParsed}();
        `);
    });
    return queries;
  });
};

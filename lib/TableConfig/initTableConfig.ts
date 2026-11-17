import { asName as _asName, getSerialisableError, type AnyObject } from "prostgles-types";
import {
  asValue,
  EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID,
  log,
} from "../PubSubManager/PubSubManagerUtils";
import type { OnReadyCallbackBasic } from "../initProstgles";
import { fetchTableConstraints } from "./fetchTableConstraints";
import { getConstraintDefinitionQueries } from "./getConstraintDefinitionQueries";
import { getFutureTableSchema } from "./getFutureTableSchema";
import { getTableColumnQueries } from "./getTableColumnQueries";
import { getIndexesQueries } from "./indexes/getIndexesQueries";
import type { DBorTx } from "../Prostgles";
import { getTableColumns } from "./getColumnSQLDefinitionQuery";
import type { TableConfigurator } from "./TableConfigurator";
import { getTableCheckBranches, getTableCheckConstraint } from "./getTableCheck";

export const initTableConfig = async function (this: TableConfigurator, db: DBorTx = this.db) {
  this.initialising = true;

  let changedSchema = false;
  const failedQueries: { query: string; error: any }[] = [];
  const queryHistory: string[] = [];
  let queries: string[] = [];
  const foreignKeyQueries: string[] = [];
  const makeQuery = (q: string[]) =>
    q
      .filter((v) => v.trim().length)
      .map((v) => (v.trim().endsWith(";") ? v : `${v};`))
      .join("\n");
  const runQueries = async (_queries = queries) => {
    let q = makeQuery(queries);
    if (!_queries.some((q) => q.trim().length)) {
      return 0;
    }
    q = `/* ${EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */ \n\n` + q;
    queryHistory.push(q);
    await this.prostgles.opts.onLog?.({
      type: "debug",
      command: "TableConfig.runQueries.start",
      data: { q },
      duration: -1,
    });
    const now = Date.now();
    console.warn("Running queries: ", q);
    await db.multi(q).catch((err) => {
      /* Keep the offending key in the schema initialization error. */
      if (err.code === "23503" && err.detail) err.message += `\n${err.detail}`;
      log({ err, q });
      failedQueries.push({ query: q, error: err });
      return Promise.reject(err);
    });
    await this.prostgles.opts.onLog?.({
      type: "debug",
      command: "TableConfig.runQueries.end",
      duration: Date.now() - now,
      data: { q },
    });
    changedSchema = true;
    _queries = [];
    queries = [];
    return 1;
  };

  if (!this.prostgles.pgp) {
    throw "pgp missing";
  }

  const MAX_IDENTIFIER_LENGTH = +(
    await db.one<{ max_identifier_length: number }>("SHOW max_identifier_length;")
  ).max_identifier_length;
  if (!Number.isFinite(MAX_IDENTIFIER_LENGTH)) {
    throw `Could not obtain a valid max_identifier_length`;
  }
  const asName = (v: string) => {
    if (v.length > MAX_IDENTIFIER_LENGTH) {
      throw `The identifier name provided (${v}) is longer than the allowed limit (max_identifier_length = ${MAX_IDENTIFIER_LENGTH} characters )\n Longest allowed: ${_asName(v.slice(0, MAX_IDENTIFIER_LENGTH))} `;
    }

    return _asName(v);
  };

  /* Create lookup tables */
  for (const [tableNameRaw, tableConf] of Object.entries(this.config)) {
    const tableName = asName(tableNameRaw);

    if ("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable.values).length) {
      const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
      const isDropped = dropIfExists || dropIfExistsCascade;

      if (dropIfExistsCascade) {
        queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
      } else if (dropIfExists) {
        queries.push(`DROP TABLE IF EXISTS ${tableName};`);
      }

      type LookupTableRowId = { id: string };
      const rows: (LookupTableRowId & { [column: string]: string })[] = Object.entries(
        tableConf.isLookupTable.values,
      ).map(([id, otherColumns]) => ({
        id,
        ...otherColumns,
      }));
      const lookupTableExists = await getTableExists(db, tableNameRaw);
      const lookupColumns =
        lookupTableExists ? await getTableColumns({ db, table: tableNameRaw }) : [];
      const [firstRow] = rows;
      if (!firstRow) {
        throw new Error(`Lookup table values are empty: ${tableName}`);
      }
      const columnNames = Object.keys(firstRow).filter(
        (k) => k !== ("id" satisfies keyof LookupTableRowId),
      );
      const addedColumns =
        !isDropped && lookupTableExists ?
          columnNames.filter((name) => !lookupColumns.some((column) => column.column_name === name))
        : [];
      if (addedColumns.length) {
        queries.push(
          `ALTER TABLE ${tableName} ${addedColumns.map((name) => `ADD COLUMN ${asName(name)} TEXT`).join(", ")};`,
        );
        for (const row of rows) {
          queries.push(
            `UPDATE ${tableName} 
            SET ${addedColumns.map((name) => `${asName(name)} = ${asValue(row[name])}`).join(", ")} 
            WHERE id = ${asValue(row.id)};`,
          );
        }
      }
      if (isDropped || !lookupTableExists) {
        queries.push(
          `CREATE TABLE IF NOT EXISTS ${tableName} (
            id  TEXT PRIMARY KEY
            ${columnNames.length ? ", " + columnNames.map((k) => asName(k) + " TEXT ").join(", ") : ""}
          );`,
        );
      }
      if (rows.length) {
        const existingValues: { id: any }[] =
          !lookupTableExists ?
            []
          : await db.any(
              `SELECT id FROM ${tableName} WHERE id IN (${rows.map((r) => asValue(r.id)).join(", ")});`,
            );
        rows
          .filter((r) => !existingValues.some((ev) => ev.id === r.id))
          .map((row) => {
            const allColumns = ["id", ...columnNames];
            const values = allColumns.map((key) => (row as any)[key]);
            if (!this.prostgles.pgp) throw new Error("Database connection is not initialized");
            queries.push(
              this.prostgles.pgp.as.format(
                `INSERT INTO ${tableName}  (${allColumns.map((t) => asName(t)).join(", ")})  ` +
                  " VALUES (${values:csv}) ON CONFLICT DO NOTHING;",
                { values },
              ),
            );
          });
      }
    }
  }

  if (queries.length) {
    await runQueries(queries);
  }

  /* Create/Alter columns */
  for (const [tableName, tableConf] of Object.entries(this.config)) {
    const tableExists = await getTableExists(db, tableName);
    const ALTER_TABLE_Q = `ALTER TABLE ${asName(tableName)}`;

    if (tableExists || ("check" in tableConf && tableConf.check !== undefined)) {
      // Table introspection may reference tables queued earlier in this config.
      await runQueries();
    }

    /* isLookupTable table has already been created */
    const tableColumnDefinition =
      "isLookupTable" in tableConf ? undefined : (
        await getTableColumnQueries({
          db,
          tableConf,
          tableExists,
          tableName,
        })
      );

    if (tableColumnDefinition) {
      queries.push(tableColumnDefinition.fullQuery);
    }

    /** CONSTRAINTS */
    const constraintDefs =
      getConstraintDefinitionQueries({
        tableName,
        tableConf,
      }) ?? [];
    if ("check" in tableConf && tableConf.check !== undefined) {
      if (!tableColumnDefinition)
        throw new Error(`tableConfig.check requires columns for ${tableName}`);
      // Let PostgreSQL determine types and nullability from the SQL column definitions.
      const { cols } = await getFutureTableSchema({
        db,
        tableName,
        columnDefs: tableColumnDefinition.columnDefs,
        constraintDefs,
      });
      const branches = getTableCheckBranches(
        tableConf.check,
        cols.map((c) => ({
          name: c.column_name,
          nullable: c.nullable,
          udt_name: c.udt_name,
        })),
      );
      const constraint = getTableCheckConstraint(tableName, branches);
      if (constraintDefs.some((c) => c.name === constraint.name)) {
        throw new Error(`Constraint ${constraint.name} is reserved for tableConfig.check`);
      }
      constraintDefs.push(constraint);
    }
    if (tableColumnDefinition?.isCreate) {
      /* Defer foreign keys until tables defined later in the config have been created. */
      for (const constraint of constraintDefs) {
        const targetQueries =
          constraint.content.trim().toUpperCase().startsWith("FOREIGN KEY") ?
            foreignKeyQueries
          : queries;
        targetQueries.push(constraint.alterQuery);
      }
    } else if (tableColumnDefinition) {
      const fullSchema = await getFutureTableSchema({
        db,
        tableName,
        columnDefs: tableColumnDefinition.columnDefs,
        constraintDefs,
      });
      const futureCons = fullSchema.constraints.map((nc) => ({
        ...nc,
        isNamed: constraintDefs.some((c) => c.name === nc.name),
      }));

      let currCons = await fetchTableConstraints({
        db,
        table: tableName,
      });

      /* Drop obsolete constraints before changing the types of their columns. */
      currCons.forEach((c) => {
        if (
          !futureCons.some(
            (nc) => nc.definition === c.definition && (!nc.isNamed || nc.name === c.name),
          )
        ) {
          queries.unshift(`${ALTER_TABLE_Q} DROP CONSTRAINT ${asName(c.name)};`);
        }
      });

      /* ADD COLUMN can create inline constraints. Read those back before adding more. */
      if (tableColumnDefinition.newColumnDefs.length) {
        await runQueries();
        currCons = await fetchTableConstraints({ db, table: tableName });
      }

      /** Add missing named constraints */
      constraintDefs.forEach((c) => {
        if (!c.name) return;
        const fc = futureCons.find((nc) => nc.name === c.name);
        if (fc && !currCons.some((cc) => cc.name === c.name && cc.definition === fc.definition)) {
          queries.push(`${ALTER_TABLE_Q} ADD CONSTRAINT ${asName(c.name)} ${c.content};`);
        }
      });

      /** Add remaining missing constraints */
      futureCons
        .filter((nc) => !nc.isNamed && !currCons.some((c) => c.definition === nc.definition))
        .forEach((c) => {
          queries.push(`${ALTER_TABLE_Q} ADD ${c.definition};`);
        });
      if (tableColumnDefinition.fullQuery) await runQueries();
    }

    const indexQueries = await getIndexesQueries(db, tableName, tableConf);
    queries.push(...indexQueries);
  }

  /* Referenced tables must exist before adding foreign keys to new tables. */
  queries.push(...foreignKeyQueries);
  if (queries.length) {
    const q = makeQuery(queries);

    try {
      await runQueries(queries);
    } catch (errRaw: any) {
      const err = errRaw as AnyObject;
      this.initialising = false;

      console.error("TableConfig error: ", err);
      if (err.position) {
        const pos = +err.position;
        if (Number.isInteger(pos)) {
          return Promise.reject(
            JSON.stringify(getSerialisableError(err)) + "\n At:" + q.slice(pos - 50, pos + 50),
          );
        }
      }

      return Promise.reject(err);
    }
  }

  if (db !== this.db) return queryHistory;
  this.initialising = false;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (changedSchema && !failedQueries.length && !this.prostgles.opts.audit) {
    if (!this.prevInitQueryHistory) {
      this.prevInitQueryHistory = queryHistory;
    } else if (this.prevInitQueryHistory.join() !== queryHistory.join()) {
      void this.prostgles.init(this.prostgles.opts.onReady as OnReadyCallbackBasic, {
        type: "TableConfig",
      });
    } else {
      console.error("TableConfig loop bug", queryHistory);
    }
  }
  if (failedQueries.length) {
    console.error("Table config failed queries: ", failedQueries);
  }

  await this.prostgles.rebuildDBO();
  return queryHistory;
};

const getTableExists = async (db: DBorTx, tableName: string) =>
  (
    await db.one<{ exists: boolean }>("SELECT to_regclass(quote_ident($1)) IS NOT NULL AS exists", [
      tableName,
    ])
  ).exists;

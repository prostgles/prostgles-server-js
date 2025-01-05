import { asName as _asName } from "prostgles-types";
import { PubSubManager, asValue, log } from "../PubSubManager/PubSubManager";
import TableConfigurator from "./TableConfig";
import {
  getColConstraints,
  getConstraintDefinitionQueries,
} from "./getConstraintDefinitionQueries";
import { getFutureTableSchema } from "./getFutureTableSchema";
import { getTableColumnQueries } from "./getTableColumnQueries";
import { getPGIndexes } from "./getPGIndexes";

export const initTableConfig = async function (this: TableConfigurator<any>) {
  let changedSchema = false;
  const failedQueries: { query: string; error: any }[] = [];
  this.initialising = true;
  const queryHistory: string[] = [];
  let queries: string[] = [];
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
    q = `/* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */ \n\n` + q;
    queryHistory.push(q);
    await this.prostgles.opts.onLog?.({
      type: "debug",
      command: "TableConfig.runQueries.start",
      data: { q },
      duration: -1,
    });
    const now = Date.now();
    await this.db.multi(q).catch((err) => {
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

  const MAX_IDENTIFIER_LENGTH = +((await this.db.one("SHOW max_identifier_length;")) as any)
    .max_identifier_length;
  if (!Number.isFinite(MAX_IDENTIFIER_LENGTH))
    throw `Could not obtain a valid max_identifier_length`;
  const asName = (v: string) => {
    if (v.length > MAX_IDENTIFIER_LENGTH - 1) {
      throw `The identifier name provided (${v}) is longer than the allowed limit (max_identifier_length - 1 = ${MAX_IDENTIFIER_LENGTH - 1} characters )\n Longest allowed: ${_asName(v.slice(0, MAX_IDENTIFIER_LENGTH - 1))} `;
    }

    return _asName(v);
  };

  let migrations: { version: number; table: string } | undefined;
  if (this.prostgles.opts.tableConfigMigrations) {
    const {
      onMigrate,
      version,
      versionTableName = "schema_version",
    } = this.prostgles.opts.tableConfigMigrations;
    await this.db.any(`
      /* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */
      CREATE TABLE IF NOT EXISTS ${asName(versionTableName)}(id NUMERIC PRIMARY KEY, table_config JSONB NOT NULL)
    `);
    migrations = { version, table: versionTableName };
    const maxVersion = +(
      await this.db.oneOrNone(`SELECT MAX(id) as v FROM ${asName(versionTableName)}`)
    ).v;
    const latestVersion = Number.isFinite(maxVersion) ? maxVersion : undefined;

    if (latestVersion === version) {
      const isLatest = (
        await this.db.oneOrNone(
          `SELECT table_config = \${table_config} as v FROM ${asName(versionTableName)} WHERE id = \${version}`,
          { version, table_config: this.config }
        )
      ).v;
      if (isLatest) {
        /**
         * If the table config is the same as the latest version then we can skip all schema checks and changes
         */
        return;
      }
    }
    if (latestVersion !== undefined && latestVersion < version) {
      await onMigrate({
        db: this.db,
        oldVersion: latestVersion,
        getConstraints: (table, col, types) =>
          getColConstraints({ db: this.db, table, column: col, types }),
      });
    }
  }

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

      const rows = Object.entries(tableConf.isLookupTable.values).map(([id, otherColumns]) => ({
        id,
        ...otherColumns,
      }));
      const lookupTableHandler = this.dbo[tableNameRaw];
      const columnNames = Object.keys(rows[0]!).filter((k) => k !== "id");
      if (isDropped || !lookupTableHandler) {
        queries.push(
          `CREATE TABLE IF NOT EXISTS ${tableName} (
            id  TEXT PRIMARY KEY
            ${columnNames.length ? ", " + columnNames.map((k) => asName(k) + " TEXT ").join(", ") : ""}
          );`
        );
      }
      if (rows.length) {
        const existingValues: { id: any }[] =
          !lookupTableHandler ?
            []
          : await this.db.any(
              `SELECT id FROM ${tableName} WHERE id IN (${rows.map((r) => asValue(r.id)).join(", ")});`
            );
        rows
          .filter((r) => !existingValues.some((ev) => ev.id === r.id))
          .map((row) => {
            const allColumns = ["id", ...columnNames];
            const values = allColumns.map((key) => (row as any)[key]);
            queries.push(
              this.prostgles.pgp!.as.format(
                `INSERT INTO ${tableName}  (${allColumns.map((t) => asName(t)).join(", ")})  ` +
                  " VALUES (${values:csv});",
                { values }
              )
            );
          });
      }
    }
  }

  if (queries.length) {
    await runQueries(queries);
    await this.prostgles.refreshDBO();
  }

  /* Create/Alter columns */
  for (const [tableName, tableConf] of Object.entries(this.config)) {
    const tableHandler = this.dbo[tableName];

    const ALTER_TABLE_Q = `ALTER TABLE ${asName(tableName)}`;

    /* isLookupTable table has already been created */
    const coldef =
      "isLookupTable" in tableConf ? undefined : (
        await getTableColumnQueries({
          db: this.db,
          tableConf,
          tableHandler,
          tableName,
        })
      );

    if (coldef) {
      queries.push(coldef.fullQuery);
    }

    /** CONSTRAINTS */
    const constraintDefs = getConstraintDefinitionQueries({
      tableName,
      tableConf,
    });
    if (coldef?.isCreate) {
      queries.push(...(constraintDefs?.map((c) => c.alterQuery) ?? []));
    } else if (coldef) {
      const fullSchema = await getFutureTableSchema({
        db: this.db,
        tableName,
        columnDefs: coldef.columnDefs,
        constraintDefs,
      });
      const futureCons = fullSchema.constraints.map((nc) => ({
        ...nc,
        isNamed: constraintDefs?.some((c) => c.name === nc.name),
      }));

      /** Run this first to ensure any dropped cols drop their constraints as well */
      await runQueries(queries);
      const currCons = await getColConstraints({
        db: this.db,
        table: tableName,
      });

      /** Drop removed/modified */
      currCons.forEach((c) => {
        if (
          !futureCons.some(
            (nc) => nc.definition === c.definition && (!nc.isNamed || nc.name === c.name)
          )
        ) {
          queries.push(`${ALTER_TABLE_Q} DROP CONSTRAINT ${asName(c.name)};`);
        }
      });

      /** Add missing named constraints */
      constraintDefs?.forEach((c) => {
        if (c.name && !currCons.some((cc) => cc.name === c.name)) {
          const fc = futureCons.find((nc) => nc.name === c.name);
          if (fc) {
            queries.push(`${ALTER_TABLE_Q} ADD CONSTRAINT ${asName(c.name)} ${c.content};`);
          }
        }
      });

      /** Add remaining missing constraints */
      futureCons
        .filter((nc) => !currCons.some((c) => c.definition === nc.definition))
        .forEach((c) => {
          queries.push(`${ALTER_TABLE_Q} ADD ${c.definition};`);
        });
    }

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
      const currIndexes = await getPGIndexes(this.db, tableName, "public");
      Object.entries(tableConf.indexes).forEach(
        ([indexName, { columns, concurrently, replace, unique, using, where = "" }]) => {
          if (replace || (typeof replace !== "boolean" && tableConf.replaceUniqueIndexes)) {
            queries.push(`DROP INDEX IF EXISTS ${asName(indexName)};`);
          }
          if (!currIndexes.some((idx) => idx.indexname === indexName)) {
            queries.push(
              [
                "CREATE",
                unique && "UNIQUE",
                concurrently && "CONCURRENTLY",
                `INDEX ${asName(indexName)} ON ${asName(tableName)}`,
                using && "USING " + using,
                `(${columns})`,
                where && `WHERE ${where}`,
              ]
                .filter((v) => v)
                .join(" ") + ";"
            );
          }
        }
      );
    }

    const { triggers, dropIfExists, dropIfExistsCascade } = tableConf;
    if (triggers) {
      const isDropped = dropIfExists || dropIfExistsCascade;

      const existingTriggers = (await this.dbo.sql!(
        `
            SELECT event_object_table
              ,trigger_name
            FROM  information_schema.triggers
            WHERE event_object_table = \${tableName}
            ORDER BY event_object_table
          `,
        { tableName },
        { returnType: "rows" }
      )) as { trigger_name: string }[];

      // const existingTriggerFuncs = await this.dbo.sql!(`
      //   SELECT p.oid,proname,prosrc,u.usename
      //   FROM  pg_proc p
      //   JOIN  pg_user u ON u.usesysid = p.proowner
      //   WHERE prorettype = 2279;
      // `, {}, { returnType: "rows" }) as { proname: string }[];

      Object.entries(triggers).forEach(([triggerFuncName, trigger]) => {
        const funcNameParsed = asName(triggerFuncName);

        let addedFunc = false;
        const addFuncDef = () => {
          if (addedFunc) return;
          addedFunc = true;
          queries.push(`
              CREATE OR REPLACE FUNCTION ${funcNameParsed}()
                RETURNS trigger
                LANGUAGE plpgsql
              AS
              $$
  
              ${trigger.query}
              
              $$;
            `);
        };

        trigger.actions.forEach((action) => {
          const triggerActionName = triggerFuncName + "_" + action;

          const triggerActionNameParsed = asName(triggerActionName);
          if (isDropped) {
            queries.push(`DROP TRIGGER IF EXISTS ${triggerActionNameParsed} ON ${tableName};`);
          }

          if (isDropped || !existingTriggers.some((t) => t.trigger_name === triggerActionName)) {
            addFuncDef();
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
          }
        });
      });
    }
  }

  if (queries.length) {
    const q = makeQuery(queries);

    try {
      await runQueries(queries);
    } catch (err: any) {
      this.initialising = false;

      console.error("TableConfig error: ", err);
      if (err.position) {
        const pos = +err.position;
        if (Number.isInteger(pos)) {
          return Promise.reject(err.toString() + "\n At:" + q.slice(pos - 50, pos + 50));
        }
      }

      return Promise.reject(err);
    }
  }

  if (migrations) {
    await this.db.any(
      `INSERT INTO ${migrations.table}(id, table_config) VALUES (${asValue(migrations.version)}, ${asValue(this.config)}) ON CONFLICT DO NOTHING;`
    );
  }
  this.initialising = false;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (changedSchema && !failedQueries.length) {
    if (!this.prevInitQueryHistory) {
      this.prevInitQueryHistory = queryHistory;
    } else if (this.prevInitQueryHistory.join() !== queryHistory.join()) {
      void this.prostgles.init(this.prostgles.opts.onReady as any, {
        type: "TableConfig",
      });
    } else {
      console.error("TableConfig loop bug", queryHistory);
    }
  }
  if (failedQueries.length) {
    console.error("Table config failed queries: ", failedQueries);
  }

  await this.prostgles.refreshDBO();
  await this.setTableOnMounts();
};

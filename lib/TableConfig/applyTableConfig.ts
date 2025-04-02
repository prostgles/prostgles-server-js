import type { ProstglesError } from "prostgles-types";
import { type Prostgles } from "../Prostgles";
import { PubSubManager } from "../PubSubManager/PubSubManager";
import { getSchemaDiffQueries } from "./getSchemaDiffQueries";
import { getSchemaForTableConfig } from "./getSchemaForTableConfig";
import { getTableConfigSchemaQueries } from "./getTableConfigSchemaQueries";
import { getQueryErrorPositionInfo, runSQLFile } from "./runSQLFile";
import { getSchemaUtils } from "./tableConfigSchemaUtils";

/**
 * Given these prostgles options that affect the schema:
 *   - tableConfig
 *   - fileTable
 *
 * Run sql init file and Apply (or return) the necessary changes to the db to bring the schema to this config
 *
 * If tableConfigMigrations is provided:
 *  - Check if the schema version table exists and already contains the current version of schema options
 *    or
 *  - Create schema version table,
 *
 * Sequence:
 * 1. execute initSql
 * 2. execute dropTableQueries
 * 3. get current schema
 * 4. get desired schema
 * 5. if did not migrate prepend migration to the patching transaction
 * 6. apply any patches
 * 7. Update schema version
 */

export const applyTableConfig = async (prostgles: Prostgles, commit = false) => {
  const NO_RELOAD = `/* ${PubSubManager.EXCLUDE_QUERY_FROM_SCHEMA_WATCH_ID} */ \n\n`;
  const utils = await getSchemaUtils(prostgles);
  const { db } = utils;
  const { fileTable, tableConfig, tableConfigMigrations, onLog, sqlFilePath } = prostgles.opts;
  const createSchemaQ = await getTableConfigSchemaQueries(
    { fileTable, tableConfig, tableConfigMigrations, sqlFilePath, onLog },
    utils
  );

  /**
   * Executed every time
   */
  await runSQLFile(prostgles);

  /**
   * For development purposes, each table config allows dropping it on startup.
   * This means that irrespective of the current schema versions, we will drop those tables and recreate them.
   */
  if (createSchemaQ.dropTableQueries.length) {
    await utils.db.multi([NO_RELOAD, ...createSchemaQ.dropTableQueries].join("\n"));
  } else if (!createSchemaQ.migrate?.schemaIsUpToDate) {
    return;
  }

  /**
   * Get desired schema details and patches
   */
  const { configSchema, patchQueries, currentSchema } = await db.tx(async (t) => {
    await createSchemaQ.migrate?.runMigration?.(t);

    const currentSchema = await getSchemaForTableConfig(t);
    /**
     * To work out what is the exact desired schema we:
     *  1) drop all the existing tables first
     *  2) apply the desired schema
     */
    const dropTablesQ = `DROP TABLE IF EXISTS ${currentSchema.map((t) => t.table_ident).join(", ")} CASCADE;`;
    await t
      .multi(
        [
          dropTablesQ,
          ...createSchemaQ.tableQueries,
          ...createSchemaQ.fileTableSchemaQuery,
          ...createSchemaQ.indexQueries,
          ...createSchemaQ.constraintQueries,
          ...createSchemaQ.triggerQueries,
        ].join("\n")
      )
      .catch((err) => {
        console.error(getQueryErrorPositionInfo(err as ProstglesError));
        return Promise.reject(err);
      });
    const configSchema = await getSchemaForTableConfig(t);
    const patchQueries = getSchemaDiffQueries({
      oldSchema: currentSchema,
      newSchema: configSchema,
      newSchemaTableDefinitions: createSchemaQ.tableDefs,
    });
    await t.any("ROLLBACK");
    return { patchQueries, configSchema, currentSchema };
  });

  if (!patchQueries.length) {
    return;
  }

  /**
   * Apply patches
   */
  await db.tx(async (t) => {
    const migrationEnd = await createSchemaQ.migrate?.runMigration?.(t);
    await t.multi([NO_RELOAD, ...patchQueries].join("\n"));
    const patchedSchema = await getSchemaForTableConfig(t);
    const patchedSchemaPatch = getSchemaDiffQueries({
      oldSchema: configSchema,
      newSchema: patchedSchema,
      newSchemaTableDefinitions: createSchemaQ.tableDefs,
    });
    if (patchedSchemaPatch.length) {
      throw "Patched schema does not match the expected schema";
    }
    if (!commit) {
      await t.any("ROLLBACK");
    } else {
      await migrationEnd?.finishMigration();
    }
    return { currentSchema, patchedSchema, patchedSchemaPatch };
  });

  return { patchQueries };
};

/**
 * Given a table config, return the list of necessary db changes to bring the existing schema to this config
 */
// const applyTableConfig = async (prostgles: Prostgles) => {
//   const { tableConfig: config } = prostgles.opts;
//   if (!config) return;

//   const { asName, runQueries, changedSchema, failedQueries, queryHistory, queries, db, dbo, pgp } =
//     await getUtils(prostgles);

//   const migrations = await runMigrations.bind(this)({ asName });

//   /* Create lookup tables */
//   for (const [tableNameRaw, tableConf] of Object.entries(config)) {
//     const tableName = asName(tableNameRaw);

//     if ("isLookupTable" in tableConf && Object.keys(tableConf.isLookupTable.values).length) {
//       const { dropIfExists = false, dropIfExistsCascade = false } = tableConf;
//       const isDropped = dropIfExists || dropIfExistsCascade;

//       if (dropIfExistsCascade) {
//         queries.push(`DROP TABLE IF EXISTS ${tableName} CASCADE;`);
//       } else if (dropIfExists) {
//         queries.push(`DROP TABLE IF EXISTS ${tableName};`);
//       }

//       const rows = Object.entries(tableConf.isLookupTable.values).map(([id, otherColumns]) => ({
//         id,
//         ...otherColumns,
//       }));
//       const lookupTableHandler = dbo[tableNameRaw];
//       const columnNames = Object.keys(rows[0]!).filter((k) => k !== "id");
//       if (isDropped || !lookupTableHandler) {
//         queries.push(
//           `CREATE TABLE IF NOT EXISTS ${tableName} (
//             id  TEXT PRIMARY KEY
//             ${columnNames.length ? ", " + columnNames.map((k) => asName(k) + " TEXT ").join(", ") : ""}
//           );`
//         );
//       }
//       if (rows.length) {
//         const existingValues: { id: any }[] =
//           !lookupTableHandler ?
//             []
//           : await db.any(
//               `SELECT id FROM ${tableName} WHERE id IN (${rows.map((r) => asValue(r.id)).join(", ")});`
//             );
//         rows
//           .filter((r) => !existingValues.some((ev) => ev.id === r.id))
//           .map((row) => {
//             const allColumns = ["id", ...columnNames];
//             const values = allColumns.map((key) => (row as any)[key]);
//             queries.push(
//               pgp.as.format(
//                 `INSERT INTO ${tableName}  (${allColumns.map((t) => asName(t)).join(", ")})  ` +
//                   " VALUES (${values:csv});",
//                 { values }
//               )
//             );
//           });
//       }
//     }
//   }

//   if (queries.length) {
//     await runQueries(queries);
//     await prostgles.refreshDBO();
//   }

//   /* Create/Alter columns */
//   for (const [tableName, tableConf] of Object.entries(config)) {
//     const tableHandler = dbo[tableName];

//     const ALTER_TABLE_Q = `ALTER TABLE ${asName(tableName)}`;

//     /* isLookupTable table has already been created */
//     const coldef =
//       "isLookupTable" in tableConf ? undefined : (
//         await getTableColumnQueries({
//           db,
//           tableConf,
//           tableHandler,
//           tableName,
//         })
//       );

//     if (coldef) {
//       queries.push(coldef.fullQuery);
//     }

//     /** CONSTRAINTS */
//     const constraintDefs = getConstraintDefinitionQueries({
//       tableName,
//       tableConf,
//     });
//     if (coldef?.isCreate) {
//       queries.push(...(constraintDefs?.map((c) => c.alterQuery) ?? []));
//     } else if (coldef) {
//       const fullSchema = await getFutureTableSchema({
//         db,
//         tableName,
//         columnDefs: coldef.columnDefs,
//         constraintDefs,
//       });
//       const futureCons = fullSchema.constraints.map((nc) => ({
//         ...nc,
//         isNamed: constraintDefs?.some((c) => c.name === nc.name),
//       }));

//       /** Run this first to ensure any dropped cols drop their constraints as well */
//       await runQueries(queries);
//       const currCons = await getColConstraints({
//         db,
//         table: tableName,
//       });

//       /** Drop removed/modified */
//       currCons.forEach((c) => {
//         if (
//           !futureCons.some(
//             (nc) => nc.definition === c.definition && (!nc.isNamed || nc.name === c.name)
//           )
//         ) {
//           queries.push(`${ALTER_TABLE_Q} DROP CONSTRAINT ${asName(c.name)};`);
//         }
//       });

//       /** Add missing named constraints */
//       constraintDefs?.forEach((c) => {
//         if (c.name && !currCons.some((cc) => cc.name === c.name)) {
//           const fc = futureCons.find((nc) => nc.name === c.name);
//           if (fc) {
//             queries.push(`${ALTER_TABLE_Q} ADD CONSTRAINT ${asName(c.name)} ${c.content};`);
//           }
//         }
//       });

//       /** Add remaining missing constraints */
//       futureCons
//         .filter((nc) => !currCons.some((c) => c.definition === nc.definition))
//         .forEach((c) => {
//           queries.push(`${ALTER_TABLE_Q} ADD ${c.definition};`);
//         });
//     }

//     if ("indexes" in tableConf && tableConf.indexes) {
//       /*
//           CREATE [ UNIQUE ] INDEX [ CONCURRENTLY ] [ [ IF NOT EXISTS ] name ] ON [ ONLY ] table_name [ USING method ]
//             ( { column_name | ( expression ) } [ COLLATE collation ] [ opclass [ ( opclass_parameter = value [, ... ] ) ] ] [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, ...] )
//             [ INCLUDE ( column_name [, ...] ) ]
//             [ NULLS [ NOT ] DISTINCT ]
//             [ WITH ( storage_parameter [= value] [, ... ] ) ]
//             [ TABLESPACE tablespace_name ]
//             [ WHERE predicate ]
//       */
//       const currIndexes = await getPGIndexes(db, tableName, "public");
//       Object.entries(tableConf.indexes).forEach(
//         ([indexName, { columns, concurrently, replace, unique, using, where = "" }]) => {
//           if (replace || (typeof replace !== "boolean" && tableConf.replaceUniqueIndexes)) {
//             queries.push(`DROP INDEX IF EXISTS ${asName(indexName)};`);
//           }
//           if (!currIndexes.some((idx) => idx.indexname === indexName)) {
//             queries.push(
//               [
//                 "CREATE",
//                 unique && "UNIQUE",
//                 concurrently && "CONCURRENTLY",
//                 `INDEX ${asName(indexName)} ON ${asName(tableName)}`,
//                 using && "USING " + using,
//                 `(${columns})`,
//                 where && `WHERE ${where}`,
//               ]
//                 .filter((v) => v)
//                 .join(" ") + ";"
//             );
//           }
//         }
//       );
//     }

//     const { triggers, dropIfExists, dropIfExistsCascade } = tableConf;
//     if (triggers) {
//       const isDropped = dropIfExists || dropIfExistsCascade;

//       const existingTriggers = (await dbo.sql!(
//         `
//             SELECT event_object_table
//               ,trigger_name
//             FROM  information_schema.triggers
//             WHERE event_object_table = \${tableName}
//             ORDER BY event_object_table
//           `,
//         { tableName },
//         { returnType: "rows" }
//       )) as { trigger_name: string }[];

//       // const existingTriggerFuncs = await this.dbo.sql!(`
//       //   SELECT p.oid,proname,prosrc,u.usename
//       //   FROM  pg_proc p
//       //   JOIN  pg_user u ON u.usesysid = p.proowner
//       //   WHERE prorettype = 2279;
//       // `, {}, { returnType: "rows" }) as { proname: string }[];

//       Object.entries(triggers).forEach(([triggerFuncName, trigger]) => {
//         const funcNameParsed = asName(triggerFuncName);

//         let addedFunc = false;
//         const addFuncDef = () => {
//           if (addedFunc) return;
//           addedFunc = true;
//           queries.push(`
//               CREATE OR REPLACE FUNCTION ${funcNameParsed}()
//                 RETURNS trigger
//                 LANGUAGE plpgsql
//               AS
//               $$

//               ${trigger.query}

//               $$;
//             `);
//         };

//         trigger.actions.forEach((action) => {
//           const triggerActionName = triggerFuncName + "_" + action;

//           const triggerActionNameParsed = asName(triggerActionName);
//           if (isDropped) {
//             queries.push(`DROP TRIGGER IF EXISTS ${triggerActionNameParsed} ON ${tableName};`);
//           }

//           if (isDropped || !existingTriggers.some((t) => t.trigger_name === triggerActionName)) {
//             addFuncDef();
//             const newTableName = action !== "delete" ? "NEW TABLE AS new_table" : "";
//             const oldTableName = action !== "insert" ? "OLD TABLE AS old_table" : "";
//             const transitionTables =
//               trigger.forEach === "row" ? "" : `REFERENCING ${newTableName} ${oldTableName}`;
//             queries.push(`
//                 CREATE TRIGGER ${triggerActionNameParsed}
//                 ${trigger.type} ${action} ON ${tableName}
//                 ${transitionTables}
//                 FOR EACH ${trigger.forEach}
//                 EXECUTE PROCEDURE ${funcNameParsed}();
//               `);
//           }
//         });
//       });
//     }
//   }

//   if (queries.length) {
//     const q = makeQuery(queries);

//     try {
//       await runQueries(queries);
//     } catch (errRaw: any) {
//       const err = errRaw as AnyObject;

//       console.error("TableConfig error: ", err);
//       if (err.position) {
//         const pos = +err.position;
//         if (Number.isInteger(pos)) {
//           return Promise.reject((err as Error).toString() + "\n At:" + q.slice(pos - 50, pos + 50));
//         }
//       }

//       return Promise.reject(err);
//     }
//   }

//   if (migrations) {
//     await db.any(
//       `INSERT INTO ${migrations.table}(id, table_config)
//       VALUES (${asValue(migrations.version)}, ${asValue(config)})
//       ON CONFLICT DO NOTHING;`
//     );
//   }

//   // if (changedSchema && !failedQueries.length) {
//   //   if (!this.prevInitQueryHistory) {
//   //     this.prevInitQueryHistory = queryHistory;
//   //   } else if (this.prevInitQueryHistory.join() !== queryHistory.join()) {
//   //     void prostgles.init(prostgles.opts.onReady as OnReadyCallbackBasic, {
//   //       type: "TableConfig",
//   //     });
//   //   } else {
//   //     console.error("TableConfig loop bug", queryHistory);
//   //   }
//   // }
//   // if (failedQueries.length) {
//   //   console.error("Table config failed queries: ", failedQueries);
//   // }

//   // await prostgles.refreshDBO();
//   // await setTableOnMounts();
// };

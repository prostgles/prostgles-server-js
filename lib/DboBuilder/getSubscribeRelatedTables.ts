import { AnyObject, asName, reverseParsedPath, SubscribeParams } from "prostgles-types";
import { ExistsFilterConfig, Filter, LocalParams, makeErrorFromPGError } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { log, ViewSubscriptionOptions } from "../PubSubManager/PubSubManager";
import { NewQuery } from "./QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler/ViewHandler";

type Args = {
  selectParams: Omit<SubscribeParams, "throttle">;
  filter: Filter;
  table_rules: TableRule<AnyObject, void> | undefined;
  localParams: LocalParams | undefined;
  condition: string;
  filterOpts: {
    where: string;
    filter: AnyObject;
    exists: ExistsFilterConfig[];
  };
}
export async function getSubscribeRelatedTables(this: ViewHandler, { selectParams, filter, localParams, table_rules, condition, filterOpts }: Args){

  let viewOptions: ViewSubscriptionOptions | undefined = undefined;
  if (this.is_view) {
    const viewName = this.name;
    const viewNameEscaped = this.escapedName;
    const { current_schema } = await this.db.oneOrNone("SELECT current_schema")

    /** Get list of used columns and their parent tables */
    let { def } = (await this.db.oneOrNone("SELECT pg_get_viewdef(${viewName}) as def", { viewName })) as { def: string };
    def = def.trim();
    if (def.endsWith(";")) {
      def = def.slice(0, -1);
    }
    if (!def || typeof def !== "string") {
      throw makeErrorFromPGError("Could get view definition");
    }
    const { fields } = await this.dboBuilder.dbo.sql!(`SELECT * FROM ( \n ${def} \n ) prostgles_subscribe_view_definition LIMIT 0`, {});
    const tableColumns = fields.filter(f => f.tableName && f.columnName);

    /** Create exists filters for each table */
    const tableIds: string[] = Array.from(new Set(tableColumns.map(tc => tc.tableID!.toString())));
    viewOptions = {
      type: "view",
      viewName,
      definition: def,
      relatedTables: []
    }
    viewOptions.relatedTables = await Promise.all(tableIds.map(async tableID => {
      const table = this.dboBuilder.USER_TABLES!.find(t => t.relid === +tableID)!;
      let tableCols = tableColumns.filter(tc => tc.tableID!.toString() === tableID);

      /** If table has primary keys and they are all in this view then use only primary keys */
      if (table?.pkey_columns?.every(pkey => tableCols.some(c => c.columnName === pkey))) {
        tableCols = tableCols.filter(c => table?.pkey_columns?.includes(c.columnName!))
      } else {
        /** Exclude non comparable data types */
        tableCols = tableCols.filter(c => !["json", "xml"].includes(c.udt_name))
      }

      const { relname: tableName, schemaname: tableSchema } = table;

      if (tableCols.length) {

        const tableNameEscaped = tableSchema === current_schema ? table.relname : [tableSchema, tableName].map(v => JSON.stringify(v)).join(".");

        const fullCondition = `EXISTS (
              SELECT 1
              FROM ${viewNameEscaped}
              WHERE ${tableCols.map(c => `${tableNameEscaped}.${JSON.stringify(c.columnName)} = ${viewNameEscaped}.${JSON.stringify(c.name)}`).join(" AND \n")}
              AND ${condition || "TRUE"}
            )`;

        try {
          const { count } = await this.db.oneOrNone(`
                WITH ${asName(tableName)} AS (
                  SELECT * 
                  FROM ${asName(tableName)}
                  LIMIT 0
                )

                SELECT COUNT(*) as count
                FROM (
                  ${def}
                ) prostgles_view_ref_table_test
              `);

          const relatedTableSubscription = {
            tableName: tableName!,
            tableNameEscaped,
            condition: fullCondition,
          }

          if (count.toString() === '0') {
            return relatedTableSubscription;
          }
        } catch (e) {
          log(`Could not not override subscribed view (${this.name}) table (${tableName}). Will not check condition`, e);
        }
      }

      return {
        tableName,
        tableNameEscaped: JSON.stringify(tableName),// [table.schemaname, table.relname].map(v => JSON.stringify(v)).join("."),
        condition: "TRUE"
      }

    }))

    /** Get list of remaining used inner tables */
    const allUsedTables: { table_name: string; table_schema: string; }[] = await this.db.any(
      "SELECT distinct table_name, table_schema FROM information_schema.view_column_usage WHERE view_name = ${viewName}",
      { viewName }
    );

    /** Remaining tables will have listeners on all records (condition = "TRUE") */
    const remainingInnerTables = allUsedTables.filter(at => !tableColumns.some(dc => dc.tableName === at.table_name && dc.tableSchema === at.table_schema));
    viewOptions.relatedTables = [
      ...viewOptions.relatedTables,
      ...remainingInnerTables.map(t => ({
        tableName: t.table_name,
        tableNameEscaped: [t.table_name, t.table_schema].map(v => JSON.stringify(v)).join("."),
        condition: "TRUE"
      }))
    ];

    if (!viewOptions.relatedTables.length) {
      throw "Could not subscribe to this view: no related tables found";
    }

    /** Any joined table used within select or filter must also be added a trigger for this recordset */
  } else {
    const newQuery = await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, { ...localParams, returnNewQuery: true }) as unknown as NewQuery;
    viewOptions = {
      type: "table",
      relatedTables: []
    }
    /**
     * Avoid nested exists error. Will affect performance
     */
    const nonExistsFilter = filterOpts.exists.length ? {} : filter;
    for await (const j of (newQuery.joins ?? [])) {
      if (!viewOptions!.relatedTables.find(rt => rt.tableName === j.table)) {
        /**
         * Must shift on condition
         */
        viewOptions.relatedTables.push({
          tableName: j.table,
          tableNameEscaped: asName(j.table),
          condition: (await this.dboBuilder.dbo[j.table]!.prepareWhere!({
            filter: {
              $existsJoined: {
                path: reverseParsedPath(j.joinPath, this.name),
                filter: nonExistsFilter
              }
            },
            addWhere: false,
            localParams: undefined,
            tableRule: undefined
          })).where
        });
      }
    }
    for await (const e of newQuery.whereOpts.exists.filter(e => e.isJoined)) {
      if(!e.isJoined) throw `Not possible`;
      const targetTable = e.parsedPath.at(-1)!.table;
      const newPath = reverseParsedPath(e.parsedPath, this.name)
      viewOptions.relatedTables.push({
        tableName: targetTable,
        tableNameEscaped: asName(targetTable),
        condition: (await this.dboBuilder.dbo[targetTable]!.prepareWhere!({
          filter: {
            $existsJoined: {
              path: newPath,
              filter: nonExistsFilter
            }
          },
          addWhere: false,
          localParams: undefined,
          tableRule: undefined
        })).where
      });
    }
    if (!viewOptions.relatedTables.length) {
      viewOptions = undefined;
    }
  }

  return viewOptions;
}
import { AnyObject, asName, ParsedJoinPath, reverseParsedPath, SubscribeParams } from "prostgles-types";
import { TableRule } from "../PublishParser/PublishParser";
import { log, ViewSubscriptionOptions } from "../PubSubManager/PubSubManager";
import { Filter, getSerializedClientErrorFromPGError, LocalParams } from "./DboBuilder";
import { NewQuery } from "./QueryBuilder/QueryBuilder";
import { ViewHandler } from "./ViewHandler/ViewHandler";

type Args = {
  selectParams: Omit<SubscribeParams, "throttle">;
  filter: Filter;
  table_rules: TableRule<AnyObject, void> | undefined;
  localParams: LocalParams | undefined;
  newQuery: NewQuery;
}

/**
 * When subscribing to a view: we identify underlying tables to subscribe to them
 * When subscribing to a table: we identify joined tables to subscribe to them
 */
export async function getSubscribeRelatedTables(this: ViewHandler, { filter, localParams, newQuery }: Args){

  let viewOptions: ViewSubscriptionOptions | undefined = undefined;
  const { condition } = newQuery.whereOpts;
  if (this.is_view) {
    /** TODO: this needs to be memoized on schema fetch */
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
      throw getSerializedClientErrorFromPGError("Could get view definition", { type: "tableMethod", localParams, view: this,  });
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
    viewOptions = {
      type: "table",
      relatedTables: []
    }



    const nonExistsFilter = newQuery.whereOpts.exists.length ? {} : filter;
    const pushRelatedTable = async (relatedTableName: string, joinPath: ParsedJoinPath[]) => {
      const relatedTableOrViewHandler = this.dboBuilder.dbo[relatedTableName];
      if (!relatedTableOrViewHandler) {
        throw `Table ${relatedTableName} not found`;
      }

      const alreadyPushed = viewOptions!.relatedTables.find(rt => rt.tableName === relatedTableName)
      if(!alreadyPushed || relatedTableOrViewHandler.is_view){
        return
      }

      viewOptions ??= {
        type: "table",
        relatedTables: []
      }
      viewOptions.relatedTables.push({
        tableName: relatedTableName,
        tableNameEscaped: asName(relatedTableName),
        condition: (await relatedTableOrViewHandler!.prepareWhere!({
          select: undefined,
          filter: {
            $existsJoined: {
              path: reverseParsedPath(joinPath, this.name),
              filter: nonExistsFilter
            }
          },
          addWhere: false,
          localParams: undefined,
          tableRule: undefined
        })).where
      });
    }

    /**
     * Avoid nested exists error. Will affect performance
     */
    for await (const j of (newQuery.joins ?? [])) {
      pushRelatedTable(j.table, j.joinPath);
    }
    for await (const e of newQuery.whereOpts.exists.filter(e => e.isJoined)) {
      if(!e.isJoined) throw `Not possible`;
      const targetTable = e.parsedPath.at(-1)!.table;
      pushRelatedTable(targetTable, e.parsedPath);
    }
    if (!viewOptions.relatedTables.length) {
      viewOptions = undefined;
    }
  }

  return viewOptions;
}
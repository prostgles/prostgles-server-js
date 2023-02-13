import { AnyObject, asName, SubscribeParams } from "prostgles-types";
import { Filter, LocalParams, makeErr, parseError } from "../DboBuilder";
import { TableRule } from "../PublishParser";
import { log, omitKeys, ViewSubscriptionOptions } from "../PubSubManager/PubSubManager";
import { ViewHandler } from "./ViewHandler";

export type LocalFunc = (items: AnyObject[]) => any;

async function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFunc: LocalFunc): Promise<{ unsubscribe: () => any }> 
async function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFunc: undefined, table_rules: TableRule | undefined, localParams: LocalParams): Promise<string>
async function subscribe(this: ViewHandler, filter: Filter, params: SubscribeParams, localFunc?: LocalFunc, table_rules?: TableRule, localParams?: LocalParams): Promise<{ unsubscribe: () => any } | string> 
{
 
  try {
    // if (this.is_view) throw "Cannot subscribe to a view";

    if (this.t) {
      throw "subscribe not allowed within transactions";
    }
    if (!localParams && !localFunc) {
      throw " missing data. provide -> localFunc | localParams { socket } ";
    }
    if (localParams?.socket && localFunc) {
      console.error({ localParams, localFunc })
      throw " Cannot have localFunc AND socket ";
    }

    const { filterFields, forcedFilter } = table_rules?.select || {},
      filterOpts = await this.prepareWhere({ filter, forcedFilter, addKeywords: false, filterFields, tableAlias: undefined, localParams, tableRule: table_rules }),
      condition = filterOpts.where,
      throttle = params?.throttle || 0,
      selectParams = omitKeys(params || {}, ["throttle"]);

    /** app_triggers condition field has an index which limits it's value. 
     * TODO: use condition md5 hash 
     * */
    const filterSize = JSON.stringify(filter || {}).length;
    if (filterSize * 4 > 2704) {
      throw "filter too big. Might exceed the btree version 4 maximum 2704. Use a primary key or a $rowhash filter instead"
    }

    if (!localFunc) {
 
      if (!this.dboBuilder.prostgles.isSuperUser) {
        throw "Subscribe not possible. Must be superuser to add triggers 1856";
      }
      
      return await this.find(filter, { ...selectParams, limit: 0 }, undefined, table_rules, localParams)
        .then(async _isValid => {

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
              throw makeErr("Could get view definition");
            }
            const { fields } = await this.dboBuilder.dbo.sql!(`SELECT * FROM ( \n ${def} \n ) prostgles_subscribe_view_definition LIMIT 0`, {});
            const tableColumns = fields.filter(f => f.tableName && f.columnName);

            /** Create exists filters for each table */
            const tableIds: string[] = Array.from(new Set(tableColumns.map(tc => tc.tableID!.toString())));
            viewOptions = {
              viewName,
              definition: def,
              relatedTables: []
            }
            viewOptions.relatedTables = await Promise.all(tableIds.map(async tableID => {
              const table = this.dboBuilder.USER_TABLES?.find(t => t.relid === +tableID)!;
              let tableCols = tableColumns.filter(tc => tc.tableID!.toString() === tableID);

              /** If table has primary keys and they are all in this view then use only primary keys */
              if (table?.pkey_columns?.every(pkey => tableCols.some(c => c.columnName === pkey))) {
                tableCols = tableCols.filter(c => table?.pkey_columns?.includes(c.columnName!))
              } else {
                /** Exclude non comparable data types */
                tableCols = tableCols.filter(c => !["json", "xml"].includes(c.udt_name))
              }

              const { relname: tableName, schemaname: tableSchema } = table;

              if(tableCols.length){

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
  
                  if(count.toString() === '0'){
                    return relatedTableSubscription;
                  }
                } catch(e){
                  log(`Could not not override subscribed view (${this.name}) table (${tableName}). Will not check condition`, e);
                }
              }

              return {
                tableName: tableName,
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
          }

          const { socket } = localParams ?? {};
          const pubSubManager = await this.dboBuilder.getPubSubManager();
          return pubSubManager.addSub({
            table_info: this.tableOrViewInfo,
            socket,
            table_rules,
            table_name: this.name,
            condition: condition,
            viewOptions,
            func: undefined,
            filter: { ...filter },
            params: { ...selectParams },
            socket_id: socket?.id,
            throttle,
            last_throttled: 0,
          }).then(channelName => ({ channelName }));
        }) as any;
    } else {
      const pubSubManager = await this.dboBuilder.getPubSubManager();
      pubSubManager.addSub({
        table_info: this.tableOrViewInfo,
        socket: undefined,
        table_rules,
        condition,
        func: localFunc,
        filter: { ...filter },
        params: { ...selectParams },
        socket_id: undefined,
        table_name: this.name,
        throttle,
        last_throttled: 0,
      }).then(channelName => ({ channelName }));
      const unsubscribe = async () => {
        const pubSubManager = await this.dboBuilder.getPubSubManager();
        pubSubManager.removeLocalSub(this.name, condition, localFunc)
      };
      let res: { unsubscribe: () => any } = Object.freeze({ unsubscribe })
      return res;
    }
  } catch (e) {
    if (localParams && localParams.testRule) throw e;
    throw parseError(e, `dbo.${this.name}.subscribe()`);
  }
}


async function _subscribe(localFunc: LocalFunc): Promise<string>
async function _subscribe(localFunc: undefined, table_rules: TableRule, localParams: LocalParams): Promise<{ unsubscribe: () => any }>
  async function _subscribe(localFunc: LocalFunc | undefined, table_rules?: TableRule, localParams?: LocalParams): Promise<{ unsubscribe: () => any } | string> {
  if(localFunc && !localParams){
    return {
      unsubscribe: () => {}
    }
  }

  if(localParams){
    return ""
  }

  return {
    unsubscribe: () => {}
  }
}

const d = async () => {

  const res = await _subscribe(()=>{})
  const res2 = await _subscribe(undefined, {}, {})
}

export { subscribe }
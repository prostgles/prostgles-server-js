import { DBSchemaTable, MethodKey, TableInfo, TableSchemaForClient, getKeys, pickKeys } from "prostgles-types";
import { AuthResult } from "../AuthHandler";
import { PRGLIOSocket } from "../DboBuilder";
import { PublishObject, PublishParser } from "./PublishParser"
import { TABLE_METHODS } from "../Prostgles";

export async function getSchemaFromPublish(this: PublishParser, socket: PRGLIOSocket, userData?: AuthResult): Promise<{ schema: TableSchemaForClient; tables: DBSchemaTable[] }> {
  const schema: TableSchemaForClient = {};
  const tables: DBSchemaTable[] = []

  try {
    /* Publish tables and views based on socket */
    const clientInfo = userData ?? await this.prostgles.authHandler?.getClientInfo({ socket });

    let _publish: PublishObject | undefined;
    try {
      _publish = await this.getPublish({ socket }, clientInfo);
    } catch(err){
      console.error("Error within then Publish function ", err)
      throw err;
    }


    if (_publish && Object.keys(_publish).length) {
      let txKey = "tx";
      if (!this.prostgles.opts.transactions) txKey = "";
      if (typeof this.prostgles.opts.transactions === "string") txKey = this.prostgles.opts.transactions;

      const tableNames = Object.keys(_publish).filter(k => !txKey || txKey !== k);

      const fileTableName = this.prostgles.fileManager?.tableName;
      if(fileTableName && this.dbo[fileTableName]?.is_media && !tableNames.includes(fileTableName)){
        const isReferenced = this.prostgles.dboBuilder.tablesOrViews?.some(t => t.columns.some(c => c.references?.some(r => r.ftable === fileTableName)))
        if(isReferenced){
          tableNames.unshift(fileTableName);
        }
      }
      await Promise.all(tableNames
        .map(async tableName => {
          if (!this.dbo[tableName]) {
            const errMsg = [
              `Table ${tableName} does not exist`,
              `Expecting one of: ${JSON.stringify(this.prostgles.dboBuilder.tablesOrViews?.map(tov => tov.name))}`,
              `DBO tables: ${JSON.stringify(Object.keys(this.dbo).filter(k => (this.dbo[k] as any).find))}`,
            ].join("\n");
            throw errMsg;
          }

          const table_rules = await this.getTableRules({ localParams: { socket }, tableName }, clientInfo);

          if (table_rules && Object.keys(table_rules).length) {
            schema[tableName] = {};
            const tableSchema = schema[tableName]!;
            let methods: MethodKey[] = [];
            let tableInfo: TableInfo | undefined;
            let tableColumns: DBSchemaTable["columns"] | undefined;

            if (typeof table_rules === "object") {
              methods = getKeys(table_rules) as any;
            }

            await Promise.all(methods.filter(m => m !== "select" as any)
            .map(async method => {
              if (method === "sync" && table_rules[method]) {

                /* Pass sync info */
                tableSchema[method] = table_rules[method];
              } else if ((table_rules as any)[method]) {

                tableSchema[method] = method === "insert"? pickKeys(table_rules.insert!, ["allowedNestedInserts"]) : {};

                /* Test for issues with the common table CRUD methods () */
                if (TABLE_METHODS.includes(method as any)) {

                  let err = null;
                  try {
                    const valid_table_command_rules = await this.getValidatedRequestRule({ tableName, command: method, localParams: { socket } }, clientInfo);
                    await (this.dbo[tableName] as any)[method]({}, {}, {}, valid_table_command_rules, { socket, isRemoteRequest: true, testRule: true });

                  } catch (e) {
                    err = "INTERNAL PUBLISH ERROR";
                    tableSchema[method] = { err };

                    throw `publish.${tableName}.${method}: \n   -> ${e}`;
                  }
                }


                if (method === "getInfo" || method === "getColumns") {
                  const tableRules = await this.getValidatedRequestRule({ tableName, command: method, localParams: { socket } }, clientInfo);
                  const res = await (this.dbo[tableName] as any)[method](undefined, undefined, undefined, tableRules, { socket, isRemoteRequest: true });
                  if (method === "getInfo") {
                    tableInfo = res;
                  } else if (method === "getColumns") {
                    tableColumns = res;
                  }
                }
              }
            }));

            if (tableInfo && tableColumns) {

              tables.push({
                name: tableName,
                info: tableInfo,
                columns: tableColumns
              })
            }
          }

          return true;
        })
      );
    }


  } catch (e) {
    console.error("Prostgles \nERRORS IN PUBLISH: ", JSON.stringify(e));
    throw e;
  }

  return { schema, tables };
}
import {
  DBSchemaTable,
  getKeys,
  includes,
  isEmpty,
  isObject,
  pickKeys,
  TableInfo,
  TableSchemaErrors,
  TableSchemaForClient,
  type AnyObject,
} from "prostgles-types";
import { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import { getErrorAsObject } from "../DboBuilder/DboBuilder";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import { TABLE_METHODS } from "../Prostgles";
import { type PermissionScope, type PublishObject, PublishParser } from "./PublishParser";

type Args = AuthClientRequest & {
  userData: AuthResultWithSID | undefined;
};
const SUBSCRIBE_METHODS = ["subscribe", "subscribeOne", "sync", "unsubscribe", "unsync"] as const;

export async function getSchemaFromPublish(
  this: PublishParser,
  { userData, ...clientReq }: Args,
  scope: PermissionScope | undefined
): Promise<{
  schema: TableSchemaForClient;
  tables: DBSchemaTable[];
  tableSchemaErrors: TableSchemaErrors;
}> {
  const schema: TableSchemaForClient = {};
  const tableSchemaErrors: TableSchemaErrors = {};
  let tables: DBSchemaTable[] = [];

  try {
    /* Publish tables and views based on socket */
    const clientInfo =
      userData ?? (await this.prostgles.authHandler?.getSidAndUserFromRequest(clientReq));
    if (clientInfo === "new-session-redirect") {
      throw "new-session-redirect";
    }
    let _publish: PublishObject | undefined;
    try {
      _publish = await this.getPublishAsObject(clientReq, clientInfo);
    } catch (err) {
      console.error("Error within then Publish function ", err);
      throw err;
    }

    if (_publish && Object.keys(_publish).length) {
      let txKey = "tx";
      if (!this.prostgles.opts.transactions) txKey = "";
      if (typeof this.prostgles.opts.transactions === "string")
        txKey = this.prostgles.opts.transactions;

      const tableNames = Object.keys(_publish).filter((k) => !txKey || txKey !== k);

      const fileTableName = this.prostgles.fileManager?.tableName;
      if (
        fileTableName &&
        this.dbo[fileTableName]?.is_media &&
        !tableNames.includes(fileTableName)
      ) {
        const isReferenced = this.prostgles.dboBuilder.tablesOrViews?.some((t) =>
          t.columns.some((c) => c.references?.some((r) => r.ftable === fileTableName))
        );
        if (isReferenced) {
          tableNames.unshift(fileTableName);
        }
      }
      await Promise.all(
        tableNames.map(async (tableName) => {
          const { canSubscribe, tablesOrViews } = this.prostgles.dboBuilder;
          if (!this.dbo[tableName]) {
            const errMsg = [
              `Table ${tableName} does not exist`,
              `Expecting one of: ${JSON.stringify(tablesOrViews?.map((tov) => tov.name))}`,
            ].join("\n");
            throw errMsg;
          }

          const tableRules = await this.getTableRules({ clientReq, tableName }, clientInfo);

          if (!tableRules || isEmpty(tableRules)) return;
          if (!isObject(tableRules)) {
            throw `Invalid tableRules for table ${tableName}. Expecting an object`;
          }

          schema[tableName] = {};
          const tableSchema = schema[tableName]!;
          const methods = getKeys(tableRules).filter(
            (m) => canSubscribe || !includes(SUBSCRIBE_METHODS, m)
          );
          let tableInfo: TableInfo | undefined;
          let tableColumns: DBSchemaTable["columns"] | undefined;

          await Promise.all(
            methods
              .filter((m) => m !== "select")
              .map(async (method) => {
                if (method === "sync") {
                  /* Pass sync info */
                  tableSchema[method] = tableRules[method];
                } else if (includes(getKeys(tableRules), method) && tableRules[method]) {
                  //@ts-ignore
                  tableSchema[method] =
                    method === "insert" ?
                      pickKeys(tableRules[method]!, ["allowedNestedInserts"])
                    : ({} as AnyObject);

                  /* Test for issues with the common table CRUD methods () */
                  if (includes(TABLE_METHODS, method)) {
                    try {
                      const parsedTableRule = await this.getValidatedRequestRule(
                        {
                          tableName,
                          command: method,
                          clientReq,
                        },
                        clientInfo,
                        scope
                      );
                      if (this.prostgles.opts.testRulesOnConnect) {
                        await (this.dbo[tableName] as TableHandler)[method](
                          {},
                          {},
                          undefined,
                          parsedTableRule,
                          {
                            ...clientReq,
                            isRemoteRequest: {},
                            testRule: true,
                          }
                        );
                      }
                    } catch (e) {
                      console.error(`${tableName}.${method}`, e);
                      tableSchemaErrors[tableName] ??= {};
                      tableSchemaErrors[tableName]![method] = {
                        error: "Internal publish error. Check server logs",
                      };

                      throw {
                        ...getErrorAsObject(e),
                        publish_path: `publish.${tableName}.${method}: \n   -> ${e}`,
                      };
                    }
                  }

                  if (method === "getInfo" || method === "getColumns") {
                    const tableRules = await this.getValidatedRequestRule(
                      { tableName, command: method, clientReq },
                      clientInfo,
                      scope
                    );
                    const res = await (this.dbo[tableName] as TableHandler)[method](
                      undefined,
                      undefined,
                      undefined,
                      tableRules,
                      { ...clientReq, isRemoteRequest: {} }
                    );
                    if (method === "getInfo") {
                      tableInfo = res as TableInfo;
                    } else {
                      tableColumns = res as DBSchemaTable["columns"];
                    }
                  }
                }
              })
          );

          if (tableInfo && tableColumns) {
            tables.push({
              name: tableName,
              info: tableInfo,
              columns: tableColumns,
            });
          }
        })
      );
    }
  } catch (e) {
    console.error("Prostgles \nERRORS IN PUBLISH: ", JSON.stringify(e));
    throw e;
  }

  tables = tables.sort((a, b) => a.name.localeCompare(b.name));
  return { schema, tables, tableSchemaErrors };
}

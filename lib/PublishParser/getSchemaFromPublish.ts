import type { DBSchemaTable, TableSchemaErrors } from "prostgles-types";
import { isEmpty, isObject } from "prostgles-types";
import type { AuthClientRequest, AuthResultWithSID } from "../Auth/AuthTypes";
import type { PublishParser } from "./PublishParser";
import { type PermissionScope, type PublishObject } from "./PublishParser";
import { getDBSchemaTable } from "./getDBSchemaTable";
import { getPublishedTableNames } from "./getPublishedTableNames";

type Args = AuthClientRequest & {
  userData: AuthResultWithSID | undefined;
};
export async function getSchemaFromPublish(
  this: PublishParser,
  { userData, ...clientReq }: Args,
  scope: PermissionScope | undefined,
): Promise<{
  tables: DBSchemaTable[];
  tableSchemaErrors: TableSchemaErrors;
}> {
  const tableSchemaErrors: TableSchemaErrors = {};
  const tables: DBSchemaTable[] = [];

  try {
    /* Publish tables and views based on socket */
    const clientInfo =
      userData ?? (await this.prostgles.authHandler.getSidAndUserFromRequest(clientReq));
    if (clientInfo === "new-session-redirect") {
      throw "new-session-redirect";
    }
    let publish: PublishObject | undefined;
    try {
      publish = await this.getPublishObject(clientReq, clientInfo);
    } catch (err) {
      console.error("Error within then Publish function ", err);
      throw err;
    }

    if (!publish || !Object.keys(publish).length) {
      return { tables, tableSchemaErrors };
    }
    const tableNames = getPublishedTableNames(this, publish);

    await Promise.all(
      tableNames.map(async (tableName) => {
        const { tablesOrViews } = this.prostgles.dboBuilder;
        const tableHandler = this.dbo[tableName];
        if (!tableHandler) {
          const errMsg = [
            `Table ${tableName} does not exist`,
            `Expecting one of: ${JSON.stringify(tablesOrViews?.map((tov) => tov.name))}`,
          ].join("\n");
          throw errMsg;
        }

        const parsedTableRule = await this.getTableRules(
          { clientReq, tableName },
          clientInfo,
          scope,
        );

        if (!parsedTableRule || isEmpty(parsedTableRule)) return;
        if (!isObject(parsedTableRule)) {
          throw `Invalid tableRules for table ${tableName}. Expecting an object`;
        }

        const tableSchema = await getDBSchemaTable(
          this,
          tableHandler,
          parsedTableRule,
          clientReq,
          clientInfo,
          scope,
        );
        tables.push(tableSchema);
      }),
    );
  } catch (error) {
    console.error("Publish error", error);
    throw error;
  }

  // tables = tables.sort((a, b) => a.name.localeCompare(b.name));
  return { tables, tableSchemaErrors };
}

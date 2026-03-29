import { getObjectEntries, includes, type DBSchemaTable } from "prostgles-types";
import type { AuthClientRequest } from "../Auth/AuthTypes";
import { getErrorAsObject } from "../DboBuilder/dboBuilderUtils";
import type { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import { TABLE_METHODS } from "../Prostgles";
import type { ParsedTableRule, PermissionScope, PublishParser } from "./PublishParser";
import { getAllowedTableMethods } from "prostgles-types";

export const getDBSchemaTable = async (
  publishParser: PublishParser,
  tableHandler: TableHandler,
  parsedTableRule: ParsedTableRule,
  clientReq: AuthClientRequest,
  scope: PermissionScope | undefined,
): Promise<DBSchemaTable> => {
  const tableName = tableHandler.name;

  if (getObjectEntries(parsedTableRule).every(([_ruleName, ruleOptions]) => !ruleOptions)) {
    throw new Error("At least one of the rules must be defined for " + tableName);
  }
  const info = await tableHandler.getInfo(undefined, undefined, undefined, parsedTableRule, {
    ...clientReq,
    isRemoteRequest: {},
  });
  const columns = await tableHandler.getColumns(undefined, undefined, undefined, parsedTableRule, {
    ...clientReq,
    isRemoteRequest: {},
  });
  const allowedCommands = getAllowedTableMethods(info);
  for (const method of allowedCommands) {
    if (method === "getInfo" || method === "getColumns") {
      continue;
    }
    try {
      publishParser.validateRequestRule(
        {
          tableName,
          command: method,
          clientReq,
        },
        parsedTableRule,
        scope,
      );
    } catch (e) {
      console.error(`${tableName}.${method}`, e);
      throw {
        ...getErrorAsObject(e),
        publishPath: `publish.${tableName}.${method}`,
      };
    }
    /** Crucial in ensuring the published client tableHandler methods work without issues */
    if (publishParser.prostgles.opts.testRulesOnConnect && includes(TABLE_METHODS, method)) {
      await tableHandler.dboBuilder.dboMap.get(tableName)?.[method](
        //@ts-expect-error
        method === "insertMany" ? [] : {},
        {},
        undefined,
        parsedTableRule,
        {
          ...clientReq,
          isRemoteRequest: {},
          testRule: true,
        },
      );
    }
  }

  return {
    ...info,
    name: tableHandler.name,
    columns,
  } satisfies DBSchemaTable;
};

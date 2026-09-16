import { fromEntries, type DBSchemaTable } from "prostgles-types";
import { getRawColumns } from "../DboBuilder/getColumns";
import { getRawInfo } from "../DboBuilder/ViewHandler/getRawInfo";
import type { ClientSchemaProfiles } from "../DBSchemaBuilder/getClientDBGeneratedSchemas";
import { isArray } from "../utils/utils";
import { getPublishedObjectFromResult } from "./getPublishedObjectFromResult";
import { getPublishedTableNames } from "./getPublishedTableNames";
import type { PublishParser } from "./PublishParser";

export const getPublishSchemas = async (
  publishParser: PublishParser,
): Promise<ClientSchemaProfiles | undefined> => {
  if (!isArray(publishParser.parsedPublish)) {
    return;
  }
  const entries = publishParser.parsedPublish;
  const { tablesOrViews = [] } = publishParser.prostgles.dboBuilder;
  const profiles: ClientSchemaProfiles = fromEntries(
    await Promise.all(
      entries.map(async ({ name, publish, userTypes }) => {
        const resolvedPublishObject = getPublishedObjectFromResult(
          publish,
          tablesOrViews,
          undefined,
          "schemaGeneration",
        );
        const tableNames = getPublishedTableNames(
          publishParser,
          resolvedPublishObject,
        );
        const tableSchema: DBSchemaTable[] = [];
        for (const tableName of tableNames) {
          const rules = await publishParser.getTableRules({
            tableName,
            resolvedPublishObject,
            clientReq: undefined,
            clientInfo: undefined,
            scope: undefined,
          });
          if (!rules || !Object.values(rules).some(Boolean)) continue;
          const table = publishParser.dbo[tableName]!;
          tableSchema.push({
            ...getRawInfo.call(table, undefined, rules),
            name: tableName,
            columns: await getRawColumns.call(
              table,
              undefined,
              undefined,
              rules,
            ),
          });
        }
        return [name, { tableSchema, userTypes }];
      }),
    ),
  );
  return profiles;
};

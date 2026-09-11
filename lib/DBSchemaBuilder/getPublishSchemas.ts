import { getRawColumns } from "../DboBuilder/getColumns";
import { getRawInfo } from "../DboBuilder/ViewHandler/getRawInfo";
import { getPublishedTableNames } from "../PublishParser/getPublishedTableNames";
import type { PublishObject, PublishParser } from "../PublishParser/PublishParser";
import type { ClientSchemaProfiles } from "./getClientDBGeneratedSchemas";

export const getPublishSchemas = async (
  publishParser: PublishParser,
): Promise<ClientSchemaProfiles | undefined> => {
  if (!Array.isArray(publishParser.publish)) {
    return;
  }
  const entries = publishParser.publish;
  const profiles: ClientSchemaProfiles = Object.fromEntries(
    entries.map(({ name }) => [name, { tableSchema: [] }]),
  );
  const { tablesOrViews = [] } = publishParser.prostgles.dboBuilder;
  for (const { name, publish } of entries) {
    const publishObject: PublishObject =
      publish === "*" ?
        Object.fromEntries(tablesOrViews.map((table) => [table.name, "*"]))
      : (publish ?? {});
    const tableNames = getPublishedTableNames(publishParser, publishObject);
    for (const tableName of tableNames) {
      const rules = await publishParser.getTableRules(
        { tableName, clientReq: undefined },
        undefined,
        undefined,
        publishObject,
      );
      if (!rules || !Object.values(rules).some(Boolean)) continue;
      const table = publishParser.dbo[tableName]!;
      profiles[name]!.tableSchema.push({
        ...getRawInfo.call(table, undefined, rules),
        name: tableName,
        columns: await getRawColumns.call(table, undefined, undefined, rules),
      });
    }
  }
  return profiles;
};

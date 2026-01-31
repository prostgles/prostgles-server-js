import { asName } from "prostgles-types";
import { md5 } from "prostgles-types/dist/md5";
import type { DB } from "../../initProstgles";
import { asValue } from "../../PubSubManager/PubSubManagerUtils";
import { executeSqlWithRollback } from "../getFutureTableSchema";
import { getPGIndexes } from "../getPGIndexes";
import type { TableConfig } from "../TableConfig";

/**
 * Keep Postgres indexes in sync with table configuration
 * Save index definition hash in comment to detect changes
 * If no comment exists, create index in a transaction to compare definitions and then update comment
 * This ensures we don't drop and recreate indexes unnecessarily (which might also bring foreign key constraints issues)
 */
export const getIndexesQueries = async (
  db: DB,
  tableName: string,
  tableConf: TableConfig[string],
) => {
  const queries: string[] = [];
  if ("indexes" in tableConf && tableConf.indexes) {
    const currIndexes = await getPGIndexes(db, tableName, "public");

    for (const [
      indexName,
      { columns, concurrently, replace, unique, using, where = "" },
    ] of Object.entries(tableConf.indexes)) {
      const indexDefinition =
        [
          "CREATE",
          unique && "UNIQUE",
          concurrently && "CONCURRENTLY",
          `INDEX ${asName(indexName)} ON ${asName(tableName)}`,
          using && "USING " + using,
          `(${columns})`,
          where && `WHERE ${where}`,
        ]
          .filter((v) => v)
          .join(" ") + ";";
      const indexDefinitionHash = md5(indexDefinition) as string;
      const matchingIndex = currIndexes.find((idx) => idx.indexname === indexName);
      const indexExistsWithDifferentComment =
        matchingIndex && matchingIndex.description !== indexDefinitionHash;
      let indexExistsWithDifferentDefinition = indexExistsWithDifferentComment;
      if (indexExistsWithDifferentComment && !matchingIndex.description) {
        const futureIndexes = await executeSqlWithRollback(db, async (t) => {
          await t.any(`DROP INDEX IF EXISTS ${asName(indexName)};`);
          await t.any(indexDefinition);
          return getPGIndexes(t, tableName, "public");
        });
        indexExistsWithDifferentDefinition = !futureIndexes.some(
          (idx) => idx.indexname === indexName && matchingIndex.indexdef === idx.indexdef,
        );
      }
      const indexShouldBeReplaced =
        replace ||
        (typeof replace !== "boolean" && tableConf.replaceUniqueIndexes) ||
        indexExistsWithDifferentDefinition;
      if (indexShouldBeReplaced) {
        queries.push(`DROP INDEX IF EXISTS ${asName(indexName)};`);
      }

      if (
        indexExistsWithDifferentDefinition ||
        indexShouldBeReplaced ||
        !currIndexes.some((idx) => idx.indexname === indexName)
      ) {
        queries.push(indexDefinition);
        queries.push(`COMMENT ON INDEX ${asName(indexName)} IS ${asValue(indexDefinitionHash)};`);
      } else if (!matchingIndex?.description) {
        queries.push(`COMMENT ON INDEX ${asName(indexName)} IS ${asValue(indexDefinitionHash)};`);
      }
    }
  }
  return queries;
};

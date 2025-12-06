import { isDefined } from "prostgles-types";
import { log } from "../../PubSubManager/PubSubManagerUtils";
import type { DboBuilder, TableSchema } from "../DboBuilder";
import type { NewQuery } from "../QueryBuilder/QueryBuilder";

export const getViewRelatedTableJoinCondition = async ({
  dboBuilder,
  viewDefinition,
  viewTables,
  viewNameEscaped,
  newQuery,
}: {
  dboBuilder: DboBuilder;
  viewDefinition: string;
  viewNameEscaped: string;
  newQuery: NewQuery;
  viewTables: Map<
    number,
    {
      table: TableSchema;
      columns: {
        tableColumnOID: number;
        viewColumnName: string;
        tableColumnName: string;
      }[];
    }
  >;
}) => {
  const db = dboBuilder.db;
  const res = await Promise.all(
    Array.from(viewTables.entries()).map(async ([tableID, { table, columns }]) => {
      /** Exclude non comparable data types */
      const tableColumns = table.columns.map((tc) => {
        const viewColumnName = columns.find(
          (c) => c.tableColumnOID === tc.ordinal_position
        )?.viewColumnName;
        return {
          ...tc,
          viewColumnName,
        };
      });
      const primaryKeyColumns = tableColumns.filter((c) => c.is_pkey);
      const compareableColumns = tableColumns.filter(
        (c) => c.viewColumnName && !["json", "xml"].includes(c.udt_name)
      );
      const allPkeyColumnsInView =
        primaryKeyColumns.length && primaryKeyColumns.every((pk) => isDefined(pk.viewColumnName));

      const joinColumns = allPkeyColumnsInView ? primaryKeyColumns : compareableColumns;

      let condition = "TRUE";

      const tableName = table.name;
      if (joinColumns.length) {
        try {
          const { count } = await db.one<{ count: number }>(`
                    WITH ${tableName} AS (
                      SELECT * 
                      FROM ${tableName}
                      LIMIT 0
                    )
        
                    SELECT COUNT(*) as count
                    FROM (
                      ${viewDefinition}
                    ) prostgles_view_ref_table_test
                  `);

          const fullCondition = `
            EXISTS (
              SELECT 1
              FROM ${viewNameEscaped}
              WHERE ${joinColumns.map((c) => `${tableName}.${JSON.stringify(c.name)} = ${viewNameEscaped}.${JSON.stringify(c.viewColumnName)}`).join(" AND \n")}
              AND ${newQuery.whereOpts.condition || "TRUE"}
            )`;

          if (count.toString() === "0") {
            // return relatedTableSubscription;
            condition = fullCondition;
          }
        } catch (e) {
          log(
            `Could not not override subscribed view (${viewNameEscaped}) table (${tableName}). Will not check condition`,
            e
          );
        }
      }

      return {
        tableOID: tableID,
        tableName: tableName,
        tableNameEscaped: tableName,
        condition,
      };
    })
  );

  return res;
};

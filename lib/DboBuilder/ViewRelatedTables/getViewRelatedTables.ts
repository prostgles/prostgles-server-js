import type { ViewSubscriptionOptions } from "../../PubSubManager/PubSubManager";
import type { LocalParams, TableSchema } from "../DboBuilder";
import { getSerializedClientErrorFromPGError } from "../dboBuilderUtils";
import type { NewQuery } from "../QueryBuilder/QueryBuilder";
import type { ViewHandler } from "../ViewHandler/ViewHandler";
import { getAllViewRelatedTables } from "./getAllViewRelatedTables";
import { getViewRelatedTableJoinCondition } from "./getViewRelatedTableJoinCondition";

export const getViewRelatedTables = async (
  viewHandler: ViewHandler,
  localParams: LocalParams | undefined,
  newQuery: NewQuery,
) => {
  /** TODO: this needs to be memoized on schema fetch */
  const { name: viewName, dboBuilder } = viewHandler;

  /** Get list of used columns and their parent tables */
  const { view_definition = "" } = viewHandler.tableOrViewInfo;

  let definition = view_definition?.trim();
  if (definition?.endsWith(";")) {
    definition = definition.slice(0, -1);
  }
  if (!definition || typeof definition !== "string") {
    throw getSerializedClientErrorFromPGError("Could get view definition", {
      type: "tableMethod",
      localParams,
      view: this,
    });
  }
  const { fields } = await dboBuilder.runSQL(
    `SELECT * FROM ( \n ${definition} \n ) prostgles_subscribe_view_definition LIMIT 0`,
    {},
    { returnType: "default-with-rollback" },
  );

  const viewTables: Map<
    number,
    {
      table: TableSchema;
      columns: { tableColumnOID: number; viewColumnName: string; tableColumnName: string }[];
    }
  > = new Map();

  fields.forEach(({ name, tableID, columnID, columnName }) => {
    const table = dboBuilder.tablesOrViews?.find((tov) => tableID && tov.oid === tableID);
    if (name && tableID && columnID && columnName && table) {
      const tableInfo = viewTables.get(tableID) || { table, columns: [] };
      tableInfo.columns.push({
        viewColumnName: name,
        tableColumnOID: columnID,
        tableColumnName: columnName,
      });
      viewTables.set(tableID, tableInfo);
    }
  });

  /** Create exists filters for each table */
  const joinedRelatedTables = await getViewRelatedTableJoinCondition({
    dboBuilder,
    viewDefinition: definition,
    viewTables,
    viewNameEscaped: viewName,
    newQuery,
  });

  const viewOptions: ViewSubscriptionOptions = {
    type: "view",
    viewName,
    definition,
    relatedTables: [...joinedRelatedTables],
  };

  /** Get list of remaining used inner tables (tables whose columns do not appear in fields list but are still used by the view) */
  const allUsedTables = await getAllViewRelatedTables(dboBuilder.db, viewName);

  /** Remaining tables will have listeners on all records (condition = "TRUE") */
  allUsedTables.forEach((rt) => {
    if (!joinedRelatedTables.find((jt) => jt.tableOID === rt.table_oid)) {
      viewOptions.relatedTables.push({
        tableName: rt.table_name,
        tableNameEscaped: [rt.table_schema, rt.table_name].map((v) => JSON.stringify(v)).join("."),
        condition: "TRUE",
      });
    }
  });

  if (!viewOptions.relatedTables.length) {
    throw "Could not subscribe to this view: no related tables found";
  }

  return viewOptions;
};

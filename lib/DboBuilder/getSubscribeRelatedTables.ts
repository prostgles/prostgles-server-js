import type { AnyObject, ParsedJoinPath, SubscribeParams } from "prostgles-types";
import { asName, reverseParsedPath } from "prostgles-types";
import type { ParsedTableRule } from "../PublishParser/PublishParser";
import type { ViewSubscriptionOptions } from "../PubSubManager/PubSubManager";
import type { Filter, LocalParams } from "./DboBuilder";
import type { NewQuery } from "./QueryBuilder/QueryBuilder";
import type { TableHandler } from "./TableHandler/TableHandler";
import type { ViewHandler } from "./ViewHandler/ViewHandler";
import { getViewRelatedTables } from "./ViewRelatedTables/getViewRelatedTables";

type Args = {
  selectParams: Omit<SubscribeParams, "throttle">;
  filter: Filter;
  table_rules: ParsedTableRule<AnyObject, void> | undefined;
  localParams: LocalParams | undefined;
  newQuery: NewQuery;
};

/**
 * When subscribing to a view: identify underlying tables to subscribe to them
 * When subscribing to a table: identify joined tables to subscribe to them
 */
export async function getSubscribeRelatedTables(
  this: ViewHandler | TableHandler,
  { filter, localParams, newQuery }: Args
) {
  let viewOptions: ViewSubscriptionOptions | undefined = undefined;
  if (this.is_view) {
    viewOptions = await getViewRelatedTables(this, localParams, newQuery);
    /** Any joined table used within select or filter must also be added a trigger for this recordset */
  } else {
    viewOptions = {
      type: "table",
      relatedTables: [],
    };

    const nonExistsFilter = newQuery.whereOpts.exists.length ? {} : filter;
    const pushRelatedTable = async (relatedTableName: string, joinPath: ParsedJoinPath[]) => {
      const relatedTableOrViewHandler = this.dboBuilder.dbo[relatedTableName];
      if (!relatedTableOrViewHandler) {
        throw `Table ${relatedTableName} not found`;
      }

      const alreadyPushed = viewOptions?.relatedTables.find(
        (rt) => rt.tableName === relatedTableName
      );
      if (alreadyPushed || relatedTableOrViewHandler.is_view) {
        return;
      }

      viewOptions ??= {
        type: "table",
        relatedTables: [],
      };
      viewOptions.relatedTables.push({
        tableName: relatedTableName,
        tableNameEscaped: asName(relatedTableName),
        condition: (
          await relatedTableOrViewHandler.prepareWhere!({
            select: undefined,
            filter: {
              $existsJoined: {
                path: reverseParsedPath(joinPath, this.name),
                filter: nonExistsFilter,
              },
            },
            addWhere: false,
            localParams: undefined,
            tableRule: undefined,
          })
        ).where,
      });
    };

    /**
     * Avoid nested exists error. Will affect performance
     */
    for (const j of newQuery.joins ?? []) {
      await pushRelatedTable(j.table, j.joinPath);
    }
    for (const e of newQuery.whereOpts.exists.filter((e) => e.isJoined)) {
      if (!e.isJoined) throw `Not possible`;
      for (const [index, pathItem] of e.parsedPath.entries()) {
        await pushRelatedTable(pathItem.table, e.parsedPath.slice(0, index + 1));
      }
    }
    if (!viewOptions.relatedTables.length) {
      viewOptions = undefined;
    }
  }

  return viewOptions;
}

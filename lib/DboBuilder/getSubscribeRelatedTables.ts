import type { AnyObject, ParsedJoinPath, SubscribeParams } from "prostgles-types";
import { asName, isDefined, isEmpty, reverseParsedPath } from "prostgles-types";
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
  { filter, localParams, newQuery }: Args,
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
    const pushRelatedTable = async (
      relatedTableName: string,
      joinPath: ParsedJoinPath[],
      selectedColumnNames: string[] | undefined,
      targetTableFilter: Filter,
    ) => {
      const relatedTableOrViewHandler = this.dboBuilder.dboMap.get(relatedTableName);
      if (!relatedTableOrViewHandler) {
        throw `Table ${relatedTableName} not found`;
      }

      const alreadyPushed = viewOptions?.relatedTables.find(
        (rt) => rt.tableName === relatedTableName,
      );
      if (alreadyPushed || relatedTableOrViewHandler.is_view) {
        return;
      }

      viewOptions ??= {
        type: "table",
        relatedTables: [],
      };

      const reversedJoinFilter = {
        $existsJoined: {
          path: reverseParsedPath(joinPath, this.name),
          filter: nonExistsFilter,
        },
      };
      const filter =
        isEmpty(targetTableFilter) ? reversedJoinFilter : (
          { $and: [targetTableFilter, reversedJoinFilter] }
        );
      const joinConditionInfo = await relatedTableOrViewHandler.prepareWhere({
        select: undefined,
        filter,
        addWhere: false,
        localParams: undefined,
        tableRule: undefined,
      });

      const relatedTableJoinPathItem = joinPath.at(-1);
      const joinColumns =
        relatedTableJoinPathItem?.on.map((columnPair) => Object.values(columnPair)).flat() ?? [];

      const [firstField, ...otherFields] = Array.from(
        new Set([...(selectedColumnNames ?? []), ...joinColumns, ...joinConditionInfo.columnsUsed]),
      );

      viewOptions.relatedTables.push({
        tableName: relatedTableName,
        tableNameEscaped: asName(relatedTableName),
        tracked_columns: !firstField ? undefined : [firstField, ...otherFields],
        condition: joinConditionInfo.where,
      });
    };

    /**
     * Avoid nested exists error. Will affect performance
     */
    for (const j of newQuery.joins ?? []) {
      await pushRelatedTable(
        j.table.raw,
        j.joinPath,
        j.select.map((s) => (s.selected ? s.columnName : undefined)).filter(isDefined),
        {},
      );
    }
    for (const existsFilter of newQuery.whereOpts.exists.filter((e) => e.isJoined)) {
      for (const [index, pathItem] of existsFilter.parsedPath.entries()) {
        const isLast = index === existsFilter.parsedPath.length - 1;
        await pushRelatedTable(
          pathItem.table,
          existsFilter.parsedPath.slice(0, index + 1),
          undefined,
          isLast ? existsFilter.targetTableFilter : {},
        );
      }
    }
    if (!viewOptions.relatedTables.length) {
      viewOptions = undefined;
    }
  }

  return viewOptions;
}

import type { AnyObject, SubscribeParams } from "prostgles-types";
import { getJoinPathColumns, type ParsedJoinPath } from "./ViewHandler/parseJoinPath";
import { asName, isEmpty, reverseParsedPath } from "prostgles-types";
import type { ParsedTableRule } from "../PublishParser/PublishParser";
import type { ViewSubscriptionOptions } from "../PubSubManager/PubSubManager";
import type { Filter, LocalParams } from "./DboBuilder";
import type { NewQuery } from "./QueryBuilder/QueryBuilder";
import type { TableHandler } from "./TableHandler/TableHandler";
import type { ViewHandler } from "./ViewHandler/ViewHandler";
import { getViewRelatedTables } from "./ViewRelatedTables/getViewRelatedTables";
import type { AddTriggerParams } from "../PubSubManager/addTrigger";
import { prepareWhere } from "./ViewHandler/prepareWhere";
import { getAllViewRelatedTables } from "./ViewRelatedTables/getAllViewRelatedTables";

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
  let viewOptions: ViewSubscriptionOptions = { type: "table", relatedTables: [] };
  let hasComputedJoin = false as boolean;
  const rootJoinColumns = new Set<string>();
  const expandedViews = new Set<string>();
  const getRowPermissionTables = (query: NewQuery): string[] => [
    ...(query.source.rowPermissionTables ?? []),
    ...query.select.flatMap(
      (item) => item.dependencyExists?.flatMap((filter) => filter.rowPermissionTables ?? []) ?? [],
    ),
    ...(query.joins ?? []).flatMap((join) =>
      join.joinPath.flatMap((part) => part.source?.rowPermissionTables ?? []),
    ),
    ...(query.joins ?? []).flatMap(getRowPermissionTables),
  ];
  const rowPermissionTables = getRowPermissionTables(newQuery);
  const hasRowPermissions = !!rowPermissionTables.length;
  const nonExistsFilter = hasRowPermissions || newQuery.whereOpts.exists.length ? {} : filter;
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

    if (relatedTableOrViewHandler.isView) {
      if (expandedViews.has(relatedTableName)) return;
      expandedViews.add(relatedTableName);
      // View predicates can depend on columns that are not exposed by the view.
      for (const table of await getAllViewRelatedTables(this.dboBuilder, relatedTableName)) {
        await pushRelatedTable(table.name, [], undefined, {});
      }
      return;
    }

    const reversedJoinFilter =
      joinPath.length ?
        {
          $existsJoined: {
            path: reverseParsedPath(
              joinPath.map(({ table, on, computedJoin }) =>
                computedJoin ?
                  {
                    table,
                    on: computedJoin.definition.$joinName,
                    params: computedJoin.params,
                    ...(computedJoin.definition.tables[0] === computedJoin.definition.tables[1] && {
                      reversed: computedJoin.reversed,
                    }),
                  }
                : { table, on },
              ),
              this.name,
            ),
            filter: nonExistsFilter,
          },
        }
      : {};
    // Views can hide changed rows; self joins also need rows outside the trigger's transition tables.
    const needsUnfilteredTrigger =
      hasRowPermissions ||
      this.isView ||
      joinPath.some((path) => this.dboBuilder.dboMap.get(path.table)?.isView) ||
      (joinPath.length > 0 &&
        [this.name, ...joinPath.slice(0, -1).map((path) => path.table)].includes(relatedTableName));
    const filter =
      needsUnfilteredTrigger ? {}
      : isEmpty(targetTableFilter) ? reversedJoinFilter
      : { $and: [targetTableFilter, reversedJoinFilter] };
    const joinConditionInfo = await prepareWhere(relatedTableOrViewHandler, {
      filter,
      select: undefined,
      addWhere: false,
      localParams: undefined,
      tableRule: undefined,
    });

    const [firstField, ...otherFields] = Array.from(
      new Set([
        ...(selectedColumnNames ?? []),
        ...getJoinPathColumns(joinPath.at(-1)).target,
        ...joinConditionInfo.columnsUsed,
      ]),
    );
    const tracked_columns: AddTriggerParams["tracked_columns"] =
      hasRowPermissions || !firstField ? undefined : [firstField, ...otherFields];
    const condition = joinConditionInfo.where || "TRUE";

    const alreadyPushed = viewOptions.relatedTables.find(
      (rt) => rt.tableName === relatedTableName && rt.condition === condition,
    );
    if (alreadyPushed) {
      const [firstMerged, ...others] = Array.from(
        new Set([...(alreadyPushed.tracked_columns ?? []), ...(tracked_columns ?? [])]),
      );
      alreadyPushed.tracked_columns =
        alreadyPushed.tracked_columns && tracked_columns && firstMerged ?
          [firstMerged, ...others]
        : undefined;
      return;
    }
    viewOptions.relatedTables.push({
      tableName: relatedTableName,
      tableNameEscaped: asName(relatedTableName),
      tracked_columns,
      condition,
    });
  };

  const pushRelatedPath = async (
    joinPath: ParsedJoinPath[],
    selectedColumnNames: string[],
    targetTableFilter: Filter,
  ) => {
    hasComputedJoin ||= joinPath.some((path) => path.computedJoin);
    getJoinPathColumns(joinPath[0]).source.forEach((column) => rootJoinColumns.add(column));
    for (const [index, pathItem] of joinPath.entries()) {
      const isLast = index === joinPath.length - 1;
      await pushRelatedTable(
        pathItem.table,
        joinPath.slice(0, index + 1),
        isLast ? selectedColumnNames : getJoinPathColumns(joinPath[index + 1]).source,
        isLast ? targetTableFilter : {},
      );
    }
  };

  const subscribeQuery = async (query: NewQuery, parentPath: ParsedJoinPath[]) => {
    for (const join of query.joins ?? []) {
      const joinPath = [...parentPath, ...join.joinPath];
      const sortAliases = query.orderByItems.flatMap((item) =>
        item.nested?.joinAlias.raw === join.joinAlias.raw ? [item.nested.selectItemAlias] : [],
      );
      await pushRelatedPath(joinPath, getQueryColumns(join, sortAliases), {});
      await subscribeQuery(join, joinPath);
    }
    const dependencyExists = query.select
      .filter((item) => item.selected)
      .flatMap((item) => item.dependencyExists ?? []);
    for (const existsFilter of [...query.whereOpts.exists, ...dependencyExists]) {
      if (existsFilter.isJoined) {
        await pushRelatedPath(
          [...parentPath, ...existsFilter.parsedPath],
          existsFilter.targetTableColumns,
          existsFilter.targetTableFilter,
        );
      } else {
        await pushRelatedTable(
          existsFilter.targetTable,
          [],
          existsFilter.targetTableColumns,
          existsFilter.targetTableFilter,
        );
      }
    }
  };
  await subscribeQuery(newQuery, []);
  // Permission changes may affect rows outside the current client filter or join path.
  for (const tableName of new Set(rowPermissionTables)) {
    await pushRelatedTable(tableName, [], undefined, {});
  }
  // The root predicate can miss self-joined rows in transition tables. Its unfiltered
  // trigger must also track the root's selected, filtered, ordered and joined columns.
  const selfTrigger = viewOptions.relatedTables.find(
    (table) => table.tableName === this.name && table.condition === "TRUE",
  );
  if (selfTrigger?.tracked_columns) {
    const [firstField, ...otherFields] = [
      ...new Set([
        ...selfTrigger.tracked_columns,
        ...getQueryColumns(newQuery, []),
        ...rootJoinColumns,
      ]),
    ];
    selfTrigger.tracked_columns = firstField ? [firstField, ...otherFields] : undefined;
  }
  if (this.isView) {
    if (hasComputedJoin || hasRowPermissions) {
      await pushRelatedTable(this.name, [], undefined, {});
    } else {
      const rootViewOptions = await getViewRelatedTables(this, localParams, newQuery);
      rootViewOptions.relatedTables.push(...viewOptions.relatedTables);
      viewOptions = rootViewOptions;
    }
  }

  return {
    viewOptions: viewOptions.relatedTables.length ? viewOptions : undefined,
    rootJoinColumns: [...rootJoinColumns],
    hasRowPermissions,
  };
}

const getQueryColumns = (query: NewQuery, sortAliases: string[]) => [
  ...query.select
    .filter(
      (item) =>
        item.selected ||
        sortAliases.includes(item.alias) ||
        query.orderByItems.some((sort) => sort.key === item.alias),
    )
    .flatMap((item) => [...item.fields, ...(item.dependencyFields ?? [])]),
  ...query.whereOpts.columnsUsed,
  ...query.orderByItems.map((item) => item.key).filter((key) => query.allFields.includes(key)),
];

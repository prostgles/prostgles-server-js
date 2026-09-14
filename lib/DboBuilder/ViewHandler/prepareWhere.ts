import type { AnyObject, FieldFilter, SelectParams } from "prostgles-types/dist";
import { getKeys, isDefined, isObject } from "prostgles-types/dist";
import type { ParsedTableRule } from "../../PublishParser/PublishParser";
import type { ExistsFilterConfig, Filter, LocalParams, PGIdentifier } from "../DboBuilder";
import { getCondition } from "../getCondition";
import { type SelectItemValidated } from "../QueryBuilder/QueryBuilder";
import { getQuerySource, type QuerySource } from "../QueryBuilder/getQuerySource";
import type { ViewHandler } from "./ViewHandler";

export type PrepareWhereParams = {
  filter?: Filter;
  select: SelectItemValidated[] | undefined;
  forcedFilter?: AnyObject;
  filterFields?: FieldFilter;
  addWhere?: boolean;
  tableAlias?: PGIdentifier;
  localParams: LocalParams | undefined;
  tableRule: ParsedTableRule | undefined;
  isHaving?: boolean;
  selectParams?: SelectParams;
};

export type WhereOptions = {
  columnsUsed: string[];
  condition: string;
  where: string;
  filter: AnyObject;
  exists: ExistsFilterConfig[];
  source: QuerySource;
};

export const prepareWhere = async (
  viewHandler: ViewHandler,
  {
    filter,
    select,
    forcedFilter,
    addWhere: addKeywords = true,
    tableAlias,
    localParams,
    tableRule,
    /* Local update allow all. TODO: tidy all calls */
    filterFields = !tableRule ? "*" : undefined,
    isHaving,
    selectParams,
  }: PrepareWhereParams,
): Promise<WhereOptions> => {
  const { $and: $and_key, $or: $or_key } = viewHandler.dboBuilder.prostgles.keywords;

  if (localParams?.isRemoteRequest && !tableRule) {
    throw "Unexpected: localParams isRemoteRequest and missing tableRule";
  }

  const source = await getQuerySource(
    viewHandler,
    selectParams ? tableRule : undefined,
    filter ?? {},
    selectParams ?? {},
    tableAlias,
  );

  const exists: ExistsFilterConfig[] = [];

  type FilterItemResult = { condition: string; columnsUsed: string[] };
  const parseFullFilter = async (
    fullFilter: any,
    parentFilter: AnyObject | null = null,
    isForcedFilterBypass: boolean,
  ): Promise<FilterItemResult | undefined> => {
    if (!fullFilter) throw "Invalid/missing group filter provided";
    if (!isObject(fullFilter))
      throw "\nInvalid filter\nExpecting an object but got -> " + JSON.stringify(fullFilter);

    const keys = getKeys(fullFilter);
    if (!keys.length) {
      return;
    }
    if (keys.includes($and_key) || keys.includes($or_key)) {
      if (keys.length > 1)
        throw `\ngroup filter must contain only one array property. e.g.: { ${$and_key}: [...] } OR { ${$or_key}: [...] } `;
      if (parentFilter && Object.keys(parentFilter).includes(""))
        throw "group filter ($and/$or) can only be placed at the root or within another group filter";
    }

    const { [$and_key]: $and, [$or_key]: $or } = fullFilter;
    const group = ($and || $or) as AnyObject[] | undefined;

    if (group && group.length) {
      const operand = $and ? " AND " : " OR ";
      const conditionItems = (
        await Promise.all(
          group.map(async (gf) => await parseFullFilter(gf, group, isForcedFilterBypass)),
        )
      )
        .filter(isDefined)
        .filter((c) => c.condition);

      if (conditionItems.length) {
        const conditions = conditionItems.map((c) => c.condition);
        const columnsUsed = conditionItems.map((c) => c.columnsUsed).flat();
        if (conditions.length === 1) {
          return { columnsUsed, condition: conditions.join(operand) };
        }
        return { columnsUsed, condition: ` ( ${conditions.sort().join(operand)} ) ` };
      }
    } else if (!group) {
      /** forcedFilters do not get checked against publish and are treated as server-side requests */
      const itemInfo = await getCondition.bind(viewHandler)({
        filter: { ...fullFilter },
        select,
        allowed_colnames:
          isForcedFilterBypass ?
            viewHandler.column_names.slice(0)
          : viewHandler.parseFieldFilter(filterFields),
        tableAlias: source.alias,
        localParams: isForcedFilterBypass ? undefined : localParams,
        tableRules: isForcedFilterBypass ? undefined : tableRule,
        isHaving,
      });
      exists.push(...itemInfo.exists);
      return {
        condition: itemInfo.condition,
        columnsUsed: itemInfo.columnsUsed,
      };
    }
  };

  /* A forced filter condition will not check if the existsJoined filter tables have been published */
  const forcedFilterCond =
    forcedFilter ? await parseFullFilter(forcedFilter, null, true) : undefined;
  const filterCond = await parseFullFilter(filter, null, false);
  let combinedConditions = [forcedFilterCond, filterCond]
    .map((c) => (c?.condition ? c.condition : undefined))
    .filter(isDefined)
    .join(" AND ");

  const combinedColumnsUsed = [
    ...(forcedFilterCond?.columnsUsed ?? []),
    ...(filterCond?.columnsUsed ?? []),
  ];
  const finalFilter =
    forcedFilter ?
      {
        [$and_key]: [forcedFilter, filter].filter(isDefined),
      }
    : { ...filter };

  const condition = combinedConditions;
  if (combinedConditions && addKeywords) {
    combinedConditions = `WHERE ${combinedConditions}`;
  }
  return {
    columnsUsed: combinedColumnsUsed,
    condition,
    where: combinedConditions || "",
    filter: finalFilter,
    exists,
    source,
  };
};
